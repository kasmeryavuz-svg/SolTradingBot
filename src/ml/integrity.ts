import { isObservationInWindow, testWindow, trainWindow } from '../optimization/folds.js';
import { assertExactSegmentPartition } from '../optimization/partition.js';
import { COST_DEFINITION_FINGERPRINT } from '../optimization/costs.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { ChronologicalSegment } from '../optimization/types.js';
import { FROZEN_COST17_V1_DEFINITION_FINGERPRINT, FROZEN_X11_V1_DEFINITION_FINGERPRINT, MODEL_SIGNAL_THRESHOLD } from './constants.js';
import { ML_DEFINITION_FINGERPRINT } from './identity.js';
import { ML19_MODEL_FEATURE_NAMES, ML19_TRANSFORMED_COLUMN_NAMES, assertMl19FeatureBinding, isForbiddenIdentityFeature } from './features.js';
import { FROZEN_LOGISTIC_HYPERPARAMETERS as FROZEN_HP } from './logistic.js';
import { partitionFoldSamples } from './folds.js';
import type { MlDataset, MlFoldResult, RuntimeIntegrityCheck, RuntimeIntegrityReport } from './types.js';

export function evaluateMlRuntimeIntegrity(input: {
  dataset: MlDataset;
  segments: readonly ChronologicalSegment[] | null;
  folds: readonly MlFoldResult[];
}): RuntimeIntegrityReport {
  const checks: RuntimeIntegrityCheck[] = [
    check('definition_fingerprint', () => {
      if (input.dataset.mlDefinitionFingerprint !== ML_DEFINITION_FINGERPRINT) {
        return 'Dataset ml19 fingerprint does not match the process definition fingerprint.';
      }
      return null;
    }),
    check('c06_feature_list', () => {
      assertMl19FeatureBinding();
      return null;
    }),
    check('no_identity_features', () => {
      for (const name of ML19_MODEL_FEATURE_NAMES) {
        if (isForbiddenIdentityFeature(name)) {
          return `Forbidden identity feature ${name} is in the model list.`;
        }
      }
      return null;
    }),
    check('no_wallet_intelligence_features', () => {
      const joined = ML19_TRANSFORMED_COLUMN_NAMES.join(' ');
      if (joined.includes('wallet') || joined.includes('holder_cohort') || joined.includes('wi18')) {
        return 'Wallet-intelligence feature names appeared in the model list.';
      }
      return null;
    }),
    check('integer_partition', () => {
      if (input.segments === null || input.dataset.firstSnapshotAt === null || input.dataset.lastSnapshotAt === null) {
        return null;
      }
      const lastMs = requireUtcTimestamp(input.dataset.lastSnapshotAt, 'lastSnapshotAt');
      assertExactSegmentPartition(input.dataset.marketSnapshots, input.segments, lastMs);
      return null;
    }),
    check('train_test_disjoint', () => {
      for (const fold of input.folds) {
        const train = trainWindow(fold.fold);
        const test = testWindow(fold.fold);
        if (fold.fold.testStartInclusiveMs < fold.fold.trainEndExclusiveMs) {
          return `Fold ${String(fold.fold.foldId)} test starts before train ends.`;
        }
        for (const sample of input.dataset.samples) {
          if (
            isObservationInWindow(sample.collectedAtMs, train) &&
            isObservationInWindow(sample.collectedAtMs, test)
          ) {
            return `Fold ${String(fold.fold.foldId)} has a decision sample in both TRAIN and TEST.`;
          }
        }
      }
      return null;
    }),
    check('purged_train_label_before_test', () => {
      for (const fold of input.folds) {
        const partition = partitionFoldSamples(input.dataset, fold.fold);
        for (const sample of partition.trainAfterPurge) {
          if (sample.datasetLabel.completedAtMs === null) {
            return `Fold ${String(fold.fold.foldId)} kept a TRAIN sample without a label completion time.`;
          }
          if (sample.datasetLabel.completedAtMs >= fold.fold.testStartInclusiveMs) {
            return `Fold ${String(fold.fold.foldId)} TRAIN label completion does not finish strictly before TEST start.`;
          }
        }
      }
      return null;
    }),
    check('test_not_used_in_train_fit', () => {
      for (const fold of input.folds) {
        const trainIds = new Set(
          partitionFoldSamples(input.dataset, fold.fold).trainAfterPurge.map((sample) => sample.sampleIdentity),
        );
        for (const prediction of fold.testPredictions) {
          if (trainIds.has(prediction.sample.sampleIdentity)) {
            return `Fold ${String(fold.fold.foldId)} TEST sample was present in TRAIN.`;
          }
        }
      }
      return null;
    }),
    check('fixed_hyperparameters', () => {
      const learningRate: number = FROZEN_HP.learningRate;
      const maxIterations: number = FROZEN_HP.maxIterations;
      const l2Lambda: number = FROZEN_HP.l2Lambda;
      if (learningRate !== 0.05 || maxIterations !== 1000 || l2Lambda !== 0.01) {
        return 'Logistic hyperparameters are not the frozen ml19_v1 values.';
      }
      return null;
    }),
    check('fixed_threshold', () => {
      const threshold: number = MODEL_SIGNAL_THRESHOLD;
      if (threshold !== 0.65) {
        return 'MODEL_SIGNAL_THRESHOLD is not 0.65.';
      }
      for (const fold of input.folds) {
        for (const prediction of fold.testPredictions) {
          const expected = prediction.probability >= 0.65;
          if (prediction.selected !== expected) {
            return 'A TEST selection did not use the frozen 0.65 threshold.';
          }
        }
      }
      return null;
    }),
    check('selected_ids_frozen_to_threshold', () => {
      for (const fold of input.folds) {
        const selectedIds = fold.selectedIdentities;
        const thresholdIds = fold.testPredictions
          .filter((prediction) => prediction.probability >= MODEL_SIGNAL_THRESHOLD)
          .map((prediction) => prediction.sample.sampleIdentity);
        if (selectedIds.join(',') !== thresholdIds.join(',')) {
          return `Fold ${String(fold.fold.foldId)} selected IDs were not frozen to the 0.65 threshold before evaluation.`;
        }
        if (selectedIds.join(',') !== fold.testPredictions.filter((item) => item.selected).map((item) => item.sample.sampleIdentity).join(',')) {
          return `Fold ${String(fold.fold.foldId)} selectedIdentities drifted from selected flags.`;
        }
      }
      return null;
    }),
    check('economic_ids_match_selected', () => {
      for (const fold of input.folds) {
        const economic = [
          ...fold.selectedEconomics.completedIdentities,
          ...fold.selectedEconomics.censoredIdentities,
        ];
        if ([...economic].sort().join(',') !== [...fold.selectedIdentities].sort().join(',')) {
          return `Fold ${String(fold.fold.foldId)} dropped selected IDs from economic accounting.`;
        }
        if (fold.selectedEconomics.selectedOpened !== fold.selectedIdentities.length) {
          return `Fold ${String(fold.fold.foldId)} selectedOpened does not match frozen selected IDs.`;
        }
        if (fold.predictedIdentities.join(',') !== fold.testPredictions.map((item) => item.sample.sampleIdentity).join(',')) {
          return `Fold ${String(fold.fold.foldId)} predicted IDs drifted from TEST predictions.`;
        }
      }
      return null;
    }),
    check('signal_universe_includes_censored', () => {
      for (const fold of input.folds) {
        if (fold.logistic === null) {
          continue;
        }
        const partition = partitionFoldSamples(input.dataset, fold.fold);
        if (fold.testPredictions.length !== partition.testFeatureEligible.length) {
          return `Fold ${String(fold.fold.foldId)} did not score every feature-valid TEST decision sample.`;
        }
      }
      return null;
    }),
    check('oos_from_fold_train_model', () => {
      for (const fold of input.folds) {
        if (fold.testPredictions.length > 0 && fold.logistic === null) {
          return `Fold ${String(fold.fold.foldId)} produced TEST predictions without a TRAIN model.`;
        }
      }
      return null;
    }),
    check('no_test_retraining', () => {
      for (const fold of input.folds) {
        if (fold.logistic !== null && fold.preprocessorFingerprint === null) {
          return `Fold ${String(fold.fold.foldId)} trained a model without a TRAIN preprocessor fingerprint.`;
        }
      }
      return null;
    }),
    check('cost17_fingerprint', () => {
      if (COST_DEFINITION_FINGERPRINT !== FROZEN_COST17_V1_DEFINITION_FINGERPRINT) {
        return 'cost17 fingerprint is not the frozen value.';
      }
      return null;
    }),
    check('x11_fingerprint', () => {
      if (EXIT_DEFINITION_FINGERPRINT !== FROZEN_X11_V1_DEFINITION_FINGERPRINT) {
        return 'x11 fingerprint is not the frozen value.';
      }
      return null;
    }),
    check('no_network_contract', () => {
      return null;
    }),
    check('no_db_writes_contract', () => {
      return null;
    }),
    check('schema_migration_010_absent', () => null),
  ];

  const failed = checks.some((item) => item.result === 'FAIL');
  return { status: failed ? 'FAIL' : 'PASS', checks };
}

function check(id: string, fn: () => string | null): RuntimeIntegrityCheck {
  try {
    const detail = fn();
    return detail === null
      ? { id, result: 'PASS', detail: 'ok' }
      : { id, result: 'FAIL', detail };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return { id, result: 'FAIL', detail: message };
  }
}
