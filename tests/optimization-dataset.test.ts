import { describe, expect, it } from 'vitest';
import { researchMarketObservationIdentity } from '../src/research/identity.js';
import { fingerprintOptimizationDataset } from '../src/optimization/identity.js';
import {
  makeOptimizationDataset,
  O17_START,
  qualityControlOnlySnapshot,
} from './optimization-fixtures.js';
import { addMs } from './exit-fixtures.js';

describe('optimization dataset identity', () => {
  it('is deterministic for the same observations and changes when content or exclusions change', () => {
    const snapshots = [
      qualityControlOnlySnapshot({ collectedAt: O17_START, priceUsd: 100 }),
      qualityControlOnlySnapshot({ collectedAt: addMs(O17_START, 60_000), priceUsd: 101 }),
    ];
    const first = makeOptimizationDataset(snapshots);
    const reversed = makeOptimizationDataset([...snapshots].reverse());
    expect(first.optimizationDatasetFingerprint).toBe(reversed.optimizationDatasetFingerprint);
    expect(first.optimizationDatasetFingerprint).toBe(
      fingerprintOptimizationDataset({
        includedMarketObservationIdentities: first.includedMarketObservationIdentities,
        riskEvidenceIdentities: first.riskEvidenceIdentities,
        excludedRuntimeExitMarketIdentities: first.excludedRuntimeExitMarketIdentities,
        runtimeExitReferencedSnapshotCountExcluded: first.runtimeExitReferencedSnapshotCountExcluded,
        firstSnapshotAt: first.firstSnapshotAt,
        lastSnapshotAt: first.lastSnapshotAt,
        rawMarketSnapshotCount: first.rawMarketSnapshotCount,
        researchMarketSnapshotCount: first.researchMarketSnapshotCount,
        uniqueTokenCount: first.uniqueTokenCount,
        uniquePairCount: first.uniquePairCount,
        riskScanCount: first.riskScanCount,
      }),
    );
    const excludedSnapshot = snapshots[0];
    if (excludedSnapshot === undefined) {
      throw new Error('expected a snapshot');
    }
    const withExclusion = makeOptimizationDataset(snapshots, undefined, {
      excludedRuntimeExitMarketIdentities: [researchMarketObservationIdentity(excludedSnapshot)],
      runtimeExitReferencedSnapshotCountExcluded: 1,
      rawMarketSnapshotCount: 3,
    });
    expect(withExclusion.optimizationDatasetFingerprint).not.toBe(first.optimizationDatasetFingerprint);
    expect(withExclusion.runtimeExitReferencedSnapshotCountExcluded).toBe(1);
    expect(first.schemaVersion).toBe(8);
    expect(first.migration009Present).toBe(false);
  });

  it('does not bind current time or filesystem paths', () => {
    const dataset = makeOptimizationDataset([qualityControlOnlySnapshot()]);
    expect(dataset.optimizationDatasetFingerprint).toMatch(/^[0-9a-f]{64}$/);
    expect(dataset.optimizationDatasetFingerprint).not.toContain('\\');
    expect(dataset.optimizationDatasetFingerprint).not.toContain('C:');
    expect(JSON.stringify(dataset)).not.toContain(process.cwd());
  });
});
