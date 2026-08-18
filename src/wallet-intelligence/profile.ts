import { canonicalRawAmount, compareCodePoint, utcDayKey } from './numbers.js';
import type { WalletProfile, WalletTokenDeltaProjection } from './types.js';

export function deriveWalletHistoryFeatures(input: {
  targetMint: string;
  projections: readonly WalletTokenDeltaProjection[];
}): {
  activeDaysObserved30d: number;
  uniqueMintsTouched: string[];
  uniqueMintsWithBalanceChange30d: number;
  positiveTokenDeltaTxCount30d: number;
  negativeTokenDeltaTxCount30d: number;
  bidirectionalTokenDeltaTxCount30d: number;
  targetMintPositiveDeltaTxCount30d: number;
  targetMintNegativeDeltaTxCount30d: number;
  targetMintNetRawDelta30d: string;
  incompleteDeltaTxCount30d: number;
} {
  const activeDays = new Set<string>();
  const uniqueMints = new Set<string>();
  let positive = 0;
  let negative = 0;
  let bidirectional = 0;
  let targetPositive = 0;
  let targetNegative = 0;
  let targetNet = 0n;
  let incomplete = 0;

  for (const projection of input.projections) {
    if (projection.incomplete) {
      incomplete += 1;
      continue;
    }
    if (projection.kind === 'bidirectional_token_change') {
      bidirectional += 1;
    } else if (projection.kind === 'positive_token_delta') {
      positive += 1;
    } else if (projection.kind === 'negative_token_delta') {
      negative += 1;
    }
    if (projection.blockTime !== null) {
      const hasNonZero = projection.mintDeltas.some((item) => BigInt(item.netRawDelta) !== 0n);
      if (hasNonZero) {
        activeDays.add(utcDayKey(projection.blockTime * 1000));
      }
    }
    for (const delta of projection.mintDeltas) {
      const net = BigInt(delta.netRawDelta);
      if (net !== 0n) {
        uniqueMints.add(delta.mint);
      }
      if (delta.mint === input.targetMint) {
        targetNet += net;
        if (net > 0n) {
          targetPositive += 1;
        } else if (net < 0n) {
          targetNegative += 1;
        }
      }
    }
  }

  const uniqueMintsTouched = [...uniqueMints].sort(compareCodePoint);
  return {
    activeDaysObserved30d: activeDays.size,
    uniqueMintsTouched,
    uniqueMintsWithBalanceChange30d: uniqueMintsTouched.length,
    positiveTokenDeltaTxCount30d: positive,
    negativeTokenDeltaTxCount30d: negative,
    bidirectionalTokenDeltaTxCount30d: bidirectional,
    targetMintPositiveDeltaTxCount30d: targetPositive,
    targetMintNegativeDeltaTxCount30d: targetNegative,
    targetMintNetRawDelta30d: canonicalRawAmount(targetNet),
    incompleteDeltaTxCount30d: incomplete,
  };
}

export function profileWithoutFingerprint(
  profile: Omit<WalletProfile, 'profileFingerprint' | 'historyEvidenceSha256'> & {
    historyEvidenceSha256?: string;
    profileFingerprint?: string;
  },
): Omit<WalletProfile, 'profileFingerprint' | 'historyEvidenceSha256'> {
  return {
    walletAddress: profile.walletAddress,
    observedTop20AggregateRawAmount: profile.observedTop20AggregateRawAmount,
    observedTop20BalanceShareBps: profile.observedTop20BalanceShareBps,
    top20TokenAccountCountOwned: profile.top20TokenAccountCountOwned,
    bestTop20Rank: profile.bestTop20Rank,
    ownerKind: profile.ownerKind,
    firstObservedActivitySlot: profile.firstObservedActivitySlot,
    firstObservedActivityAtMs: profile.firstObservedActivityAtMs,
    observedAgeClass: profile.observedAgeClass,
    historyWindowStartMs: profile.historyWindowStartMs,
    historyWindowEndMs: profile.historyWindowEndMs,
    historyTransactionsObserved: profile.historyTransactionsObserved,
    historyCensored: profile.historyCensored,
    activeDaysObserved30d: profile.activeDaysObserved30d,
    uniqueMintsWithBalanceChange30d: profile.uniqueMintsWithBalanceChange30d,
    uniqueMintsTouched30d: profile.uniqueMintsTouched30d,
    positiveTokenDeltaTxCount30d: profile.positiveTokenDeltaTxCount30d,
    negativeTokenDeltaTxCount30d: profile.negativeTokenDeltaTxCount30d,
    bidirectionalTokenDeltaTxCount30d: profile.bidirectionalTokenDeltaTxCount30d,
    targetMintPositiveDeltaTxCount30d: profile.targetMintPositiveDeltaTxCount30d,
    targetMintNegativeDeltaTxCount30d: profile.targetMintNegativeDeltaTxCount30d,
    targetMintNetRawDelta30d: profile.targetMintNetRawDelta30d,
    incompleteDeltaTxCount30d: profile.incompleteDeltaTxCount30d,
  };
}
