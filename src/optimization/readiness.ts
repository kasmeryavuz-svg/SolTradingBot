import { requireUtcTimestamp } from '../features/numbers.js';
import {
  foldHasEligibleTestEntryWindow,
  foldHasEligibleTrainingEntryWindow,
  isEntryEligible,
  isObservationInWindow,
  testWindow,
  trainWindow,
  walkForwardStructurallyPossible,
} from './folds.js';
import type {
  ChronologicalSegment,
  FoldBoundaries,
  OptimizationDataset,
  StructuralReadiness,
} from './types.js';

export function evaluateStructuralReadiness(input: {
  dataset: OptimizationDataset;
  segments: readonly ChronologicalSegment[] | null;
  folds: readonly FoldBoundaries[] | null;
  promotionDataSufficient: boolean;
}): StructuralReadiness {
  const timePartitionsConstructible = input.segments !== null && input.segments.length === 6;
  const walkForwardEvaluable = isWalkForwardEvaluable(input.dataset, input.segments, input.folds);
  return {
    timePartitionsConstructible,
    walkForwardEvaluable,
    promotionDataSufficient: input.promotionDataSufficient,
  };
}

export function isWalkForwardEvaluable(
  dataset: OptimizationDataset,
  segments: readonly ChronologicalSegment[] | null,
  folds: readonly FoldBoundaries[] | null,
): boolean {
  if (!walkForwardStructurallyPossible(segments, folds) || segments === null || folds === null) {
    return false;
  }
  if (folds.length !== 4) {
    return false;
  }
  return folds.every((fold) => {
    if (!foldHasEligibleTrainingEntryWindow(fold) || !foldHasEligibleTestEntryWindow(fold)) {
      return false;
    }
    const train = trainWindow(fold);
    const test = testWindow(fold);
    let trainEntry = false;
    let testObservation = false;
    let testEntry = false;
    for (const snapshot of dataset.marketSnapshots) {
      const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
      if (isEntryEligible(collectedMs, train)) {
        trainEntry = true;
      }
      if (isObservationInWindow(collectedMs, test)) {
        testObservation = true;
      }
      if (isEntryEligible(collectedMs, test)) {
        testEntry = true;
      }
    }
    return trainEntry && testObservation && testEntry;
  });
}
