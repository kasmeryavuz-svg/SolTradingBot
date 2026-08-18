import { compareLexical } from '../backtest/timeline.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { SAMPLE_COOLDOWN_MS } from './constants.js';
import { pairKey } from '../optimization/timeline.js';

export type EligibleObservation = {
  snapshot: MarketSnapshot;
  collectedAtMs: number;
};

export function isEligibleDecisionObservation(snapshot: MarketSnapshot): boolean {
  return typeof snapshot.priceUsd === 'number' && Number.isFinite(snapshot.priceUsd) && snapshot.priceUsd > 0;
}

export function sortEligibleObservations(snapshots: readonly MarketSnapshot[]): EligibleObservation[] {
  return snapshots
    .filter(isEligibleDecisionObservation)
    .map((snapshot) => ({
      snapshot,
      collectedAtMs: requireUtcTimestamp(snapshot.collectedAt, 'collectedAt'),
    }))
    .sort((left, right) => {
      const time = left.collectedAtMs - right.collectedAtMs;
      if (time !== 0) {
        return time < 0 ? -1 : 1;
      }
      const token = compareLexical(left.snapshot.tokenMint, right.snapshot.tokenMint);
      if (token !== 0) {
        return token;
      }
      const pair = compareLexical(left.snapshot.pairAddress, right.snapshot.pairAddress);
      if (pair !== 0) {
        return pair;
      }
      return compareLexical(left.snapshot.collectedAt, right.snapshot.collectedAt);
    });
}

export function selectDecisionObservations(
  snapshots: readonly MarketSnapshot[],
  cooldownMs: number = SAMPLE_COOLDOWN_MS,
): EligibleObservation[] {
  const grouped = new Map<string, EligibleObservation[]>();
  for (const observation of sortEligibleObservations(snapshots)) {
    const key = pairKey(observation.snapshot.tokenMint, observation.snapshot.pairAddress);
    const list = grouped.get(key);
    if (list === undefined) {
      grouped.set(key, [observation]);
    } else {
      list.push(observation);
    }
  }

  const selected: EligibleObservation[] = [];
  const keys = [...grouped.keys()].sort(compareLexical);
  for (const key of keys) {
    const series = grouped.get(key);
    if (series === undefined) {
      continue;
    }
    let lastSelectedMs: number | null = null;
    for (const observation of series) {
      if (lastSelectedMs === null || observation.collectedAtMs >= lastSelectedMs + cooldownMs) {
        selected.push(observation);
        lastSelectedMs = observation.collectedAtMs;
      }
    }
  }

  return selected.sort((left, right) => {
    const time = left.collectedAtMs - right.collectedAtMs;
    if (time !== 0) {
      return time < 0 ? -1 : 1;
    }
    const token = compareLexical(left.snapshot.tokenMint, right.snapshot.tokenMint);
    if (token !== 0) {
      return token;
    }
    return compareLexical(left.snapshot.pairAddress, right.snapshot.pairAddress);
  });
}
