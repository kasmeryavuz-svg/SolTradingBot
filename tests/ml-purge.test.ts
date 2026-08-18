import { describe, expect, it } from 'vitest';
import { SAMPLE_COOLDOWN_MS } from '../src/ml/constants.js';
import { partitionFoldSamples, mlSegmentsAndFolds } from '../src/ml/folds.js';
import { chronologicalCutMs } from '../src/optimization/partition.js';
import { O17_END, O17_START } from './optimization-fixtures.js';
import { addMs, makeMlDataset, mlSnapshot, optimizationMint } from './ml-fixtures.js';

describe('ml purge and o17 partitions', () => {
  it('purges TRAIN labels that end at TEST start and keeps labels one ms earlier', () => {
    const firstMs = Date.parse(O17_START);
    const lastMs = Date.parse(O17_END);
    const cuts = chronologicalCutMs(firstMs, lastMs);
    const testStart = cuts[2];
    if (testStart === undefined) {
      throw new Error('missing S3 start');
    }
    const testStartIso = new Date(testStart).toISOString();
    const beforeIso = new Date(testStart - 1).toISOString();
    const trainMint = optimizationMint(20);
    const keepMint = optimizationMint(21);
    const dataset = makeMlDataset([
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(trainMint, addMs(testStartIso, -60_000), 100),
      mlSnapshot(trainMint, testStartIso, 89),
      mlSnapshot(keepMint, addMs(beforeIso, -60_000), 100),
      mlSnapshot(keepMint, beforeIso, 89),
      mlSnapshot(optimizationMint(0), O17_END, 101),
    ]);
    const { folds } = mlSegmentsAndFolds(dataset);
    const fold1 = folds?.[0];
    if (fold1 === undefined) {
      throw new Error('fold1');
    }
    expect(fold1.testStartInclusiveMs).toBe(testStart);
    const partition = partitionFoldSamples(dataset, fold1);
    const purged = partition.trainPurged.map((sample) => sample.tokenMint);
    const kept = partition.trainAfterPurge.map((sample) => sample.tokenMint);
    expect(purged).toContain(trainMint);
    expect(kept).toContain(keepMint);
    expect(partition.trainAfterPurge.every((sample) => (sample.datasetLabel.completedAtMs ?? 0) < testStart)).toBe(
      true,
    );
  });

  it('censors a TEST label that requires the next segment', () => {
    const firstMs = Date.parse(O17_START);
    const lastMs = Date.parse(O17_END);
    const cuts = chronologicalCutMs(firstMs, lastMs);
    const s3Start = cuts[2];
    const s4Start = cuts[3];
    if (s3Start === undefined || s4Start === undefined) {
      throw new Error('cuts');
    }
    const token = optimizationMint(22);
    const entry = new Date(s3Start + 60_000).toISOString();
    const completion = new Date(s4Start).toISOString();
    const dataset = makeMlDataset([
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(token, entry, 100),
      mlSnapshot(token, completion, 89),
      mlSnapshot(optimizationMint(0), O17_END, 101),
    ]);
    const fold1 = mlSegmentsAndFolds(dataset).folds?.[0];
    if (fold1 === undefined) {
      throw new Error('fold1');
    }
    const partition = partitionFoldSamples(dataset, fold1);
    expect(partition.testCensored.some((sample) => sample.tokenMint === token)).toBe(true);
    expect(partition.testLabeled.some((sample) => sample.tokenMint === token)).toBe(false);
  });

  it('does not invent floating partition boundaries', () => {
    const cuts = chronologicalCutMs(Date.parse(O17_START), Date.parse(O17_END));
    expect(cuts.every((value) => Number.isInteger(value))).toBe(true);
    expect(SAMPLE_COOLDOWN_MS).toBe(21_600_000);
  });
});
