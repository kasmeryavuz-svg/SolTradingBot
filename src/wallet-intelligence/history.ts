import { OBSERVED_FRESH_MS, OBSERVED_YOUNG_MS } from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import { compareCodePoint, unixSecondsToMs } from './numbers.js';
import type { FirstObservedActivity, ObservedAgeClass, WalletHistoryTransaction } from './types.js';

export function fenceHistoryTransactions(input: {
  transactions: readonly WalletHistoryTransaction[];
  holderContextSlot: number;
  scanStartedAtMs: number;
  windowStartMs: number;
}): WalletHistoryTransaction[] {
  const fenced: WalletHistoryTransaction[] = [];
  for (const transaction of input.transactions) {
    if (transaction.err !== null && transaction.err !== undefined) {
      throw new WalletIntelligenceError('Failed transaction cannot enter succeeded wallet history.', {
        code: 'provider_integrity_failure',
      });
    }
    if (transaction.slot > input.holderContextSlot) {
      throw new WalletIntelligenceError(
        'Wallet history included a slot newer than the holder snapshot. Provider integrity failure.',
        { code: 'provider_integrity_failure' },
      );
    }
    if (transaction.blockTime !== null) {
      const blockTimeMs = unixSecondsToMs(transaction.blockTime);
      if (blockTimeMs > input.scanStartedAtMs) {
        throw new WalletIntelligenceError(
          'Wallet history included a blockTime newer than the scan anchor. Provider integrity failure.',
          { code: 'provider_integrity_failure' },
        );
      }
      if (blockTimeMs < input.windowStartMs) {
        throw new WalletIntelligenceError(
          'Wallet history included a blockTime older than the configured 30-day window. Provider integrity failure.',
          { code: 'provider_integrity_failure' },
        );
      }
    }
    fenced.push(transaction);
  }
  return fenced;
}

export function sortHistoryNewestFirst(
  transactions: readonly WalletHistoryTransaction[],
): WalletHistoryTransaction[] {
  return [...transactions].sort((left, right) => {
    if (left.slot !== right.slot) {
      return right.slot - left.slot;
    }
    if (left.transactionIndex !== right.transactionIndex) {
      return right.transactionIndex - left.transactionIndex;
    }
    return compareCodePoint(left.signature, right.signature);
  });
}

export function partitionProvenRecentHistory(transactions: readonly WalletHistoryTransaction[]): {
  proven: WalletHistoryTransaction[];
  unprovenNullBlockTime: WalletHistoryTransaction[];
} {
  const proven: WalletHistoryTransaction[] = [];
  const unprovenNullBlockTime: WalletHistoryTransaction[] = [];
  for (const transaction of transactions) {
    if (transaction.blockTime === null) {
      unprovenNullBlockTime.push(transaction);
    } else {
      proven.push(transaction);
    }
  }
  return { proven, unprovenNullBlockTime };
}

export function firstObservedActivityFromTransaction(
  transaction: WalletHistoryTransaction | null,
  holderContextSlot: number,
  scanStartedAtMs: number,
): FirstObservedActivity {
  if (transaction === null) {
    return { slot: null, blockTime: null, atMs: null };
  }
  if (transaction.err !== null && transaction.err !== undefined) {
    throw new WalletIntelligenceError('Failed transaction cannot enter first-observed activity.', {
      code: 'provider_integrity_failure',
    });
  }
  if (transaction.slot > holderContextSlot) {
    throw new WalletIntelligenceError(
      'First-observed activity included a slot newer than the holder snapshot. Provider integrity failure.',
      { code: 'provider_integrity_failure' },
    );
  }
  if (transaction.blockTime === null) {
    return { slot: transaction.slot, blockTime: null, atMs: null };
  }
  const atMs = unixSecondsToMs(transaction.blockTime);
  if (atMs > scanStartedAtMs) {
    throw new WalletIntelligenceError(
      'First-observed activity included a blockTime newer than the scan anchor. Provider integrity failure.',
      { code: 'provider_integrity_failure' },
    );
  }
  return { slot: transaction.slot, blockTime: transaction.blockTime, atMs };
}

export function classifyObservedAge(
  firstObservedActivityAtMs: number | null,
  scanStartedAtMs: number,
): ObservedAgeClass {
  if (firstObservedActivityAtMs === null) {
    return 'UNKNOWN';
  }
  if (firstObservedActivityAtMs >= scanStartedAtMs - OBSERVED_FRESH_MS) {
    return 'OBSERVED_FRESH_7D';
  }
  if (firstObservedActivityAtMs >= scanStartedAtMs - OBSERVED_YOUNG_MS) {
    return 'OBSERVED_YOUNG_30D';
  }
  return 'OBSERVED_ESTABLISHED_30D_PLUS';
}
