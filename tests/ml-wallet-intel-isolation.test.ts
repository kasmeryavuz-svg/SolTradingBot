import { describe, expect, it } from 'vitest';
import { buildMlDataset } from '../src/ml/dataset.js';
import { runPurgedWalkForward } from '../src/ml/walk-forward.js';
import { makeOptimizationDataset, O17_END, O17_START } from './optimization-fixtures.js';
import { mlSnapshot, optimizationMint } from './ml-fixtures.js';
import { WALLET_INTELLIGENCE_REASON } from '../src/ml/constants.js';
import type { WalletIntelligenceReadiness } from '../src/ml/types.js';

describe('ml wallet intelligence isolation', () => {
  it('does not change the dataset fingerprint or TRAIN model when future wi18 scans appear in readiness counters', () => {
    const snapshots = [
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(optimizationMint(1), O17_START, 100),
      mlSnapshot(optimizationMint(1), O17_END, 89),
    ];
    const optimization = makeOptimizationDataset(snapshots);
    const none: WalletIntelligenceReadiness = {
      scanCount: 0,
      earliestScanStartedAtMs: null,
      latestScanStartedAtMs: null,
      marketSamplesSafelyPointInTimeAlignable: 0,
      usedAsModelInput: false,
      reason: WALLET_INTELLIGENCE_REASON,
    };
    const future: WalletIntelligenceReadiness = {
      scanCount: 40,
      earliestScanStartedAtMs: Date.parse(O17_END) + 1,
      latestScanStartedAtMs: Date.parse(O17_END) + 86_400_000,
      marketSamplesSafelyPointInTimeAlignable: 0,
      usedAsModelInput: false,
      reason: WALLET_INTELLIGENCE_REASON,
    };
    const before = buildMlDataset({ optimization, walletIntelligenceReadiness: none });
    const after = buildMlDataset({ optimization, walletIntelligenceReadiness: future });
    expect(after.mlDatasetFingerprint).toBe(before.mlDatasetFingerprint);
    expect(after.samples).toHaveLength(before.samples.length);
    expect(after.walletIntelligenceReadiness.scanCount).toBe(40);
    expect(before.walletIntelligenceReadiness.scanCount).toBe(0);
    const modelBefore = runPurgedWalkForward(before);
    const modelAfter = runPurgedWalkForward(after);
    expect(modelAfter.folds[0]?.logistic?.coefficients).toEqual(modelBefore.folds[0]?.logistic?.coefficients);
    expect(before.samples.every((sample) => sample.rawFeatures.every((feature) => !feature.name.includes('wi18')))).toBe(
      true,
    );
  });
});
