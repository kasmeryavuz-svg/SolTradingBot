import { BASIS_POINTS_PER_UNIT, MAX_LARGEST_ACCOUNTS } from './constants.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { parseRawAmount } from './numbers.js';
import type { LargestTokenAccountObservation, TokenAccountConcentration } from './types.js';
import { RiskScanError } from './types.js';

export type LargestAccountRecord = {
  address: string;
  amount: string;
  decimals: number | null;
};

export type NormalizedLargestAccounts = {
  accounts: LargestTokenAccountObservation[];
  unavailableReason: string | null;
};

/**
 * topNBps is the share held by the first min(N, observedAccountsCount) ranked
 * token accounts. If only three accounts were observed, top5, top10, and top20
 * are that same three-account sum. That does not mean five, ten, or twenty
 * accounts were returned.
 */
export function normalizeLargestAccounts(
  records: readonly LargestAccountRecord[],
  supplyRaw: string | null,
  expectedDecimals: number,
): NormalizedLargestAccounts {
  const seen = new Set<string>();
  const unique: { tokenAccount: string; amountRaw: string }[] = [];

  for (const record of records) {
    if (record.decimals !== expectedDecimals) {
      return {
        accounts: [],
        unavailableReason: 'largest token-account decimals do not match mint decimals',
      };
    }

    if (!isPlausibleSolanaMint(record.address)) {
      return { accounts: [], unavailableReason: 'largest token-account address is malformed' };
    }

    let amountRaw: string;
    try {
      amountRaw = parseRawAmount(record.amount, 'largest token-account amount');
    } catch {
      return { accounts: [], unavailableReason: 'largest token-account amount is malformed' };
    }

    if (seen.has(record.address)) {
      return { accounts: [], unavailableReason: 'duplicate token-account addresses' };
    }

    seen.add(record.address);
    unique.push({ tokenAccount: record.address, amountRaw });
  }

  unique.sort((left, right) => {
    const amountOrder = compareRawAmounts(right.amountRaw, left.amountRaw);
    return amountOrder !== 0 ? amountOrder : left.tokenAccount.localeCompare(right.tokenAccount);
  });

  const limited = unique.slice(0, MAX_LARGEST_ACCOUNTS);
  const accounts = limited.map((item, index) => ({
    rank: index + 1,
    tokenAccount: item.tokenAccount,
    amountRaw: item.amountRaw,
    shareBps: shareBpsOrNull(item.amountRaw, supplyRaw),
  }));

  return { accounts, unavailableReason: null };
}

export function computeConcentration(
  supplyRaw: string | null,
  accounts: readonly LargestTokenAccountObservation[],
  largestAccountsAvailable: boolean,
): { concentration: TokenAccountConcentration | null; unavailableReason: string | null } {
  if (!largestAccountsAvailable) {
    return { concentration: null, unavailableReason: 'largest token accounts unavailable' };
  }

  if (supplyRaw === null) {
    return { concentration: null, unavailableReason: 'supply unavailable' };
  }

  const supply = BigInt(supplyRaw);
  if (supply === 0n) {
    return { concentration: null, unavailableReason: 'supply is zero' };
  }

  let cumulative = 0n;
  for (const account of accounts) {
    cumulative += BigInt(account.amountRaw);
  }

  if (cumulative > supply) {
    return { concentration: null, unavailableReason: 'observed token-account amounts exceed supply' };
  }

  return {
    concentration: {
      top1Bps: topShareBps(accounts, 1, supply),
      top5Bps: topShareBps(accounts, 5, supply),
      top10Bps: topShareBps(accounts, 10, supply),
      top20Bps: topShareBps(accounts, 20, supply),
      observedAccountsCount: accounts.length,
    },
    unavailableReason: null,
  };
}

function shareBpsOrNull(amountRaw: string, supplyRaw: string | null): number | null {
  if (supplyRaw === null) {
    return null;
  }

  const supply = BigInt(supplyRaw);
  if (supply === 0n) {
    return null;
  }

  const amount = BigInt(amountRaw);
  if (amount > supply) {
    return null;
  }

  return Number((amount * BigInt(BASIS_POINTS_PER_UNIT)) / supply);
}

function topShareBps(
  accounts: readonly LargestTokenAccountObservation[],
  count: number,
  supply: bigint,
): number {
  let sum = 0n;
  for (const account of accounts.slice(0, count)) {
    sum += BigInt(account.amountRaw);
  }

  if (sum > supply) {
    throw new RiskScanError('Observed token-account amounts exceed supply.');
  }

  return Number((sum * BigInt(BASIS_POINTS_PER_UNIT)) / supply);
}

function compareRawAmounts(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  if (leftValue === rightValue) {
    return 0;
  }

  return leftValue > rightValue ? 1 : -1;
}
