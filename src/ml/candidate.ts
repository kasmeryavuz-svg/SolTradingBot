import { requireUtcTimestamp } from '../features/numbers.js';
import { buildOptimizationIndexes } from '../optimization/timeline.js';
import { canonicalTrainOrder, labeledOutcome } from './folds.js';
import { FORWARD_CANDIDATE_ID, MODEL_SIGNAL_THRESHOLD } from './constants.js';
import { ML_DEFINITION_FINGERPRINT, ML_FEATURE_FINGERPRINT, fingerprintModelCandidate } from './identity.js';
import { snapshotForSample, simulateX11Label } from './labels.js';
import { fitL2LogisticRegression } from './logistic.js';
import { canonicalNumberString } from './numbers.js';
import { fitPreprocessor, transformRawFeatures } from './preprocessing.js';
import { runPurgedWalkForward } from './walk-forward.js';
import type { ForwardModelCandidate, MlBinaryLabel, MlDataset, MlWalkForwardReport } from './types.js';

export function trainForwardCandidate(dataset: MlDataset): ForwardModelCandidate {
  const cutoffAt = dataset.lastSnapshotAt;
  const cutoffMs = cutoffAt === null ? null : requireUtcTimestamp(cutoffAt, 'trainingCutoffAt');
  const indexes = buildOptimizationIndexes({
    marketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
  const eligible = canonicalTrainOrder(dataset.samples).flatMap((sample) => {
    if (cutoffMs === null) {
      return [];
    }
    const outcome = simulateX11Label({
      entry: snapshotForSample(sample, dataset.marketSnapshots),
      indexes,
      bound: {
        startExclusiveMs: sample.collectedAtMs,
        endInclusiveMs: cutoffMs,
        endExclusiveMs: cutoffMs + 1,
      },
    });
    if (!labeledOutcome(outcome)) {
      return [];
    }
    if (outcome.completedAtMs !== null && outcome.completedAtMs > cutoffMs) {
      return [];
    }
    return [{ sample, outcome }];
  });
  if (eligible.length === 0) {
    throw new Error('Forward candidate training requires labeled historical samples known by the cutoff.');
  }
  const preprocessor = fitPreprocessor(
    eligible.map((item) => item.sample.rawFeatures),
    'FULL_HISTORY_LABELED',
  );
  const features = eligible.map((item) => transformRawFeatures(item.sample.rawFeatures, preprocessor));
  const labels: MlBinaryLabel[] = eligible.map((item) => (item.outcome.label === 1 ? 1 : 0));
  const logistic = fitL2LogisticRegression({ features, labels });
  const last = eligible[eligible.length - 1]?.sample;
  return {
    modelCandidateId: FORWARD_CANDIDATE_ID,
    candidateFingerprint: fingerprintModelCandidate({
      mlDefinitionFingerprint: ML_DEFINITION_FINGERPRINT,
      trainingDatasetFingerprint: dataset.mlDatasetFingerprint,
      featureFingerprint: ML_FEATURE_FINGERPRINT,
      preprocessingFingerprint: preprocessor.fingerprint,
      coefficients: logistic.coefficients,
      intercept: logistic.intercept,
      threshold: MODEL_SIGNAL_THRESHOLD,
      trainingCutoffAt: cutoffAt,
    }),
    trainingDatasetFingerprint: dataset.mlDatasetFingerprint,
    featureFingerprint: ML_FEATURE_FINGERPRINT,
    preprocessingFingerprint: preprocessor.fingerprint,
    mlDefinitionFingerprint: ML_DEFINITION_FINGERPRINT,
    coefficients: logistic.coefficients,
    intercept: logistic.intercept,
    coefficientCanonical: logistic.coefficients.map(canonicalNumberString),
    interceptCanonical: canonicalNumberString(logistic.intercept),
    threshold: MODEL_SIGNAL_THRESHOLD,
    labeledTrainingCount: eligible.length,
    positiveCount: labels.filter((label) => label === 1).length,
    negativeCount: labels.filter((label) => label === 0).length,
    trainingEndTime: last?.collectedAt ?? cutoffAt,
    trainingCutoffAt: cutoffAt,
    trainingCutoffMs: cutoffMs,
    iterations: logistic.iterations,
    finalTrainLoss: logistic.finalTrainLoss,
    converged: logistic.converged,
  };
}

export function runMlCandidate(dataset: MlDataset): MlWalkForwardReport {
  const report = runPurgedWalkForward(dataset);
  if (report.promotionStatus !== 'ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION') {
    return {
      ...report,
      candidateTrainingInvoked: false,
      candidate: null,
    };
  }
  return {
    ...report,
    candidateTrainingInvoked: true,
    candidate: trainForwardCandidate(dataset),
  };
}
