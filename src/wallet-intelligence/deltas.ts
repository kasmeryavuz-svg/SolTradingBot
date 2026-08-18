import { SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import { canonicalRawAmount, compareCodePoint, isRecord, parseDecimals, parseNonNegativeRawAmount } from './numbers.js';
import type { MintRawDelta, TokenBalanceEvidence, TokenDeltaKind, WalletTokenDeltaProjection } from './types.js';

type IndexedWalletBalance = {
  accountIndex: number;
  mint: string;
  owner: string;
  programId: string;
  amount: bigint;
  decimals: number;
};

export function projectWalletTokenDeltas(input: {
  walletAddress: string;
  signature: string;
  slot: number;
  transactionIndex: number;
  blockTime: number | null;
  preTokenBalances: readonly TokenBalanceEvidence[] | null;
  postTokenBalances: readonly TokenBalanceEvidence[] | null;
}): WalletTokenDeltaProjection {
  if (input.preTokenBalances === null || input.postTokenBalances === null) {
    return incompleteProjection(input);
  }
  const pre = indexWalletBalances(input.walletAddress, input.preTokenBalances, 'preTokenBalances');
  const post = indexWalletBalances(input.walletAddress, input.postTokenBalances, 'postTokenBalances');
  if (pre.incomplete || post.incomplete) {
    return incompleteProjection(input);
  }
  const keys = new Set([...pre.byAccount.keys(), ...post.byAccount.keys()]);
  const mintNet = new Map<string, bigint>();
  for (const key of keys) {
    const before = pre.byAccount.get(key);
    const after = post.byAccount.get(key);
    if (before === undefined || after === undefined) {
      return incompleteProjection(input);
    }
    if (!identitiesMatch(before, after)) {
      return incompleteProjection(input);
    }
    addMintDelta(mintNet, before.mint, after.amount - before.amount);
  }
  const mintDeltas: MintRawDelta[] = [...mintNet.entries()]
    .map(([mint, netRawDelta]) => ({ mint, netRawDelta: canonicalRawAmount(netRawDelta) }))
    .sort((left, right) => compareCodePoint(left.mint, right.mint));
  return {
    signature: input.signature,
    slot: input.slot,
    transactionIndex: input.transactionIndex,
    blockTime: input.blockTime,
    kind: classifyDeltaKind(mintDeltas),
    mintDeltas,
    incomplete: false,
  };
}

export function parseTokenBalanceEvidence(value: unknown, field: string): TokenBalanceEvidence {
  if (!isRecord(value)) {
    throw new WalletIntelligenceError(`Invalid ${field}. Expected a token-balance object.`, {
      code: 'provider_integrity_failure',
    });
  }
  const accountIndex = value['accountIndex'];
  if (typeof accountIndex !== 'number' || !Number.isInteger(accountIndex) || accountIndex < 0) {
    throw new WalletIntelligenceError(`Invalid ${field} accountIndex.`, { code: 'provider_integrity_failure' });
  }
  const mint = value['mint'];
  if (typeof mint !== 'string' || mint.trim() === '') {
    throw new WalletIntelligenceError(`Invalid ${field} mint.`, { code: 'provider_integrity_failure' });
  }
  const owner = value['owner'];
  const programId = value['programId'];
  const uiTokenAmount = value['uiTokenAmount'];
  if (!isRecord(uiTokenAmount)) {
    throw new WalletIntelligenceError(`Invalid ${field} uiTokenAmount.`, { code: 'provider_integrity_failure' });
  }
  return {
    accountIndex,
    mint,
    owner: typeof owner === 'string' && owner.trim() !== '' ? owner : null,
    programId: typeof programId === 'string' && programId.trim() !== '' ? programId : null,
    amountRaw: parseNonNegativeRawAmount(uiTokenAmount['amount'], `${field} amount`),
    decimals: parseDecimals(uiTokenAmount['decimals'], `${field} decimals`),
  };
}

export function extractJsonParsedAccountKeys(message: unknown, meta: unknown): string[] | null {
  if (!isRecord(message)) {
    return null;
  }
  const rawKeys = message['accountKeys'];
  if (!Array.isArray(rawKeys)) {
    return null;
  }
  const staticKeys: string[] = [];
  for (const key of rawKeys) {
    const parsed = parseAccountKey(key);
    if (parsed === null) {
      return null;
    }
    staticKeys.push(parsed);
  }
  if (!isRecord(meta) || !isRecord(meta['loadedAddresses'])) {
    return staticKeys;
  }
  const loaded = meta['loadedAddresses'];
  const writable = parseLoadedAddressList(loaded['writable']);
  const readonly = parseLoadedAddressList(loaded['readonly']);
  if (writable === null || readonly === null) {
    return null;
  }
  return [...staticKeys, ...writable, ...readonly];
}

function parseAccountKey(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }
  if (isRecord(value) && typeof value['pubkey'] === 'string' && value['pubkey'].trim() !== '') {
    return value['pubkey'];
  }
  return null;
}

function parseLoadedAddressList(value: unknown): string[] | null {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    return null;
  }
  const keys: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim() === '') {
      return null;
    }
    keys.push(item);
  }
  return keys;
}

function indexWalletBalances(
  walletAddress: string,
  balances: readonly TokenBalanceEvidence[],
  field: string,
): {
  byAccount: Map<string, IndexedWalletBalance>;
  incomplete: boolean;
} {
  const byAccount = new Map<string, IndexedWalletBalance>();
  for (const balance of balances) {
    if (balance.owner === null) {
      return { byAccount, incomplete: true };
    }
    if (balance.owner !== walletAddress) {
      continue;
    }
    if (balance.programId === null || !isSupportedTokenProgramId(balance.programId)) {
      return { byAccount, incomplete: true };
    }
    const key = `${String(balance.accountIndex)}:${balance.mint}:${balance.owner}`;
    if (byAccount.has(key)) {
      throw new WalletIntelligenceError(`Duplicate ${field} row for the same account index and mint.`, {
        code: 'provider_integrity_failure',
      });
    }
    byAccount.set(key, {
      accountIndex: balance.accountIndex,
      mint: balance.mint,
      owner: balance.owner,
      programId: balance.programId,
      amount: BigInt(balance.amountRaw),
      decimals: balance.decimals,
    });
  }
  return { byAccount, incomplete: false };
}

function identitiesMatch(left: IndexedWalletBalance, right: IndexedWalletBalance): boolean {
  return (
    left.accountIndex === right.accountIndex &&
    left.mint === right.mint &&
    left.owner === right.owner &&
    left.programId === right.programId &&
    left.decimals === right.decimals &&
    isSupportedTokenProgramId(left.programId)
  );
}

function isSupportedTokenProgramId(programId: string): boolean {
  return programId === SPL_TOKEN_PROGRAM_ID || programId === TOKEN_2022_PROGRAM_ID;
}

function addMintDelta(mintNet: Map<string, bigint>, mint: string, delta: bigint): void {
  mintNet.set(mint, (mintNet.get(mint) ?? 0n) + delta);
}

function classifyDeltaKind(mintDeltas: readonly MintRawDelta[]): TokenDeltaKind {
  let positive = false;
  let negative = false;
  for (const item of mintDeltas) {
    const delta = BigInt(item.netRawDelta);
    if (delta > 0n) {
      positive = true;
    } else if (delta < 0n) {
      negative = true;
    }
  }
  if (positive && negative) {
    return 'bidirectional_token_change';
  }
  if (positive) {
    return 'positive_token_delta';
  }
  if (negative) {
    return 'negative_token_delta';
  }
  return 'no_net_token_delta';
}

function incompleteProjection(input: {
  signature: string;
  slot: number;
  transactionIndex: number;
  blockTime: number | null;
}): WalletTokenDeltaProjection {
  return {
    signature: input.signature,
    slot: input.slot,
    transactionIndex: input.transactionIndex,
    blockTime: input.blockTime,
    kind: 'incomplete_token_delta',
    mintDeltas: [],
    incomplete: true,
  };
}
