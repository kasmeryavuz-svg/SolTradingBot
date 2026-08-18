import {
  buildChronologicalSegments,
  buildFoldBoundaries,
  isObservationInWindow,
  testWindow,
  trainWindow,
} from '../optimization/folds.js';
import type { FoldBoundaries } from '../optimization/types.js';
import { buildOptimizationIndexes } from '../optimization/timeline.js';
import {
  FOLD_TEST_MIN_LABELED,
  FOLD_TEST_MIN_NEGATIVES,
  FOLD_TEST_MIN_POSITIVES,
  FOLD_TRAIN_MIN_LABELED,
  FOLD_TRAIN_MIN_NEGATIVES,
  FOLD_TRAIN_MIN_POSITIVES,
  MAX_CENSORING_BPS,
} from './constants.js';
import { censoringBps, censoringExceedsLimit } from './censoring.js';
import { ML19_MODEL_FEATURES } from './features.js';
import { snapshotForSample, simulateX11Label, type LabelObservationBound } from './labels.js';
import type {
  FoldEvaluability,
  FoldPurgeCounts,
  MlDataset,
  MlDecisionSample,
  MlLabelOutcome,
} from './types.js';

export function mlSegmentsAndFolds(dataset: MlDataset): {
  segments: ReturnType<typeof buildChronologicalSegments>;
  folds: FoldBoundaries[] | null;
} {
  const segments = buildChronologicalSegments(dataset.optimization);
  const folds = segments === null ? null : buildFoldBoundaries(dataset.optimization, segments);
  return { segments, folds };
}

export function trainBound(fold: FoldBoundaries): LabelObservationBound {
  return {
    startExclusiveMs: fold.trainStartInclusiveMs - 1,
    endExclusiveMs: fold.testStartInclusiveMs,
    endInclusiveMs: fold.testStartInclusiveMs - 1,
  };
}

export function testBound(fold: FoldBoundaries): LabelObservationBound {
  return {
    startExclusiveMs: fold.testStartInclusiveMs - 1,
    endExclusiveMs: fold.testEndExclusiveMs,
    endInclusiveMs: fold.testEndInclusiveMs,
  };
}

export function sampleInTrainEntryWindow(sample: Pick<MlDecisionSample, 'collectedAtMs'>, fold: FoldBoundaries): boolean {
  return isObservationInWindow(sample.collectedAtMs, trainWindow(fold));
}

export function sampleInTestEntryWindow(sample: Pick<MlDecisionSample, 'collectedAtMs'>, fold: FoldBoundaries): boolean {
  return isObservationInWindow(sample.collectedAtMs, testWindow(fold));
}

export function labeledSample(sample: MlDecisionSample): boolean {
  return sample.datasetLabel.state !== 'CENSORED' && sample.datasetLabel.label !== null;
}

export function labeledOutcome(label: MlLabelOutcome): boolean {
  return label.state !== 'CENSORED' && label.label !== null;
}

export function isFeatureEligibleSample(sample: MlDecisionSample): boolean {
  return sample.rawFeatures.length === ML19_MODEL_FEATURES.length;
}

export function foldTestOutcome(dataset: MlDataset, sample: MlDecisionSample, fold: FoldBoundaries): MlLabelOutcome {
  const indexes = buildOptimizationIndexes({
    marketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
  return simulateX11Label({
    entry: snapshotForSample(sample, dataset.marketSnapshots),
    indexes,
    bound: testBound(fold),
  });
}

export function trainLabelCompletesBeforeTest(label: MlLabelOutcome, fold: FoldBoundaries): boolean {
  return label.completedAtMs !== null && label.completedAtMs < fold.testStartInclusiveMs;
}

export function testLabelContainedInTest(label: MlLabelOutcome, fold: FoldBoundaries): boolean {
  if (label.completedAtMs === null || label.state === 'CENSORED') {
    return false;
  }
  const test = testWindow(fold);
  return isObservationInWindow(label.completedAtMs, test);
}

export function partitionFoldSamples(
  dataset: MlDataset,
  fold: FoldBoundaries,
): {
  trainEntries: MlDecisionSample[];
  trainBeforePurge: MlDecisionSample[];
  trainPurged: MlDecisionSample[];
  trainAfterPurge: MlDecisionSample[];
  trainCensored: MlDecisionSample[];
  testAll: MlDecisionSample[];
  testFeatureEligible: MlDecisionSample[];
  testLabeled: MlDecisionSample[];
  testCensored: MlDecisionSample[];
  testOutcomes: Map<string, MlLabelOutcome>;
  purge: FoldPurgeCounts;
} {
  const indexes = buildOptimizationIndexes({
    marketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
  const trainEntries = dataset.samples.filter((sample) => sampleInTrainEntryWindow(sample, fold));
  const testEntries = dataset.samples.filter((sample) => sampleInTestEntryWindow(sample, fold));
  const trainCensored = trainEntries.filter((sample) => !labeledSample(sample));
  const trainBeforePurge = trainEntries.filter(labeledSample);
  const trainPurged = trainBeforePurge.filter(
    (sample) => !trainLabelCompletesBeforeTest(sample.datasetLabel, fold),
  );
  const trainAfterPurge = trainBeforePurge.filter((sample) =>
    trainLabelCompletesBeforeTest(sample.datasetLabel, fold),
  );
  const testFeatureEligible = testEntries.filter(isFeatureEligibleSample);
  const testOutcomes = new Map<string, MlLabelOutcome>();
  const testLabeled: MlDecisionSample[] = [];
  const testCensored: MlDecisionSample[] = [];
  for (const sample of testEntries) {
    const outcome = simulateX11Label({
      entry: snapshotForSample(sample, dataset.marketSnapshots),
      indexes,
      bound: testBound(fold),
    });
    testOutcomes.set(sample.sampleIdentity, outcome);
    if (labeledOutcome(outcome)) {
      testLabeled.push(sample);
    } else {
      testCensored.push(sample);
    }
  }
  const testPositiveCount = testLabeled.filter((sample) => {
    const outcome = testOutcomes.get(sample.sampleIdentity);
    return outcome?.state === 'POSITIVE';
  }).length;
  const testNegativeCount = testLabeled.filter((sample) => {
    const outcome = testOutcomes.get(sample.sampleIdentity);
    return outcome?.state === 'NON_POSITIVE';
  }).length;
  return {
    trainEntries,
    trainBeforePurge,
    trainPurged,
    trainAfterPurge,
    trainCensored,
    testAll: testEntries,
    testFeatureEligible,
    testLabeled,
    testCensored,
    testOutcomes,
    purge: {
      trainDecisionSamples: trainEntries.length,
      trainSamplesBeforePurge: trainBeforePurge.length,
      trainSamplesPurged: trainPurged.length,
      trainSamplesAfterPurge: trainAfterPurge.length,
      trainCensoredCount: trainCensored.length,
      trainCensoringBps: censoringBps(trainCensored.length, trainEntries.length),
      testDecisionSamples: testEntries.length,
      testFeatureEligibleSamples: testFeatureEligible.length,
      testSampleCount: testEntries.length,
      testLabeledCount: testLabeled.length,
      testPositiveCount,
      testNegativeCount,
      testCensoredCount: testCensored.length,
      testCensoringBps: censoringBps(testCensored.length, testEntries.length),
    },
  };
}

export function evaluateFoldDataSufficiency(partition: {
  trainEntries: readonly MlDecisionSample[];
  trainAfterPurge: readonly MlDecisionSample[];
  testAll: readonly MlDecisionSample[];
  testLabeled: readonly MlDecisionSample[];
  purge: FoldPurgeCounts;
}): FoldEvaluability {
  const trainLabeled = partition.trainAfterPurge.length;
  const testLabeled = partition.testLabeled.length;
  const trainPositives = partition.trainAfterPurge.filter((sample) => sample.datasetLabel.state === 'POSITIVE')
    .length;
  const trainNegatives = partition.trainAfterPurge.filter((sample) => sample.datasetLabel.state === 'NON_POSITIVE')
    .length;
  const testPositives = partition.purge.testPositiveCount;
  const testNegatives = partition.purge.testNegativeCount;
  const trainCensored = partition.purge.trainCensoredCount;
  const testCensored = partition.purge.testCensoredCount;
  const trainCensoringBps = partition.purge.trainCensoringBps;
  const testCensoringBps = partition.purge.testCensoringBps;
  const reasons: string[] = [];
  if (trainLabeled < FOLD_TRAIN_MIN_LABELED) {
    reasons.push(`TRAIN labeled ${String(trainLabeled)} < ${String(FOLD_TRAIN_MIN_LABELED)}`);
  }
  if (testLabeled < FOLD_TEST_MIN_LABELED) {
    reasons.push(`TEST labeled ${String(testLabeled)} < ${String(FOLD_TEST_MIN_LABELED)}`);
  }
  if (trainPositives < FOLD_TRAIN_MIN_POSITIVES) {
    reasons.push(`TRAIN positives ${String(trainPositives)} < ${String(FOLD_TRAIN_MIN_POSITIVES)}`);
  }
  if (trainNegatives < FOLD_TRAIN_MIN_NEGATIVES) {
    reasons.push(`TRAIN negatives ${String(trainNegatives)} < ${String(FOLD_TRAIN_MIN_NEGATIVES)}`);
  }
  if (testPositives < FOLD_TEST_MIN_POSITIVES) {
    reasons.push(`TEST positives ${String(testPositives)} < ${String(FOLD_TEST_MIN_POSITIVES)}`);
  }
  if (testNegatives < FOLD_TEST_MIN_NEGATIVES) {
    reasons.push(`TEST negatives ${String(testNegatives)} < ${String(FOLD_TEST_MIN_NEGATIVES)}`);
  }
  if (censoringExceedsLimit(trainCensoringBps) || trainCensoringBps === null) {
    reasons.push(
      `TRAIN label censoring ${trainCensoringBps === null ? 'n/a' : String(trainCensoringBps)} bps exceeds ${String(MAX_CENSORING_BPS)} bps or has no TRAIN decision samples`,
    );
  }
  if (censoringExceedsLimit(testCensoringBps) || testCensoringBps === null) {
    reasons.push(
      `TEST label censoring ${testCensoringBps === null ? 'n/a' : String(testCensoringBps)} bps exceeds ${String(MAX_CENSORING_BPS)} bps or has no TEST decision samples`,
    );
  }
  return {
    evaluable: reasons.length === 0,
    trainDecisionSamples: partition.trainEntries.length,
    trainLabeled,
    trainCensored,
    trainCensoringBps,
    testDecisionSamples: partition.testAll.length,
    testLabeled,
    testCensored,
    testCensoringBps,
    trainPositives,
    trainNegatives,
    testPositives,
    testNegatives,
    reasons,
  };
}

export function canonicalTrainOrder(samples: readonly MlDecisionSample[]): MlDecisionSample[] {
  return [...samples].sort((left, right) => {
    if (left.collectedAtMs !== right.collectedAtMs) {
      return left.collectedAtMs < right.collectedAtMs ? -1 : 1;
    }
    if (left.tokenMint !== right.tokenMint) {
      return left.tokenMint < right.tokenMint ? -1 : 1;
    }
    if (left.pairAddress !== right.pairAddress) {
      return left.pairAddress < right.pairAddress ? -1 : 1;
    }
    return left.sampleIdentity < right.sampleIdentity ? -1 : 1;
  });
}
