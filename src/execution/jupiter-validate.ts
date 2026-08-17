import { getBase58Decoder } from '@solana/kit';
import {
  COMPUTE_BUDGET_PROGRAM_ID,
  EXECUTION_MAX_INSTRUCTION_ACCOUNTS,
  EXECUTION_MAX_LOOKUP_TABLE_ADDRESSES,
  EXECUTION_MAX_LOOKUP_TABLES,
  EXECUTION_MAX_ROUTE_HOPS,
  EXECUTION_ROUTE_PLAN_TOTAL_BPS,
  EXECUTION_SLIPPAGE_BPS,
  EXECUTION_SWAP_MODE,
} from './constants.js';
import { decodeComputeBudgetInstruction } from './compute.js';
import { ExecutionError } from './errors.js';
import { isCanonicalAmountRaw, isCanonicalSolanaAddress } from './intent.js';
import type {
  ExecutionIntent,
  NormalizedInstruction,
  NormalizedJupiterBuild,
  NormalizedLookupTables,
  NormalizedRouteHop,
} from './types.js';

const FETCHED_AT_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

export function validateJupiterBuild(
  payload: unknown,
  intent: ExecutionIntent,
): NormalizedJupiterBuild {
  const record = asRecord(payload, 'Jupiter /build response');
  rejectNonFiniteNumbers(record, 'Jupiter /build response');

  const inputMint = requireString(record, 'inputMint');
  const outputMint = requireString(record, 'outputMint');
  const inAmount = requireString(record, 'inAmount');
  if (inputMint !== intent.inputMint || outputMint !== intent.outputMint || inAmount !== intent.amountRaw) {
    throw new ExecutionError('Jupiter /build response does not match the requested ExactIn intent.', {
      code: 'provider_invalid_response',
    });
  }

  const outAmount = requireCanonicalAmount(record, 'outAmount');
  const otherAmountThreshold = requireCanonicalAmount(record, 'otherAmountThreshold');
  if (BigInt(otherAmountThreshold) > BigInt(outAmount)) {
    throw new ExecutionError('Jupiter otherAmountThreshold exceeds quoted outAmount.', {
      code: 'provider_invalid_response',
    });
  }

  const swapMode = requireString(record, 'swapMode');
  if (swapMode !== EXECUTION_SWAP_MODE) {
    throw new ExecutionError('Jupiter /build must return ExactIn. e14 does not accept another swap mode.', {
      code: 'provider_contract_changed',
    });
  }

  const slippageBps = requireSafeInteger(record, 'slippageBps');
  if (slippageBps !== EXECUTION_SLIPPAGE_BPS) {
    throw new ExecutionError('Jupiter slippageBps does not match the frozen e14 100 bps contract.', {
      code: 'provider_invalid_response',
    });
  }

  if (record['tipInstruction'] !== undefined && record['tipInstruction'] !== null) {
    throw new ExecutionError('Jupiter returned a tip instruction after e14 requested no tip.', {
      code: 'provider_contract_changed',
    });
  }

  const routePlan = normalizeRoutePlan(record['routePlan'], intent.inputMint, intent.outputMint);
  const computeBudgetInstructions = requireArray(record, 'computeBudgetInstructions');
  const setupInstructions = requireArray(record, 'setupInstructions').map((item, index) =>
    normalizeInstruction(item, `setupInstructions[${String(index)}]`),
  );
  const swapInstruction = normalizeInstruction(record['swapInstruction'], 'swapInstruction');
  const cleanupInstruction =
    record['cleanupInstruction'] === null || record['cleanupInstruction'] === undefined
      ? null
      : normalizeInstruction(record['cleanupInstruction'], 'cleanupInstruction');
  const otherInstructions = requireArray(record, 'otherInstructions').map((item, index) =>
    normalizeInstruction(item, `otherInstructions[${String(index)}]`),
  );
  const computeUnitPrice = validateComputeBudgetInstructions(computeBudgetInstructions);
  const decodedPrice = decodeComputeBudgetInstruction(computeUnitPrice);
  if (decodedPrice.kind !== 'set_compute_unit_price') {
    throw new ExecutionError('Jupiter compute-budget instruction is not a SetComputeUnitPrice.', {
      code: 'provider_contract_changed',
    });
  }

  const lookupTables = normalizeLookupTables(record['addressesByLookupTableAddress']);
  assertNoSignerInLookupTables(lookupTables, intent.takerPublicKey);
  const blockhash = normalizeBlockhash(record['blockhashWithMetadata']);

  const normalized: NormalizedJupiterBuild = {
    inputMint,
    outputMint,
    inAmount,
    outAmount,
    otherAmountThreshold,
    swapMode: EXECUTION_SWAP_MODE,
    slippageBps: EXECUTION_SLIPPAGE_BPS,
    routePlan,
    computeUnitPrice,
    computeUnitPriceMicroLamports: decodedPrice.microLamports,
    setupInstructions,
    swapInstruction,
    cleanupInstruction,
    otherInstructions,
    lookupTables,
    blockhash,
  };

  const unexpectedSigner = findUnexpectedSigner(normalized, intent.takerPublicKey);
  if (unexpectedSigner !== null) {
    throw new ExecutionError(
      'Jupiter requires a signer other than the configured public taker. e14 does not generate another signer.',
      { code: 'unsupported_signer_requirement' },
    );
  }

  return normalized;
}

export function findUnexpectedSigner(
  build: NormalizedJupiterBuild,
  takerPublicKey: string,
): string | null {
  const instructions = [
    build.computeUnitPrice,
    ...build.setupInstructions,
    build.swapInstruction,
    ...(build.cleanupInstruction === null ? [] : [build.cleanupInstruction]),
    ...build.otherInstructions,
  ];
  for (const instruction of instructions) {
    for (const account of instruction.accounts) {
      if (account.isSigner && account.pubkey !== takerPublicKey) {
        return account.pubkey;
      }
    }
  }
  return null;
}

function validateComputeBudgetInstructions(items: readonly unknown[]): NormalizedInstruction {
  if (items.length === 0) {
    throw new ExecutionError('Jupiter omitted compute-budget instructions. e14 requires a CU price.', {
      code: 'provider_contract_changed',
    });
  }

  const normalized = items.map((item, index) =>
    normalizeInstruction(item, `computeBudgetInstructions[${String(index)}]`),
  );
  let price: NormalizedInstruction | null = null;
  for (const instruction of normalized) {
    if (instruction.programId !== COMPUTE_BUDGET_PROGRAM_ID) {
      throw new ExecutionError('Jupiter compute-budget instruction used an unexpected program id.', {
        code: 'provider_contract_changed',
      });
    }
    const decoded = decodeComputeBudgetInstruction(instruction);
    if (decoded.kind === 'set_compute_unit_limit') {
      throw new ExecutionError(
        'Jupiter supplied a compute-unit limit that conflicts with the e14 CU policy.',
        { code: 'provider_contract_changed' },
      );
    }
    if (decoded.kind === 'set_compute_unit_price') {
      if (price !== null) {
        throw new ExecutionError('Jupiter supplied duplicate SetComputeUnitPrice instructions.', {
          code: 'provider_contract_changed',
        });
      }
      price = instruction;
      continue;
    }
    if (decoded.kind === 'request_heap_frame' || decoded.kind === 'set_loaded_accounts_data_size_limit') {
      throw new ExecutionError(
        'Jupiter supplied a Compute Budget variant that e14 does not preserve. Treating this as provider_contract_changed rather than silently dropping it.',
        { code: 'provider_contract_changed' },
      );
    }
    throw new ExecutionError('Jupiter supplied an unexpected compute-budget instruction type.', {
      code: 'provider_contract_changed',
    });
  }
  if (price === null) {
    throw new ExecutionError('Jupiter compute-budget instructions did not include SetComputeUnitPrice.', {
      code: 'provider_contract_changed',
    });
  }
  return price;
}

function normalizeRoutePlan(value: unknown, inputMint: string, outputMint: string): NormalizedRouteHop[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ExecutionError('Jupiter routePlan must be a non-empty array.', {
      code: 'provider_invalid_response',
    });
  }
  if (value.length > EXECUTION_MAX_ROUTE_HOPS) {
    throw new ExecutionError('Jupiter routePlan exceeds the e14 hop bound.', {
      code: 'provider_invalid_response',
    });
  }

  const hops = value.map((item, index) => normalizeRouteHop(item, `routePlan[${String(index)}]`));
  const firstLevel = hops.filter((hop) => hop.inputMint === inputMint);
  if (firstLevel.length === 0) {
    throw new ExecutionError('Jupiter routePlan does not start from the requested input mint.', {
      code: 'provider_invalid_response',
    });
  }
  const totalBps = firstLevel.reduce((sum, hop) => sum + hop.bps, 0);
  if (totalBps !== EXECUTION_ROUTE_PLAN_TOTAL_BPS) {
    throw new ExecutionError('Jupiter routePlan first-level bps must total 10000.', {
      code: 'provider_invalid_response',
    });
  }
  if (!hops.some((hop) => hop.outputMint === outputMint)) {
    throw new ExecutionError('Jupiter routePlan does not include a hop that outputs the requested output mint.', {
      code: 'provider_invalid_response',
    });
  }
  return hops;
}

function normalizeRouteHop(value: unknown, path: string): NormalizedRouteHop {
  const record = asRecord(value, path);
  const swapInfo = asRecord(record['swapInfo'], `${path}.swapInfo`);
  const bps = requireSafeInteger(record, 'bps', path);
  if (bps < 0 || bps > EXECUTION_ROUTE_PLAN_TOTAL_BPS) {
    throw new ExecutionError(`${path}.bps must be an integer between 0 and 10000.`, {
      code: 'provider_invalid_response',
    });
  }
  return {
    ammKey: requireAddress(swapInfo, 'ammKey', `${path}.swapInfo`),
    label: requireString(swapInfo, 'label', `${path}.swapInfo`),
    inputMint: requireAddress(swapInfo, 'inputMint', `${path}.swapInfo`),
    outputMint: requireAddress(swapInfo, 'outputMint', `${path}.swapInfo`),
    inAmount: requireCanonicalAmount(swapInfo, 'inAmount', `${path}.swapInfo`),
    outAmount: requireCanonicalAmount(swapInfo, 'outAmount', `${path}.swapInfo`),
    bps,
  };
}

export function normalizeInstruction(value: unknown, path: string): NormalizedInstruction {
  const record = asRecord(value, path);
  const accountsValue = requireArray(record, 'accounts', path);
  if (accountsValue.length > EXECUTION_MAX_INSTRUCTION_ACCOUNTS) {
    throw new ExecutionError(`${path}.accounts exceeds the e14 account bound.`, {
      code: 'provider_invalid_response',
    });
  }
  return {
    programId: requireAddress(record, 'programId', path),
    accounts: accountsValue.map((item, index) => {
      const account = asRecord(item, `${path}.accounts[${String(index)}]`);
      const isWritable = account['isWritable'];
      const isSigner = account['isSigner'];
      if (typeof isWritable !== 'boolean' || typeof isSigner !== 'boolean') {
        throw new ExecutionError(`${path}.accounts[${String(index)}] has malformed signer/writable metadata.`, {
          code: 'provider_invalid_response',
        });
      }
      return {
        pubkey: requireAddress(account, 'pubkey', `${path}.accounts[${String(index)}]`),
        isWritable,
        isSigner,
      };
    }),
    dataBase64: requireBase64(record, 'data', path),
  };
}

function normalizeLookupTables(value: unknown): NormalizedLookupTables {
  if (value === null || value === undefined) {
    return {};
  }
  const record = asRecord(value, 'addressesByLookupTableAddress');
  const keys = Object.keys(record);
  if (keys.length > EXECUTION_MAX_LOOKUP_TABLES) {
    throw new ExecutionError('Jupiter lookup-table mapping exceeds the e14 table bound.', {
      code: 'provider_invalid_response',
    });
  }
  const tables: Record<string, readonly string[]> = {};
  for (const key of keys.sort()) {
    if (!isCanonicalSolanaAddress(key)) {
      throw new ExecutionError('Jupiter lookup-table address is not a valid Solana address.', {
        code: 'provider_invalid_response',
      });
    }
    const addresses = record[key];
    if (!Array.isArray(addresses)) {
      throw new ExecutionError('Jupiter lookup-table mapping must be an array of addresses.', {
        code: 'provider_invalid_response',
      });
    }
    if (addresses.length > EXECUTION_MAX_LOOKUP_TABLE_ADDRESSES) {
      throw new ExecutionError('Jupiter lookup-table address list exceeds the e14 bound.', {
        code: 'provider_invalid_response',
      });
    }
    if (addresses.length === 0) {
      throw new ExecutionError('Jupiter lookup-table mapping contained an empty address list.', {
        code: 'provider_invalid_response',
      });
    }
    tables[key] = addresses.map((item, index) => {
      if (typeof item !== 'string' || !isCanonicalSolanaAddress(item)) {
        throw new ExecutionError(
          `Jupiter lookup-table contained an invalid account at index ${String(index)}.`,
          { code: 'provider_invalid_response' },
        );
      }
      return item;
    });
  }
  return tables;
}

export function assertNoSignerInLookupTables(
  tables: NormalizedLookupTables,
  takerPublicKey: string,
): void {
  for (const addresses of Object.values(tables)) {
    if (addresses.includes(takerPublicKey)) {
      throw new ExecutionError(
        'Jupiter lookup-table mapping included the taker. e14 does not compress the required signer through an ALT.',
        { code: 'unsupported_signer_requirement' },
      );
    }
  }
}

function normalizeBlockhash(value: unknown): NormalizedJupiterBuild['blockhash'] {
  const record = asRecord(value, 'blockhashWithMetadata');
  const rawBlockhash = record['blockhash'];
  if (!Array.isArray(rawBlockhash) || rawBlockhash.length !== 32) {
    throw new ExecutionError('Jupiter blockhash must be a 32-byte array.', {
      code: 'provider_invalid_response',
    });
  }
  const blockhashItems: readonly unknown[] = rawBlockhash;
  const bytes = new Uint8Array(32);
  const blockhashBytes: number[] = [];
  for (let index = 0; index < 32; index += 1) {
    if (!Object.hasOwn(blockhashItems, index)) {
      throw new ExecutionError(`Jupiter blockhash byte ${String(index)} is missing.`, {
        code: 'provider_invalid_response',
      });
    }
    const item: unknown = blockhashItems[index];
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 0 || item > 255) {
      throw new ExecutionError(`Jupiter blockhash byte ${String(index)} is invalid.`, {
        code: 'provider_invalid_response',
      });
    }
    bytes[index] = item;
    blockhashBytes.push(item);
  }
  const lastValidBlockHeight = requireSafeInteger(record, 'lastValidBlockHeight', 'blockhashWithMetadata');
  if (lastValidBlockHeight < 0) {
    throw new ExecutionError('Jupiter lastValidBlockHeight must be a non-negative integer.', {
      code: 'provider_invalid_response',
    });
  }
  const fetchedAt = requireString(record, 'fetchedAt', 'blockhashWithMetadata');
  if (!FETCHED_AT_PATTERN.test(fetchedAt) || Number.isNaN(Date.parse(fetchedAt))) {
    throw new ExecutionError('Jupiter blockhash fetchedAt must be a valid ISO-8601 timestamp.', {
      code: 'provider_invalid_response',
    });
  }
  return {
    blockhashBytes,
    blockhashBase58: getBase58Decoder().decode(bytes),
    lastValidBlockHeight: BigInt(lastValidBlockHeight),
    fetchedAt,
  };
}

function asRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ExecutionError(`${path} must be an object.`, { code: 'provider_invalid_response' });
  }
  return value as Record<string, unknown>;
}

function requireArray(record: Record<string, unknown>, key: string, path = key): unknown[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    throw new ExecutionError(`${path} must be an array.`, { code: 'provider_invalid_response' });
  }
  return value;
}

function requireString(record: Record<string, unknown>, key: string, path = key): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim() !== value || value === '') {
    throw new ExecutionError(`${path} must be a non-empty string.`, {
      code: 'provider_invalid_response',
    });
  }
  return value;
}

function requireAddress(record: Record<string, unknown>, key: string, path: string): string {
  const value = requireString(record, key, `${path}.${key}`);
  if (!isCanonicalSolanaAddress(value)) {
    throw new ExecutionError(`${path}.${key} is not a valid Solana address.`, {
      code: 'provider_invalid_response',
    });
  }
  return value;
}

function requireCanonicalAmount(record: Record<string, unknown>, key: string, path = key): string {
  const value = requireString(record, key, `${path}.${key}`);
  if (!isCanonicalAmountRaw(value)) {
    throw new ExecutionError(`${path}.${key} must be a canonical positive integer string.`, {
      code: 'provider_invalid_response',
    });
  }
  return value;
}

function requireBase64(record: Record<string, unknown>, key: string, path: string): string {
  const value = record[key];
  if (typeof value !== 'string') {
    throw new ExecutionError(`${path}.${key} must be base64.`, { code: 'provider_invalid_response' });
  }
  if (value === '') {
    return value;
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ExecutionError(`${path}.${key} is not valid base64.`, {
      code: 'provider_invalid_response',
    });
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new ExecutionError(`${path}.${key} is not canonical base64.`, {
      code: 'provider_invalid_response',
    });
  }
  return value;
}

function requireSafeInteger(record: Record<string, unknown>, key: string, path = key): number {
  const value = record[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new ExecutionError(`${path}.${key} must be a finite integer.`, {
      code: 'provider_invalid_response',
    });
  }
  return value;
}

function rejectNonFiniteNumbers(value: unknown, path: string): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new ExecutionError(`${path} contains a non-finite number.`, {
      code: 'provider_invalid_response',
    });
  }
  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      rejectNonFiniteNumbers(item, `${path}[${String(index)}]`);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      rejectNonFiniteNumbers(item, `${path}.${key}`);
    }
  }
}
