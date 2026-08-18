import { describe, expect, it } from 'vitest';
import { evaluateFoldBaseline, mlAndBaselineShareTestMembership } from '../src/ml/baseline.js';
import { canonicalMlDefinition } from '../src/ml/definition.js';
import { ML_DEFINITION_FINGERPRINT, ML_FEATURE_FINGERPRINT } from '../src/ml/identity.js';
import { isObservationInWindow, testWindow } from '../src/optimization/folds.js';
import { simulateOptimizationPair } from '../src/optimization/simulator.js';
import { buildOptimizationIndexes } from '../src/optimization/timeline.js';
import type { FoldBoundaries } from '../src/optimization/types.js';
import { addMs, makeMlDataset, optimizationMint } from './ml-fixtures.js';
import { s07LegalSnapshot } from './optimization-fixtures.js';

const T0 = '2026-01-01T00:00:00.000Z';
const T0_MS = Date.parse(T0);
const FORTY_EIGHT_H_MS = 48 * 60 * 60 * 1000;
const TWENTY_FOUR_H_MS = 24 * 60 * 60 * 1000;
const TEST_END_MS = T0_MS + FORTY_EIGHT_H_MS;

function exclusiveTestFold(): FoldBoundaries {
  return {
    foldId: 1,
    trainSegmentIds: ['S1', 'S2'],
    testSegmentId: 'S3',
    trainStartInclusiveMs: T0_MS - FORTY_EIGHT_H_MS,
    trainEndExclusiveMs: T0_MS,
    testStartInclusiveMs: T0_MS,
    testEndExclusiveMs: TEST_END_MS,
    testEndInclusiveMs: TEST_END_MS - 1,
    trainLatestEntryInclusiveMs: T0_MS - TWENTY_FOUR_H_MS,
    testLatestEntryInclusiveMs: T0_MS + TWENTY_FOUR_H_MS,
    optimizationFoldFingerprint: 'a'.repeat(64),
  };
}

function inclusiveLastSegmentFold(): FoldBoundaries {
  return {
    ...exclusiveTestFold(),
    testSegmentId: 'S6',
    testEndExclusiveMs: null,
    testEndInclusiveMs: TEST_END_MS,
    testLatestEntryInclusiveMs: TEST_END_MS - TWENTY_FOUR_H_MS,
  };
}

function lateEntrySnapshots(): ReturnType<typeof s07LegalSnapshot>[] {
  const plus1h = optimizationMint(1);
  const plus30h = optimizationMint(2);
  const plus45h = optimizationMint(3);
  const plus47h = optimizationMint(4);
  return [
    s07LegalSnapshot({ tokenMint: plus1h, collectedAt: addMs(T0, 1 * 60 * 60 * 1000), priceUsd: 100 }),
    s07LegalSnapshot({ tokenMint: plus1h, collectedAt: addMs(T0, 2 * 60 * 60 * 1000), priceUsd: 121 }),
    s07LegalSnapshot({ tokenMint: plus30h, collectedAt: addMs(T0, 30 * 60 * 60 * 1000), priceUsd: 100 }),
    s07LegalSnapshot({ tokenMint: plus30h, collectedAt: addMs(T0, 31 * 60 * 60 * 1000), priceUsd: 121 }),
    s07LegalSnapshot({ tokenMint: plus45h, collectedAt: addMs(T0, 45 * 60 * 60 * 1000), priceUsd: 100 }),
    s07LegalSnapshot({ tokenMint: plus45h, collectedAt: addMs(T0, 46 * 60 * 60 * 1000), priceUsd: 121 }),
    s07LegalSnapshot({ tokenMint: plus47h, collectedAt: addMs(T0, 47 * 60 * 60 * 1000), priceUsd: 100 }),
    s07LegalSnapshot({ tokenMint: plus47h, collectedAt: addMs(T0, 50 * 60 * 60 * 1000), priceUsd: 121 }),
  ];
}

describe('ml19 baseline TEST-window fairness', () => {
  it('opens every s07 signal inside the exact TEST observation interval and censors fold-bounded unresolved outcomes', () => {
    const fold = exclusiveTestFold();
    const snapshots = lateEntrySnapshots();
    const dataset = makeMlDataset(snapshots);
    const plus47h = snapshots[6];
    if (plus47h === undefined) {
      throw new Error('plus47h snapshot missing');
    }

    const oldWindow = testWindow(fold);
    expect(oldWindow.latestEntryInclusiveMs).toBe(T0_MS + TWENTY_FOUR_H_MS);
    const oldBaseline = simulateOptimizationPair({
      dataset: dataset.optimization,
      indexes: buildOptimizationIndexes({
        marketSnapshots: dataset.marketSnapshots,
        riskReports: dataset.riskReports,
      }),
      entryCandidateId: 's07_baseline',
      exitCandidateId: 'x11_baseline',
      window: oldWindow,
    });
    expect(oldBaseline.coverage.openedPositions).toBe(1);

    const baseline = evaluateFoldBaseline(dataset, fold);
    expect(baseline.openedPositions).toBe(4);
    expect(baseline.completedTrades).toBe(3);
    expect(baseline.censoredTrades).toBe(1);
    expect(baseline.censoringBps).toBe(2500);
    expect(baseline.censoredIdentities).toHaveLength(1);
    expect(baseline.censoredIdentities[0]).toContain(plus47h.tokenMint);
    expect(baseline.openedIdentities.some((identity) => identity.includes(plus47h.tokenMint))).toBe(true);
    expect(baseline.netBaseExpectancy).not.toBeNull();
  });

  it('agrees with ML on o17 exclusive and inclusive TEST membership', () => {
    const exclusive = exclusiveTestFold();
    const inclusive = inclusiveLastSegmentFold();
    const timestamps = [T0_MS, T0_MS + 1, TEST_END_MS - 1, TEST_END_MS, TEST_END_MS + 1];
    for (const collectedAtMs of timestamps) {
      const shared = mlAndBaselineShareTestMembership(collectedAtMs, exclusive);
      expect(shared.ml).toBe(shared.baseline);
      expect(shared.baseline).toBe(isObservationInWindow(collectedAtMs, testWindow(exclusive)));
    }
    expect(mlAndBaselineShareTestMembership(TEST_END_MS - 1, exclusive)).toEqual({ ml: true, baseline: true });
    expect(mlAndBaselineShareTestMembership(TEST_END_MS, exclusive)).toEqual({ ml: false, baseline: false });
    expect(mlAndBaselineShareTestMembership(TEST_END_MS, inclusive)).toEqual({ ml: true, baseline: true });
    expect(mlAndBaselineShareTestMembership(TEST_END_MS + 1, inclusive)).toEqual({ ml: false, baseline: false });
  });

  it('binds the same-interval baseline policy and moves only the ml19 definition fingerprint', () => {
    const definition = canonicalMlDefinition();
    expect(definition.baseline.usesLatestEntryInclusive).toBe(false);
    expect(definition.baseline.testSignalWindow).toBe('exact_fold_TEST_observation_interval');
    expect(definition.baseline.comparison).toBe(
      'same_chronological_evaluation_interval_different_frozen_entry_policies',
    );
    expect(ML_DEFINITION_FINGERPRINT).not.toBe(
      '4058ab134c2093af69e8cc48e5e3a7476b221a6e6518182ad597bb9ec4869656',
    );
    expect(ML_FEATURE_FINGERPRINT).toBe(
      '5d29959fa54e79d0b8d08d577da2deef7d2480a11b13ac283871b73b14143072',
    );
  });
});
