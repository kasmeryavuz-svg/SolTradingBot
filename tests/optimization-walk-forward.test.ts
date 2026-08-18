import { describe, expect, it } from 'vitest';
import { fingerprintOptimizationRun } from '../src/optimization/identity.js';
import { runAnchoredWalkForward } from '../src/optimization/walk-forward.js';
import {
  makeOptimizationDataset,
  qualityControlWalkForwardSnapshots,
} from './optimization-fixtures.js';

describe('anchored walk-forward engine', () => {
  it('is deterministic, ignores row insertion order, and does not rerank OOS', () => {
    const snapshots = qualityControlWalkForwardSnapshots({ oosExitPriceUsd: 80 });
    const dataset = makeOptimizationDataset(snapshots);
    const reversed = makeOptimizationDataset([...snapshots].reverse());
    const first = runAnchoredWalkForward(dataset);
    const second = runAnchoredWalkForward(dataset);
    const fromReversed = runAnchoredWalkForward(reversed);
    expect(first.optimizationRunFingerprint).toBe(second.optimizationRunFingerprint);
    expect(first.optimizationRunFingerprint).toBe(fromReversed.optimizationRunFingerprint);
    expect(first.optimizationRunFingerprint).toBe(
      fingerprintOptimizationRun({
        optimizationDefinitionFingerprint: first.optimizationDefinitionFingerprint,
        optimizationDatasetFingerprint: first.optimizationDatasetFingerprint,
      }),
    );
    expect(first.folds).toHaveLength(4);
    expect(first.folds[0]?.selectedEntryId).toBe('quality_control_v1');
    expect(first.folds[0]?.selectedExitId).toBe('x11_baseline');
    expect(first.folds[0]?.oosSelected?.entryCandidateId).toBe('quality_control_v1');
    expect(first.folds[0]?.oosSelected?.exitCandidateId).toBe('x11_baseline');
    expect(first.folds[0]?.oosSelected?.netBase.expectancyUsd ?? 0).toBeLessThan(0);
    expect(first.promotionStatus).toBe('NO_PROMOTION_INSUFFICIENT_DATA');
    expect(first.paperValidationCandidate).toBeNull();
  });

  it('does not use database row identifiers as economic order', () => {
    const dataset = makeOptimizationDataset(qualityControlWalkForwardSnapshots());
    expect(dataset.includedMarketObservationIdentities.join(' ')).not.toMatch(/\b(id|rowid)\b/i);
    expect(runAnchoredWalkForward(dataset).folds[0]?.selectedEntryId).toBe('quality_control_v1');
  });
});
