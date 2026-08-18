import { describe, expect, it } from 'vitest';
import { fingerprintMlDataset } from '../src/ml/identity.js';
import { SAMPLE_COOLDOWN_MS } from '../src/ml/constants.js';
import { addMs, makeMlDataset, mlSnapshot, optimizationMint } from './ml-fixtures.js';
import { O17_END, O17_START } from './optimization-fixtures.js';

describe('ml dataset fingerprint', () => {
  it('is independent of snapshot insertion order and ignores wallet-intelligence readiness', () => {
    const a = mlSnapshot(optimizationMint(1), O17_START, 100);
    const b = mlSnapshot(optimizationMint(1), O17_END, 110);
    const forward = makeMlDataset([a, b]);
    const reversed = makeMlDataset([b, a]);
    expect(forward.mlDatasetFingerprint).toBe(reversed.mlDatasetFingerprint);
    expect(forward.mlDatasetFingerprint).toBe(fingerprintMlDataset(forward.samples));
    expect(forward.walletIntelligenceReadiness.usedAsModelInput).toBe(false);
    expect(forward.samples.every((sample) => sample.rawFeatures.every((feature) => !feature.name.includes('wallet')))).toBe(
      true,
    );
  });

  it('changes when a labeled row becomes censored and ignores later evidence outside the 6h window', () => {
    const token = optimizationMint(4);
    const entry = mlSnapshot(token, O17_START, 100);
    const close = mlSnapshot(token, addMs(O17_START, 60_000), 89);
    const span = mlSnapshot(optimizationMint(5), O17_END, 101);
    const labeled = makeMlDataset([entry, close, span]);
    const censored = makeMlDataset([entry, span]);
    expect(censored.mlDatasetFingerprint).not.toBe(labeled.mlDatasetFingerprint);
    const outsideWindow = mlSnapshot(token, addMs(O17_START, SAMPLE_COOLDOWN_MS + 1), 0);
    const withOutside = makeMlDataset([entry, close, outsideWindow, span]);
    expect(withOutside.mlDatasetFingerprint).toBe(labeled.mlDatasetFingerprint);
    const first = labeled.samples.find((sample) => sample.tokenMint === token);
    const again = withOutside.samples.find((sample) => sample.tokenMint === token);
    expect(again?.datasetLabel).toEqual(first?.datasetLabel);
  });
});
