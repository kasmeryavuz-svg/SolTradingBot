import {
  COMPUTE_BUDGET_PROGRAM_ID,
  COMPUTE_BUDGET_REQUEST_HEAP_FRAME_DISCRIMINATOR,
  COMPUTE_BUDGET_SET_LIMIT_DISCRIMINATOR,
  COMPUTE_BUDGET_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT_DISCRIMINATOR,
  COMPUTE_BUDGET_SET_PRICE_DISCRIMINATOR,
  COMPUTE_UNIT_HARD_MAX,
  COMPUTE_UNIT_MARGIN_DENOMINATOR,
  COMPUTE_UNIT_MARGIN_NUMERATOR,
} from './constants.js';
import { ExecutionError } from './errors.js';
import type { NormalizedInstruction } from './types.js';

export type FinalComputeLimitResult =
  | { readonly kind: 'ok'; readonly finalLimit: number }
  | { readonly kind: 'blocked_compute_limit'; readonly simulatedUnits: bigint };

export function calculateFinalComputeLimit(simulatedUnits: bigint): FinalComputeLimitResult {
  if (simulatedUnits >= BigInt(COMPUTE_UNIT_HARD_MAX)) {
    return { kind: 'blocked_compute_limit', simulatedUnits };
  }

  const uncapped =
    (simulatedUnits * COMPUTE_UNIT_MARGIN_NUMERATOR + (COMPUTE_UNIT_MARGIN_DENOMINATOR - 1n)) /
    COMPUTE_UNIT_MARGIN_DENOMINATOR;
  const capped = uncapped > BigInt(COMPUTE_UNIT_HARD_MAX) ? BigInt(COMPUTE_UNIT_HARD_MAX) : uncapped;
  const finalLimit = Number(capped);
  if (!Number.isSafeInteger(finalLimit) || finalLimit <= Number(simulatedUnits)) {
    return { kind: 'blocked_compute_limit', simulatedUnits };
  }
  return { kind: 'ok', finalLimit };
}

export function encodeSetComputeUnitLimit(units: number): Uint8Array {
  if (!Number.isInteger(units) || units <= 0 || units > COMPUTE_UNIT_HARD_MAX) {
    throw new ExecutionError('Invalid compute-unit limit for the e14 preflight contract.', {
      code: 'invalid_compute_limit',
    });
  }
  const data = new Uint8Array(5);
  const view = new DataView(data.buffer);
  view.setUint8(0, COMPUTE_BUDGET_SET_LIMIT_DISCRIMINATOR);
  view.setUint32(1, units, true);
  return data;
}

export function decodeComputeBudgetInstruction(instruction: NormalizedInstruction):
  | { readonly kind: 'set_compute_unit_limit'; readonly units: number }
  | { readonly kind: 'set_compute_unit_price'; readonly microLamports: bigint }
  | { readonly kind: 'request_heap_frame' }
  | { readonly kind: 'set_loaded_accounts_data_size_limit' }
  | { readonly kind: 'unexpected' } {
  if (instruction.programId !== COMPUTE_BUDGET_PROGRAM_ID) {
    return { kind: 'unexpected' };
  }
  const data = decodeBase64Exact(instruction.dataBase64);
  if (data.length === 5 && data[0] === COMPUTE_BUDGET_SET_LIMIT_DISCRIMINATOR) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { kind: 'set_compute_unit_limit', units: view.getUint32(1, true) };
  }
  if (data.length === 9 && data[0] === COMPUTE_BUDGET_SET_PRICE_DISCRIMINATOR) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    return { kind: 'set_compute_unit_price', microLamports: view.getBigUint64(1, true) };
  }
  if (data[0] === COMPUTE_BUDGET_REQUEST_HEAP_FRAME_DISCRIMINATOR) {
    return { kind: 'request_heap_frame' };
  }
  if (data[0] === COMPUTE_BUDGET_SET_LOADED_ACCOUNTS_DATA_SIZE_LIMIT_DISCRIMINATOR) {
    return { kind: 'set_loaded_accounts_data_size_limit' };
  }
  return { kind: 'unexpected' };
}

export function decodeBase64Exact(value: string): Uint8Array {
  if (value === '') {
    return new Uint8Array();
  }
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    throw new ExecutionError('Instruction data is not valid base64.', {
      code: 'provider_invalid_response',
    });
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new ExecutionError('Instruction data is not canonical base64.', {
      code: 'provider_invalid_response',
    });
  }
  return new Uint8Array(decoded);
}

export function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}
