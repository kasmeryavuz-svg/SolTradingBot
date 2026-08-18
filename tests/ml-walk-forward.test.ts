import { describe, expect, it } from 'vitest';
import { runPurgedWalkForward } from '../src/ml/walk-forward.js';
import { fitPreprocessor } from '../src/ml/preprocessing.js';
import { canonicalTrainOrder, mlSegmentsAndFolds, partitionFoldSamples } from '../src/ml/folds.js';
import { chronologicalCutMs } from '../src/optimization/partition.js';
import { O17_END, O17_START } from './optimization-fixtures.js';
import { makeMlDataset, mlSnapshot, optimizationMint } from './ml-fixtures.js';
import type { MlDataset } from '../src/ml/types.js';

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function lookaheadDataset(): MlDataset {
  const firstMs = Date.parse(O17_START);
  const lastMs = Date.parse(O17_END);
  const cuts = chronologicalCutMs(firstMs, lastMs);
  const s1 = cuts[0];
  const s3 = cuts[2];
  if (s1 === undefined || s3 === undefined) {
    throw new Error('missing cuts');
  }
  return makeMlDataset([
    mlSnapshot(optimizationMint(0), O17_START, 100),
    mlSnapshot(optimizationMint(1), iso(s1 + 60_000), 100),
    mlSnapshot(optimizationMint(1), iso(s1 + 120_000), 89),
    mlSnapshot(optimizationMint(2), iso(s3 + 60_000), 100),
    mlSnapshot(optimizationMint(2), iso(s3 + 120_000), 89),
    mlSnapshot(optimizationMint(0), O17_END, 101),
  ]);
}

describe('ml walk-forward lookahead isolation', () => {
  it('does not let mutated TEST labels or TEST features change TRAIN coefficients or TRAIN stats', () => {
    const base = lookaheadDataset();
    const { folds } = mlSegmentsAndFolds(base);
    const fold = folds?.[0];
    if (fold === undefined) {
      throw new Error('fold');
    }
    const report = runPurgedWalkForward(base);
    const fold1 = report.folds[0];
    const partition = partitionFoldSamples(base, fold);
    expect(partition.trainAfterPurge.length).toBeGreaterThan(0);
    expect(partition.testLabeled.length).toBeGreaterThan(0);
    const trainFit = fitPreprocessor(
      canonicalTrainOrder(partition.trainAfterPurge).map((sample) => sample.rawFeatures),
    );
    const testIds = new Set(partition.testLabeled.map((sample) => sample.sampleIdentity));
    const mutated: MlDataset = {
      ...base,
      samples: base.samples.map((sample) => {
        if (!testIds.has(sample.sampleIdentity)) {
          return sample;
        }
        return {
          ...sample,
          rawFeatures: sample.rawFeatures.map((feature) =>
            feature.name === 'market_price_usd'
              ? { ...feature, status: 'available', numericValue: 1_000_000 }
              : feature,
          ),
          datasetLabel: {
            ...sample.datasetLabel,
            state: 'POSITIVE',
            label: 1,
          },
        };
      }),
    };
    const mutatedReport = runPurgedWalkForward(mutated);
    const mutatedPartition = partitionFoldSamples(mutated, fold);
    const mutatedTrainFit = fitPreprocessor(
      canonicalTrainOrder(mutatedPartition.trainAfterPurge).map((sample) => sample.rawFeatures),
    );
    expect(mutatedTrainFit.numeric[0]?.median).toBe(trainFit.numeric[0]?.median);
    expect(mutatedTrainFit.numeric[0]?.mean).toBe(trainFit.numeric[0]?.mean);
    expect(mutatedTrainFit.numeric[0]?.std).toBe(trainFit.numeric[0]?.std);
    expect(mutatedReport.folds[0]?.logistic?.coefficients).toEqual(fold1?.logistic?.coefficients);
    expect(mutatedReport.folds[0]?.logistic?.intercept).toBe(fold1?.logistic?.intercept);
  });

  it('does not let later-fold snapshots change an earlier fold model', () => {
    const base = lookaheadDataset();
    const original = runPurgedWalkForward(base);
    const mutated = makeMlDataset([
      ...base.marketSnapshots,
      mlSnapshot(optimizationMint(90), O17_END, 0.0001),
    ]);
    const later = runPurgedWalkForward(mutated);
    expect(later.folds[0]?.logistic?.coefficients).toEqual(original.folds[0]?.logistic?.coefficients);
  });

  it('does not train a candidate during ml:run', () => {
    const report = runPurgedWalkForward(lookaheadDataset());
    expect(report.candidateTrainingInvoked).toBe(false);
    expect(report.candidate).toBeNull();
    expect(report.promotionStatus).toBe('NO_MODEL_PROMOTION_INSUFFICIENT_DATA');
  });
});
