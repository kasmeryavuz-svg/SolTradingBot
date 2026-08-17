import { evaluatePositionAction } from '../src/position/evaluator.js';
import { openPaperPositionFromEvaluation } from '../src/position/invariants.js';
import type { PositionBundle } from '../src/persistence/types.js';
import {
  insufficientPaperBundle,
  noEntryPaperBundle,
  paperBundle,
  paperBundleAt,
} from './paper-fixtures.js';

export function positionBundle(
  overrides: Parameters<typeof paperBundle>[0] = {},
): PositionBundle {
  const bundle = paperBundle(overrides);
  return {
    ...bundle,
    priorOpenPosition: null,
    positionEvaluation: evaluatePositionAction({
      paperEvaluation: bundle.paperEvaluation,
      currentOpenPosition: null,
    }),
  };
}

export function noEntryPositionBundle(): PositionBundle {
  const bundle = noEntryPaperBundle();
  return {
    ...bundle,
    priorOpenPosition: null,
    positionEvaluation: evaluatePositionAction({
      paperEvaluation: bundle.paperEvaluation,
      currentOpenPosition: null,
    }),
  };
}

export function insufficientPositionBundle(): PositionBundle {
  const bundle = insufficientPaperBundle();
  return {
    ...bundle,
    priorOpenPosition: null,
    positionEvaluation: evaluatePositionAction({
      paperEvaluation: bundle.paperEvaluation,
      currentOpenPosition: null,
    }),
  };
}

export function positionBundleAt(
  asOf: string,
  overrides: Parameters<typeof paperBundleAt>[1] = {},
): PositionBundle {
  const bundle = paperBundleAt(asOf, overrides);
  return {
    ...bundle,
    priorOpenPosition: null,
    positionEvaluation: evaluatePositionAction({
      paperEvaluation: bundle.paperEvaluation,
      currentOpenPosition: null,
    }),
  };
}

export function openedPositionFrom(bundle: PositionBundle) {
  return openPaperPositionFromEvaluation(bundle.positionEvaluation, bundle.paperEvaluation);
}

export {
  nextRepresentableNumber,
  previousRepresentableNumber,
  insufficientPaperBundle,
  noEntryPaperBundle,
  paperBundle,
  paperBundleAt,
} from './paper-fixtures.js';
export { OTHER_PAIR, PAIR_ADDRESS, T_10_00, T_10_05, T_10_10 } from './feature-fixtures.js';
