import { requireUtcTimestamp } from '../features/numbers.js';
import { MAX_OPTIMIZATION_HOLD_MS } from './constants.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT, fingerprintOptimizationFold } from './identity.js';
import { buildIntegerChronologicalSegments } from './partition.js';
import { isEntryEligible, isObservationInWindow, snapshotBelongsToSegment } from './folds-window.js';
import type { ChronologicalSegment, FoldBoundaries, OptimizationDataset, SimulationWindow } from './types.js';

export { isEntryEligible, isObservationInWindow, snapshotBelongsToSegment };

export function buildChronologicalSegments(dataset: OptimizationDataset): ChronologicalSegment[] | null {
  if (dataset.firstSnapshotAt === null || dataset.lastSnapshotAt === null || dataset.datasetSpanMs === null) {
    return null;
  }
  if (dataset.datasetSpanMs < 0) {
    return null;
  }
  return buildIntegerChronologicalSegments({
    firstSnapshotAt: dataset.firstSnapshotAt,
    lastSnapshotAt: dataset.lastSnapshotAt,
    marketSnapshots: dataset.marketSnapshots,
  });
}

export function buildFoldBoundaries(
  dataset: OptimizationDataset,
  segments: readonly ChronologicalSegment[],
): FoldBoundaries[] | null {
  if (segments.length !== 6) {
    return null;
  }
  const s1 = segments[0];
  const s2 = segments[1];
  const s3 = segments[2];
  const s4 = segments[3];
  const s5 = segments[4];
  const s6 = segments[5];
  if (
    s1 === undefined ||
    s2 === undefined ||
    s3 === undefined ||
    s4 === undefined ||
    s5 === undefined ||
    s6 === undefined
  ) {
    return null;
  }

  return [
    makeFold({
      foldId: 1,
      dataset,
      trainStartInclusiveMs: s1.startInclusiveMs,
      trainEndExclusiveMs: s3.startInclusiveMs,
      testStartInclusiveMs: s3.startInclusiveMs,
      testEndExclusiveMs: s3.endExclusiveMs,
      testEndInclusiveMs: s3.endInclusiveMs,
      trainSegmentIds: ['S1', 'S2'],
      testSegmentId: 'S3',
    }),
    makeFold({
      foldId: 2,
      dataset,
      trainStartInclusiveMs: s1.startInclusiveMs,
      trainEndExclusiveMs: s4.startInclusiveMs,
      testStartInclusiveMs: s4.startInclusiveMs,
      testEndExclusiveMs: s4.endExclusiveMs,
      testEndInclusiveMs: s4.endInclusiveMs,
      trainSegmentIds: ['S1', 'S2', 'S3'],
      testSegmentId: 'S4',
    }),
    makeFold({
      foldId: 3,
      dataset,
      trainStartInclusiveMs: s1.startInclusiveMs,
      trainEndExclusiveMs: s5.startInclusiveMs,
      testStartInclusiveMs: s5.startInclusiveMs,
      testEndExclusiveMs: s5.endExclusiveMs,
      testEndInclusiveMs: s5.endInclusiveMs,
      trainSegmentIds: ['S1', 'S2', 'S3', 'S4'],
      testSegmentId: 'S5',
    }),
    makeFold({
      foldId: 4,
      dataset,
      trainStartInclusiveMs: s1.startInclusiveMs,
      trainEndExclusiveMs: s6.startInclusiveMs,
      testStartInclusiveMs: s6.startInclusiveMs,
      testEndExclusiveMs: null,
      testEndInclusiveMs: s6.endInclusiveMs,
      trainSegmentIds: ['S1', 'S2', 'S3', 'S4', 'S5'],
      testSegmentId: 'S6',
    }),
  ];
}

function makeFold(input: {
  foldId: 1 | 2 | 3 | 4;
  dataset: OptimizationDataset;
  trainStartInclusiveMs: number;
  trainEndExclusiveMs: number;
  testStartInclusiveMs: number;
  testEndExclusiveMs: number | null;
  testEndInclusiveMs: number;
  trainSegmentIds: FoldBoundaries['trainSegmentIds'];
  testSegmentId: FoldBoundaries['testSegmentId'];
}): FoldBoundaries {
  const trainLatestEntryInclusiveMs = input.trainEndExclusiveMs - MAX_OPTIMIZATION_HOLD_MS;
  const testObservationEndMs =
    input.testEndExclusiveMs === null ? input.testEndInclusiveMs : input.testEndExclusiveMs;
  const testLatestEntryInclusiveMs = testObservationEndMs - MAX_OPTIMIZATION_HOLD_MS;
  return {
    foldId: input.foldId,
    trainSegmentIds: input.trainSegmentIds,
    testSegmentId: input.testSegmentId,
    trainStartInclusiveMs: input.trainStartInclusiveMs,
    trainEndExclusiveMs: input.trainEndExclusiveMs,
    testStartInclusiveMs: input.testStartInclusiveMs,
    testEndExclusiveMs: input.testEndExclusiveMs,
    testEndInclusiveMs: input.testEndInclusiveMs,
    trainLatestEntryInclusiveMs,
    testLatestEntryInclusiveMs,
    optimizationFoldFingerprint: fingerprintOptimizationFold({
      optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
      optimizationDatasetFingerprint: input.dataset.optimizationDatasetFingerprint,
      foldId: input.foldId,
      trainStartInclusiveMs: input.trainStartInclusiveMs,
      trainEndExclusiveMs: input.trainEndExclusiveMs,
      testStartInclusiveMs: input.testStartInclusiveMs,
      testEndExclusiveMs: input.testEndExclusiveMs,
      testEndInclusiveMs: input.testEndInclusiveMs,
      trainLatestEntryInclusiveMs,
      testLatestEntryInclusiveMs,
    }),
  };
}

export function trainWindow(fold: FoldBoundaries): SimulationWindow {
  return {
    kind: 'train',
    startInclusiveMs: fold.trainStartInclusiveMs,
    observationEndExclusiveMs: fold.trainEndExclusiveMs,
    observationEndInclusiveMs: fold.trainEndExclusiveMs,
    latestEntryInclusiveMs: fold.trainLatestEntryInclusiveMs,
  };
}

export function testWindow(fold: FoldBoundaries): SimulationWindow {
  return {
    kind: 'test',
    startInclusiveMs: fold.testStartInclusiveMs,
    observationEndExclusiveMs: fold.testEndExclusiveMs,
    observationEndInclusiveMs: fold.testEndInclusiveMs,
    latestEntryInclusiveMs: fold.testLatestEntryInclusiveMs,
  };
}

export function fullHistoryWindow(dataset: OptimizationDataset): SimulationWindow | null {
  if (dataset.firstSnapshotAt === null || dataset.lastSnapshotAt === null) {
    return null;
  }
  const startInclusiveMs = requireUtcTimestamp(dataset.firstSnapshotAt, 'firstSnapshotAt');
  const lastMs = requireUtcTimestamp(dataset.lastSnapshotAt, 'lastSnapshotAt');
  return {
    kind: 'full_history',
    startInclusiveMs,
    observationEndExclusiveMs: null,
    observationEndInclusiveMs: lastMs,
    latestEntryInclusiveMs: lastMs - MAX_OPTIMIZATION_HOLD_MS,
  };
}

export function walkForwardStructurallyPossible(
  segments: readonly ChronologicalSegment[] | null,
  folds: readonly FoldBoundaries[] | null,
): boolean {
  if (segments === null || folds === null) {
    return false;
  }
  if (segments.length !== 6 || folds.length !== 4) {
    return false;
  }
  for (let i = 1; i < segments.length; i += 1) {
    const prev = segments[i - 1];
    const next = segments[i];
    if (prev === undefined || next === undefined || !(next.startInclusiveMs >= prev.startInclusiveMs)) {
      return false;
    }
  }
  return folds.every(
    (fold) =>
      fold.trainEndExclusiveMs >= fold.trainStartInclusiveMs &&
      fold.testStartInclusiveMs >= fold.trainEndExclusiveMs &&
      fold.testEndInclusiveMs >= fold.testStartInclusiveMs,
  );
}

export function foldHasEligibleTrainingEntryWindow(fold: FoldBoundaries): boolean {
  return fold.trainLatestEntryInclusiveMs >= fold.trainStartInclusiveMs;
}

export function foldHasEligibleTestEntryWindow(fold: FoldBoundaries): boolean {
  return fold.testLatestEntryInclusiveMs >= fold.testStartInclusiveMs;
}
