import { isAddress } from '@solana/kit';
import { SPL_TOKEN_PROGRAM_ID, SYSTEM_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, TOP_TOKEN_ACCOUNT_LIMIT } from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import {
  canonicalRawAmount,
  compareBigIntDesc,
  compareCodePoint,
  isRecord,
  observedTop20ShareBps,
  parseDecimals,
  parseNonNegativeRawAmount,
} from './numbers.js';
import type {
  AggregatedOwner,
  HolderObservation,
  LargestTokenAccount,
  OwnerAccountClassification,
  OwnerKind,
  ParsedTokenAccount,
} from './types.js';

export function canonicalizeLargestTokenAccounts(
  accounts: readonly LargestTokenAccount[],
): LargestTokenAccount[] {
  if (accounts.length > TOP_TOKEN_ACCOUNT_LIMIT) {
    throw new WalletIntelligenceError(
      `getTokenLargestAccounts returned more than ${String(TOP_TOKEN_ACCOUNT_LIMIT)} token accounts.`,
      { code: 'provider_integrity_failure' },
    );
  }
  const seen = new Set<string>();
  const seenRanks = new Set<number>();
  const normalized: LargestTokenAccount[] = accounts.map((account, index) => {
    const rank = index + 1;
    if (seenRanks.has(rank)) {
      throw new WalletIntelligenceError('Duplicate rank in largest-token-account set.', {
        code: 'provider_integrity_failure',
      });
    }
    seenRanks.add(rank);
    if (!isAddress(account.address)) {
      throw new WalletIntelligenceError('Largest token account address is not a canonical pubkey.', {
        code: 'provider_integrity_failure',
      });
    }
    if (seen.has(account.address)) {
      throw new WalletIntelligenceError('Duplicate token account in largest-token-account set.', {
        code: 'provider_integrity_failure',
      });
    }
    seen.add(account.address);
    return {
      address: account.address,
      amountRaw: parseNonNegativeRawAmount(account.amountRaw, 'largest token account amount'),
      decimals: parseDecimals(account.decimals, 'largest token account decimals'),
    };
  });
  for (let index = 1; index < normalized.length; index += 1) {
    const previous = normalized[index - 1];
    const current = normalized[index];
    if (previous === undefined || current === undefined) {
      throw new WalletIntelligenceError('Largest-token-account ranking omitted a rank.', {
        code: 'provider_integrity_failure',
      });
    }
    if (BigInt(current.amountRaw) > BigInt(previous.amountRaw)) {
      throw new WalletIntelligenceError(
        'getTokenLargestAccounts raw amounts are not in descending official RPC order. Provider integrity failure.',
        { code: 'provider_integrity_failure' },
      );
    }
  }
  return normalized;
}

export function parseTokenAccountValue(
  tokenAccount: string,
  value: unknown,
  expectedMint: string,
  expectedDecimals: number,
  expectedAmountRaw: string,
  expectedTokenProgramOwner: string,
): ParsedTokenAccount {
  if (value === null) {
    throw new WalletIntelligenceError('A reported largest token account was missing on-chain.', {
      code: 'provider_integrity_failure',
    });
  }
  if (!isRecord(value) || !isRecord(value['data']) || !isRecord(value['data']['parsed'])) {
    throw new WalletIntelligenceError('Token account payload is not parsed SPL account data.', {
      code: 'provider_integrity_failure',
    });
  }
  const programOwner = value['owner'];
  if (typeof programOwner !== 'string' || !isSupportedTokenProgramOwner(programOwner)) {
    throw new WalletIntelligenceError(
      'Token account is not owned by a supported SPL Token or Token-2022 program.',
      { code: 'provider_integrity_failure' },
    );
  }
  if (programOwner !== expectedTokenProgramOwner) {
    throw new WalletIntelligenceError(
      'Token-account program owner does not match the mint token program.',
      { code: 'provider_integrity_failure' },
    );
  }
  const parser = value['data']['program'];
  if (parser !== 'spl-token' && parser !== 'spl-token-2022') {
    throw new WalletIntelligenceError('Token account jsonParsed parser is not a supported SPL token parser.', {
      code: 'provider_integrity_failure',
    });
  }
  const parsed = value['data']['parsed'];
  if (parsed['type'] !== 'account' || !isRecord(parsed['info'])) {
    throw new WalletIntelligenceError('Account is not a parsed SPL token account.', {
      code: 'provider_integrity_failure',
    });
  }
  const info = parsed['info'];
  const mint = info['mint'];
  const owner = info['owner'];
  const state = info['state'];
  if (typeof mint !== 'string' || !isAddress(mint)) {
    throw new WalletIntelligenceError('Token account mint is malformed.', {
      code: 'provider_integrity_failure',
    });
  }
  if (mint !== expectedMint) {
    throw new WalletIntelligenceError('Parsed token-account mint does not match the requested mint.', {
      code: 'provider_integrity_failure',
    });
  }
  if (typeof owner !== 'string' || !isAddress(owner)) {
    throw new WalletIntelligenceError('Token account owner is malformed.', {
      code: 'provider_integrity_failure',
    });
  }
  if (typeof state !== 'string' || state.trim() === '') {
    throw new WalletIntelligenceError('Token account state is malformed.', {
      code: 'provider_integrity_failure',
    });
  }
  const tokenAmount = info['tokenAmount'];
  if (!isRecord(tokenAmount)) {
    throw new WalletIntelligenceError('Token account amount payload is malformed.', {
      code: 'provider_integrity_failure',
    });
  }
  const decimals = parseDecimals(tokenAmount['decimals'], 'token account decimals');
  if (decimals !== expectedDecimals) {
    throw new WalletIntelligenceError(
      'Parsed token-account decimals do not match getTokenLargestAccounts decimals.',
      { code: 'provider_integrity_failure' },
    );
  }
  const amountRaw = parseNonNegativeRawAmount(tokenAmount['amount'], 'token account amount');
  if (amountRaw !== expectedAmountRaw) {
    throw new WalletIntelligenceError(
      'Parsed token-account raw amount does not match getTokenLargestAccounts raw amount.',
      { code: 'provider_integrity_failure' },
    );
  }
  return {
    tokenAccount,
    mint,
    owner,
    amountRaw,
    decimals,
    state,
    tokenProgramOwner: programOwner,
  };
}

export function isSupportedTokenProgramOwner(owner: string): boolean {
  return owner === SPL_TOKEN_PROGRAM_ID || owner === TOKEN_2022_PROGRAM_ID;
}

export function classifyOwnerAccount(address: string, value: unknown): OwnerAccountClassification {
  if (value === null) {
    return {
      address,
      ownerKind: 'ACCOUNT_MISSING',
      ownerAccountProgram: null,
      ownerExecutable: null,
    };
  }
  if (!isRecord(value)) {
    return {
      address,
      ownerKind: 'UNKNOWN',
      ownerAccountProgram: null,
      ownerExecutable: null,
    };
  }
  const programOwner = value['owner'];
  const executable = value['executable'];
  if (typeof programOwner !== 'string' || typeof executable !== 'boolean') {
    return {
      address,
      ownerKind: 'UNKNOWN',
      ownerAccountProgram: typeof programOwner === 'string' ? programOwner : null,
      ownerExecutable: typeof executable === 'boolean' ? executable : null,
    };
  }
  if (programOwner === SYSTEM_PROGRAM_ID && !executable) {
    return {
      address,
      ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
      ownerAccountProgram: programOwner,
      ownerExecutable: false,
    };
  }
  return {
    address,
    ownerKind: 'PROGRAM_OWNED_OR_EXECUTABLE',
    ownerAccountProgram: programOwner,
    ownerExecutable: executable,
  };
}

export function buildHolderObservations(input: {
  largestAccounts: readonly LargestTokenAccount[];
  parsedAccounts: readonly ParsedTokenAccount[];
  classifications: ReadonlyMap<string, OwnerAccountClassification>;
  mintDecimals: number;
}): HolderObservation[] {
  if (input.largestAccounts.length !== input.parsedAccounts.length) {
    throw new WalletIntelligenceError('Token-account resolution count does not match the observed largest set.', {
      code: 'provider_integrity_failure',
    });
  }
  return input.largestAccounts.map((account, index) => {
    const parsed = input.parsedAccounts[index];
    if (parsed === undefined || parsed.tokenAccount !== account.address) {
      throw new WalletIntelligenceError('Token-account resolution order does not match the official largest-account ranking.', {
        code: 'provider_integrity_failure',
      });
    }
    if (parsed.decimals !== input.mintDecimals || account.decimals !== input.mintDecimals) {
      throw new WalletIntelligenceError('Decimals mismatch for the requested mint.', {
        code: 'provider_integrity_failure',
      });
    }
    if (parsed.amountRaw !== account.amountRaw || parsed.decimals !== account.decimals) {
      throw new WalletIntelligenceError(
        'Token-account amount/decimals changed between ranking and owner resolution.',
        { code: 'provider_integrity_failure' },
      );
    }
    const classification = input.classifications.get(parsed.owner);
    if (classification === undefined) {
      throw new WalletIntelligenceError('Owner classification missing for a resolved token-account owner.', {
        code: 'provider_integrity_failure',
      });
    }
    return {
      rank: index + 1,
      tokenAccount: account.address,
      amountRaw: account.amountRaw,
      decimals: account.decimals,
      ownerAddress: parsed.owner,
      ownerKind: classification.ownerKind,
      ownerAccountProgram: classification.ownerAccountProgram,
      ownerExecutable: classification.ownerExecutable,
    };
  });
}

export function aggregateOwners(holders: readonly HolderObservation[]): AggregatedOwner[] {
  const totals = new Map<
    string,
    {
      ownerKind: OwnerKind;
      ownerAccountProgram: string | null;
      ownerExecutable: boolean | null;
      amount: bigint;
      count: number;
      bestRank: number;
    }
  >();
  let observedTotal = 0n;
  for (const holder of holders) {
    const amount = BigInt(holder.amountRaw);
    observedTotal += amount;
    if (holder.ownerAddress === null) {
      continue;
    }
    const existing = totals.get(holder.ownerAddress);
    if (existing === undefined) {
      totals.set(holder.ownerAddress, {
        ownerKind: holder.ownerKind,
        ownerAccountProgram: holder.ownerAccountProgram,
        ownerExecutable: holder.ownerExecutable,
        amount,
        count: 1,
        bestRank: holder.rank,
      });
      continue;
    }
    existing.amount += amount;
    existing.count += 1;
    if (holder.rank < existing.bestRank) {
      existing.bestRank = holder.rank;
    }
  }
  const owners: AggregatedOwner[] = [...totals.entries()].map(([ownerAddress, value]) => ({
    ownerAddress,
    ownerKind: value.ownerKind,
    ownerAccountProgram: value.ownerAccountProgram,
    ownerExecutable: value.ownerExecutable,
    observedTop20AggregateRawAmount: canonicalRawAmount(value.amount),
    observedTop20BalanceShareBps: observedTop20ShareBps(value.amount, observedTotal),
    top20TokenAccountCountOwned: value.count,
    bestTop20Rank: value.bestRank,
  }));
  owners.sort(compareAggregatedOwners);
  return owners;
}

export function compareAggregatedOwners(left: AggregatedOwner, right: AggregatedOwner): number {
  const amount = compareBigIntDesc(
    BigInt(left.observedTop20AggregateRawAmount),
    BigInt(right.observedTop20AggregateRawAmount),
  );
  if (amount !== 0) {
    return amount;
  }
  if (left.bestTop20Rank !== right.bestTop20Rank) {
    return left.bestTop20Rank - right.bestTop20Rank;
  }
  return compareCodePoint(left.ownerAddress, right.ownerAddress);
}

export function selectAnalyzedOwners(owners: readonly AggregatedOwner[], cap: number): AggregatedOwner[] {
  return owners
    .filter(
      (owner) =>
        owner.ownerKind === 'SYSTEM_OWNED_NON_EXECUTABLE' && BigInt(owner.observedTop20AggregateRawAmount) > 0n,
    )
    .slice()
    .sort(compareAggregatedOwners)
    .slice(0, cap);
}

export function observedTop20TotalRaw(holders: readonly HolderObservation[]): bigint {
  return holders.reduce((sum, holder) => sum + BigInt(holder.amountRaw), 0n);
}

export function assertContextSlotOrdering(input: {
  holderContextSlot: number;
  holderResolutionContextSlot: number;
  ownerClassificationContextSlot: number;
}): void {
  if (input.holderResolutionContextSlot < input.holderContextSlot) {
    throw new WalletIntelligenceError(
      'holderResolutionContextSlot is earlier than holderContextSlot. Provider integrity failure.',
      { code: 'provider_integrity_failure' },
    );
  }
  if (input.ownerClassificationContextSlot < input.holderResolutionContextSlot) {
    throw new WalletIntelligenceError(
      'ownerClassificationContextSlot is earlier than holderResolutionContextSlot. Provider integrity failure.',
      { code: 'provider_integrity_failure' },
    );
  }
}
