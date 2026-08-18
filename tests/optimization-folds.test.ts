import { describe, expect, it } from 'vitest';
import { MAX_OPTIMIZATION_HOLD_MS } from '../src/optimization/constants.js';
import {
  buildChronologicalSegments,
  buildFoldBoundaries,
  isEntryEligible,
  isObservationInWindow,
  testWindow,
  trainWindow,
  walkForwardStructurallyPossible,
} from '../src/optimization/folds.js';
import {
  O17_END,
  O17_START,
  makeOptimizationDataset,
  optimizationMint,
  qualityControlOnlySnapshot,
  simulatePair,
} from './optimization-fixtures.js';

describe('anchored walk-forward folds', () => {
  it('splits an 18-day span into six equal-duration segments and four anchored folds', () => {
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(0) }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(0), priceUsd: 101 }),
    ]);
    const segments = buildChronologicalSegments(dataset);
    expect(segments).not.toBeNull();
    expect(segments?.map((segment) => segment.segmentId)).toEqual(['S1', 'S2', 'S3', 'S4', 'S5', 'S6']);
    const span = Date.parse(O17_END) - Date.parse(O17_START);
    expect(segments?.[0]?.startInclusiveMs).toBe(Date.parse(O17_START));
    expect(segments?.[1]?.startInclusiveMs).toBe(Date.parse(O17_START) + Math.trunc(span / 6));
    const folds = buildFoldBoundaries(dataset, segments ?? []);
    expect(folds).toHaveLength(4);
    expect(folds?.[0]).toMatchObject({ trainSegmentIds: ['S1', 'S2'], testSegmentId: 'S3' });
    expect(folds?.[3]).toMatchObject({ trainSegmentIds: ['S1', 'S2', 'S3', 'S4', 'S5'], testSegmentId: 'S6' });
    expect(walkForwardStructurallyPossible(segments, folds)).toBe(true);
    expect(Number.isInteger(segments?.[1]?.startInclusiveMs)).toBe(true);
    const fold1 = folds?.[0];
    if (fold1 === undefined) {
      throw new Error('fold 1');
    }
    expect(fold1.trainLatestEntryInclusiveMs).toBe(fold1.trainEndExclusiveMs - MAX_OPTIMIZATION_HOLD_MS);
    expect(fold1.testLatestEntryInclusiveMs).toBe(
      (fold1.testEndExclusiveMs ?? fold1.testEndInclusiveMs) - MAX_OPTIMIZATION_HOLD_MS,
    );
  });

  it('treats entry at trainEnd-24h as inclusive and rejects later entries', () => {
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(0) }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(0), priceUsd: 101 }),
    ]);
    const folds = buildFoldBoundaries(dataset, buildChronologicalSegments(dataset) ?? []);
    const fold1 = folds?.[0];
    if (fold1 === undefined) {
      throw new Error('fold 1');
    }
    const train = trainWindow(fold1);
    expect(isEntryEligible(fold1.trainLatestEntryInclusiveMs, train)).toBe(true);
    expect(isEntryEligible(fold1.trainLatestEntryInclusiveMs + 1, train)).toBe(false);
    expect(isEntryEligible(fold1.testStartInclusiveMs, train)).toBe(false);
    const test = testWindow(fold1);
    expect(isObservationInWindow(fold1.trainEndExclusiveMs - 1, train)).toBe(true);
    expect(isObservationInWindow(fold1.trainEndExclusiveMs, train)).toBe(false);
    if (fold1.testEndExclusiveMs !== null) {
      expect(isObservationInWindow(fold1.testEndExclusiveMs, test)).toBe(false);
      expect(isObservationInWindow(fold1.testEndExclusiveMs - 1, test)).toBe(true);
    }
  });

  it('does not complete an OOS trade using an observation after the test window', () => {
    const foldsDataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({ collectedAt: O17_START, tokenMint: optimizationMint(0) }),
      qualityControlOnlySnapshot({ collectedAt: O17_END, tokenMint: optimizationMint(0), priceUsd: 101 }),
    ]);
    const fold1 = buildFoldBoundaries(foldsDataset, buildChronologicalSegments(foldsDataset) ?? [])?.[0];
    if (fold1 === undefined) {
      throw new Error('fold 1');
    }
    const test = testWindow(fold1);
    const entryAt = new Date(fold1.testLatestEntryInclusiveMs).toISOString();
    const afterTest = fold1.testEndExclusiveMs ?? fold1.testEndInclusiveMs + 1;
    const dataset = makeOptimizationDataset([
      qualityControlOnlySnapshot({
        collectedAt: O17_START,
        tokenMint: optimizationMint(9),
        priceUsd: 100,
      }),
      qualityControlOnlySnapshot({
        collectedAt: O17_END,
        tokenMint: optimizationMint(9),
        priceUsd: 101,
      }),
      qualityControlOnlySnapshot({
        collectedAt: entryAt,
        tokenMint: optimizationMint(9),
        priceUsd: 100,
      }),
      qualityControlOnlySnapshot({
        collectedAt: new Date(afterTest).toISOString(),
        tokenMint: optimizationMint(9),
        priceUsd: 80,
      }),
    ]);
    const result = simulatePair(dataset, 'quality_control_v1', 'x11_baseline', test);
    expect(result.coverage.completedTrades).toBe(0);
    expect(result.unresolvedPositions.some((item) => item.unresolvedReason === 'unresolved_at_fold_end')).toBe(
      true,
    );
  });
});
