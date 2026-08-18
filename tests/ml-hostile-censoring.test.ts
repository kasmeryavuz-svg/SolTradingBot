import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectedEconomicSlice } from '../src/ml/economic.js';
import { assignSampleIdentity } from '../src/ml/identity.js';
import { classificationMetrics, isResearchSelected } from '../src/ml/metrics.js';
import { trainForwardCandidate } from '../src/ml/candidate.js';
import { runPurgedWalkForward } from '../src/ml/walk-forward.js';
import { canonicalTrainOrder, mlSegmentsAndFolds, partitionFoldSamples } from '../src/ml/folds.js';
import type { MlDecisionSample, MlLabelOutcome, PredictedSample } from '../src/ml/types.js';
import { addMs, makeMlDataset, mlSnapshot, optimizationMint, O17_END, O17_START } from './ml-fixtures.js';
import { chronologicalCutMs } from '../src/optimization/partition.js';

function collectTransitiveSources(entryFile: string): string[] {
  const seen = new Set<string>();
  const queue = [entryFile];
  while (queue.length > 0) {
    const file = queue.pop();
    if (file === undefined || seen.has(file) || !existsSync(file)) {
      continue;
    }
    seen.add(file);
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(/from '(\.\.?\/[^']+)\.js'/g)) {
      const specifier = match[1];
      if (specifier === undefined) {
        continue;
      }
      const resolved = `${normalize(join(dirname(file), specifier))}.ts`;
      if (existsSync(resolved)) {
        queue.push(resolved);
      }
    }
  }
  return [...seen];
}

function outcome(state: 'POSITIVE' | 'NON_POSITIVE' | 'CENSORED'): MlLabelOutcome {
  if (state === 'CENSORED') {
    return {
      state,
      label: null,
      censorReason: 'unresolved_no_closing_observation',
      completedAt: null,
      completedAtMs: null,
      exitReason: null,
      grossExitReferenceUsd: null,
      observedExitPriceUsd: null,
      grossPnlUsd: null,
      netBasePnlUsd: null,
      netStressPnlUsd: null,
      netLowPnlUsd: null,
      holdingDurationMs: null,
      quantityTokens: null,
    };
  }
  const win = state === 'POSITIVE';
  return {
    state,
    label: win ? 1 : 0,
    censorReason: null,
    completedAt: ML_T0,
    completedAtMs: Date.parse(ML_T0),
    exitReason: win ? 'take_profit_threshold' : 'stop_loss_threshold',
    grossExitReferenceUsd: win ? 121 : 89,
    observedExitPriceUsd: win ? 121 : 89,
    grossPnlUsd: win ? 21 : -11,
    netBasePnlUsd: win ? 16 : -15,
    netStressPnlUsd: win ? 10 : -20,
    netLowPnlUsd: win ? 16 : -15,
    holdingDurationMs: 60_000,
    quantityTokens: 1,
  };
}

const ML_T0 = '2026-01-01T00:00:00.000Z';

function predicted(tokenMint: string, probability: number, state: 'POSITIVE' | 'NON_POSITIVE' | 'CENSORED'): PredictedSample {
  const snapshot = mlSnapshot(tokenMint, ML_T0, 100);
  const label = outcome(state);
  const sample: MlDecisionSample = assignSampleIdentity({
    tokenMint,
    pairAddress: snapshot.pairAddress,
    collectedAt: snapshot.collectedAt,
    collectedAtMs: Date.parse(snapshot.collectedAt),
    entryPriceUsd: 100,
    rawFeatures: [],
    datasetLabel: label,
  });
  return {
    sample,
    foldOutcome: label,
    probability,
    nullProbability: 0.5,
    selected: isResearchSelected(probability),
    novelToken: false,
  };
}

describe('ml hostile censoring and prediction universe', () => {
  it('selects censored TEST rows that beat 0.65 and keeps classification on labeled rows only', () => {
    const a = predicted(optimizationMint(1), 0.8, 'POSITIVE');
    const b = predicted(optimizationMint(2), 0.7, 'NON_POSITIVE');
    const c = predicted(optimizationMint(3), 0.9, 'CENSORED');
    const d = predicted(optimizationMint(4), 0.1, 'CENSORED');
    const slice = selectedEconomicSlice([a, b, c, d]);
    expect(slice.selectedOpened).toBe(3);
    expect(slice.completed).toBe(2);
    expect(slice.censored).toBe(1);
    expect(slice.censoredIdentities).toEqual([c.sample.sampleIdentity]);
    expect(slice.selectedIdentities).toEqual([
      a.sample.sampleIdentity,
      b.sample.sampleIdentity,
      c.sample.sampleIdentity,
    ]);
    const classified = classificationMetrics([
      { probability: 0.8, label: 1 },
      { probability: 0.7, label: 0 },
    ]);
    expect(classified.labeledSamples).toBe(2);
    expect(classified.selectedCount).toBe(2);
  });

  it('does not change TEST probability when a censored sample later becomes completed', () => {
    const firstMs = Date.parse(O17_START);
    const lastMs = Date.parse(O17_END);
    const cuts = chronologicalCutMs(firstMs, lastMs);
    const s1 = cuts[0];
    const s3 = cuts[2];
    if (s1 === undefined || s3 === undefined) {
      throw new Error('cuts');
    }
    const iso = (ms: number): string => new Date(ms).toISOString();
    const trainMint = optimizationMint(30);
    const testMint = optimizationMint(31);
    const base = [
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(trainMint, iso(s1 + 60_000), 100),
      mlSnapshot(trainMint, iso(s1 + 120_000), 89),
      mlSnapshot(testMint, iso(s3 + 60_000), 100),
      mlSnapshot(optimizationMint(0), O17_END, 101),
    ];
    const censored = runPurgedWalkForward(makeMlDataset(base));
    const completed = runPurgedWalkForward(
      makeMlDataset([...base, mlSnapshot(testMint, iso(s3 + 120_000), 121)]),
    );
    const before = censored.folds[0]?.testPredictions.find((item) => item.sample.tokenMint === testMint);
    const after = completed.folds[0]?.testPredictions.find((item) => item.sample.tokenMint === testMint);
    expect(before?.probability).toBe(after?.probability);
    expect(before?.selected).toBe(after?.selected);
    expect(before?.foldOutcome.state).toBe('CENSORED');
    expect(after?.foldOutcome.state).toBe('POSITIVE');
  });

  it('treats a censored TRAIN decision sample as historically seen, not novel', () => {
    const firstMs = Date.parse(O17_START);
    const cuts = chronologicalCutMs(firstMs, Date.parse(O17_END));
    const s1 = cuts[0];
    const s3 = cuts[2];
    if (s1 === undefined || s3 === undefined) {
      throw new Error('cuts');
    }
    const iso = (ms: number): string => new Date(ms).toISOString();
    const seen = optimizationMint(40);
    const dataset = makeMlDataset([
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(seen, iso(s1 + 60_000), 100),
      mlSnapshot(optimizationMint(41), iso(s1 + 120_000), 100),
      mlSnapshot(optimizationMint(41), iso(s1 + 180_000), 89),
      mlSnapshot(seen, iso(s3 + 60_000), 100),
      mlSnapshot(seen, iso(s3 + 120_000), 89),
      mlSnapshot(optimizationMint(0), O17_END, 101),
    ]);
    const fold = mlSegmentsAndFolds(dataset).folds?.[0];
    if (fold === undefined) {
      throw new Error('fold');
    }
    const partition = partitionFoldSamples(dataset, fold);
    expect(partition.trainEntries.some((sample) => sample.tokenMint === seen)).toBe(true);
    expect(partition.trainAfterPurge.some((sample) => sample.tokenMint === seen)).toBe(false);
    const report = runPurgedWalkForward(dataset);
    const testSeen = report.folds[0]?.testPredictions.find((item) => item.sample.tokenMint === seen);
    expect(testSeen?.novelToken).toBe(false);
  });

  it('excludes candidate samples whose 6h outcome is not known by the cutoff', () => {
    const token = optimizationMint(50);
    const late = optimizationMint(51);
    const cutoff = addMs(O17_START, 3_600_000);
    const known = makeMlDataset([
      mlSnapshot(token, O17_START, 100),
      mlSnapshot(token, addMs(O17_START, 60_000), 121),
      mlSnapshot(late, O17_START, 100),
      mlSnapshot(optimizationMint(52), cutoff, 100),
    ]);
    const withFutureComplete = makeMlDataset([
      ...known.marketSnapshots,
      mlSnapshot(late, addMs(cutoff, 60_000), 121),
    ]);
    const early = trainForwardCandidate(known);
    const later = trainForwardCandidate(withFutureComplete);
    expect(early.trainingCutoffAt).toBe(known.lastSnapshotAt);
    expect(later.trainingCutoffAt).toBe(withFutureComplete.lastSnapshotAt);
    expect(later.labeledTrainingCount).toBeGreaterThan(early.labeledTrainingCount);
    expect(later.candidateFingerprint).not.toBe(early.candidateFingerprint);
  });

  it('keeps canonical TRAIN order so reversed snapshot insertion does not change coefficients', () => {
    const firstMs = Date.parse(O17_START);
    const cuts = chronologicalCutMs(firstMs, Date.parse(O17_END));
    const s1 = cuts[0];
    const s3 = cuts[2];
    if (s1 === undefined || s3 === undefined) {
      throw new Error('cuts');
    }
    const iso = (ms: number): string => new Date(ms).toISOString();
    const snapshots = [
      mlSnapshot(optimizationMint(0), O17_START, 100),
      mlSnapshot(optimizationMint(60), iso(s1 + 60_000), 100),
      mlSnapshot(optimizationMint(60), iso(s1 + 120_000), 89),
      mlSnapshot(optimizationMint(61), iso(s1 + 180_000), 100),
      mlSnapshot(optimizationMint(61), iso(s1 + 240_000), 121),
      mlSnapshot(optimizationMint(62), iso(s3 + 60_000), 100),
      mlSnapshot(optimizationMint(62), iso(s3 + 120_000), 89),
      mlSnapshot(optimizationMint(0), O17_END, 101),
    ];
    const forward = runPurgedWalkForward(makeMlDataset(snapshots));
    const reversed = runPurgedWalkForward(makeMlDataset([...snapshots].reverse()));
    expect(reversed.folds[0]?.logistic?.coefficients).toEqual(forward.folds[0]?.logistic?.coefficients);
    expect(reversed.mlDatasetFingerprint).toBe(forward.mlDatasetFingerprint);
    const fold = mlSegmentsAndFolds(makeMlDataset(snapshots)).folds?.[0];
    if (fold === undefined) {
      throw new Error('fold');
    }
    const partition = partitionFoldSamples(makeMlDataset(snapshots), fold);
    expect(canonicalTrainOrder([...partition.trainAfterPurge].reverse()).map((sample) => sample.sampleIdentity)).toEqual(
      canonicalTrainOrder(partition.trainAfterPurge).map((sample) => sample.sampleIdentity),
    );
  });
});

describe('ml command import isolation', () => {
  it('does not load the trainer from ml:data, ml:status, or ml:features', () => {
    const root = process.cwd();
    const dataFiles = collectTransitiveSources(join(root, 'src/ml/data.ts'));
    const statusFiles = collectTransitiveSources(join(root, 'src/ml/status.ts'));
    const featureFiles = collectTransitiveSources(join(root, 'src/ml/features-command.ts'));
    for (const file of dataFiles) {
      const normalized = file.replaceAll('\\', '/');
      expect(normalized).not.toMatch(/\/src\/ml\/logistic\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/walk-forward\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/candidate\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/pipeline\.ts$/);
    }
    for (const file of [...statusFiles, ...featureFiles]) {
      const normalized = file.replaceAll('\\', '/');
      expect(normalized).not.toMatch(/\/src\/ml\/logistic\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/walk-forward\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/candidate\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/pipeline\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/dataset\.ts$/);
      expect(normalized).not.toMatch(/\/src\/ml\/folds\.ts$/);
      expect(normalized).not.toMatch(/\/src\/persistence\/sqlite\//);
    }
  });

  it('does not mention sqlite in status/features source trees', () => {
    const files = readdirSync(join(process.cwd(), 'src/ml'))
      .filter((name) => name === 'status.ts' || name === 'features-command.ts' || name === 'format.ts')
      .map((name) => readFileSync(join(process.cwd(), 'src/ml', name), 'utf8'))
      .join('\n');
    expect(files).not.toMatch(/openReadOnlyResearchDatabase|PRAGMA query_only/);
  });
});
