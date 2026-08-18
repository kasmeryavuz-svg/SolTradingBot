import { formatCapabilityFooter } from '../persistence/format.js';
import {
  ML_CHECKPOINT,
  ML_SPEC_NAME,
  ML_SPEC_VERSION,
  MODEL_FAMILY,
  MODEL_SIGNAL_THRESHOLD,
  NULL_MODEL_FAMILY,
  REQUIRED_SCHEMA_VERSION,
  WALLET_INTELLIGENCE_REASON,
} from './constants.js';
import { ML_DEFINITION_FINGERPRINT, ML_FEATURE_FINGERPRINT } from './identity.js';
import {
  ML19_BOOLEAN_FEATURE_COUNT,
  ML19_CONTINUOUS_FEATURE_COUNT,
  ML19_MODEL_FEATURES,
  ML19_NULLABLE_FEATURE_COUNT,
  ML19_RAW_FEATURE_COUNT,
  ML19_TRANSFORMED_COLUMN_NAMES,
  ML19_TRANSFORMED_DIMENSION,
} from './features.js';
import type { ClassificationMetrics, MlWalkForwardReport, PromotionGate } from './types.js';

export function formatMlStatusLines(): string[] {
  return [
    'PURGED WALK-FORWARD SUPERVISED ML RESEARCH LAB',
    `Checkpoint ${ML_CHECKPOINT}`,
    `Spec: ${ML_SPEC_VERSION}`,
    `Name: ${ML_SPEC_NAME}`,
    `ML definition fingerprint: ${ML_DEFINITION_FINGERPRINT}`,
    `Model: ${MODEL_FAMILY}`,
    `Null: ${NULL_MODEL_FAMILY}`,
    `Threshold: ${String(MODEL_SIGNAL_THRESHOLD)}`,
    'Label: BASE-cost positive x11 result',
    'Wallet intelligence used: NO',
    `Wallet intelligence reason: ${WALLET_INTELLIGENCE_REASON}`,
    'Network: NONE',
    'Database writes: NONE',
    'Live integration: NONE',
    `Schema: ${String(REQUIRED_SCHEMA_VERSION)}`,
    'Migration 010: ABSENT',
    'This lab does not trade, sign, deploy, or change s07/paper.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatMlFeatureLines(): string[] {
  const lines = [
    'ML19 FROZEN FEATURE LIST',
    'NO PERFORMANCE NUMBERS',
    `Feature fingerprint: ${ML_FEATURE_FINGERPRINT}`,
    `Raw c06 input feature count: ${String(ML19_RAW_FEATURE_COUNT)}`,
    `Nullable feature count: ${String(ML19_NULLABLE_FEATURE_COUNT)}`,
    `Continuous features: ${String(ML19_CONTINUOUS_FEATURE_COUNT)}`,
    `Boolean features: ${String(ML19_BOOLEAN_FEATURE_COUNT)}`,
    `Final transformed dimension: ${String(ML19_TRANSFORMED_DIMENSION)}`,
    'Wallet-intelligence fields: none',
    'Identity/leakage fields: excluded',
    '',
    'name | kind | nullable | missing-indicator | transform',
  ];
  for (const feature of ML19_MODEL_FEATURES) {
    const indicator = feature.missingIndicatorName ?? 'none';
    const transform = feature.role === 'boolean' ? 'observed_0_1_missing_value_0_indicator_1' : 'median_impute_then_zscore_clip_10';
    lines.push(
      `${feature.name} | ${feature.kind} | ${feature.nullable ? 'yes' : 'no'} | ${indicator} | ${transform}`,
    );
  }
  lines.push('');
  lines.push('c06_v1 has no non-numeric categorical text fields to exclude.');
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatMlRunLines(report: MlWalkForwardReport): string[] {
  const lines = [
    'ML19 PURGED WALK-FORWARD',
    'RESEARCH ONLY — NOT A TRADING STRATEGY — NOT LIVE',
    `definition: ${report.mlDefinitionFingerprint}`,
    `dataset: ${report.mlDatasetFingerprint}`,
    `final status: ${report.promotionStatus}`,
    `candidateTrainingInvoked: ${String(report.candidateTrainingInvoked)}`,
    'universes: classification=labeled TEST only; signal=all feature-valid TEST decision samples; economic=threshold-selected completed x11; selectedCensoring=threshold-selected unresolved',
    'completed trades are not the same as selected trades when selected censored trades exist',
    'baseline comparison: same chronological evaluation interval, different frozen entry policies',
    '',
    'Fold metrics',
  ];
  for (const fold of report.folds) {
    lines.push(
      `fold ${String(fold.fold.foldId)} evaluable=${String(fold.evaluability.evaluable)} converged=${String(fold.logistic?.converged ?? false)} iterations=${String(fold.logistic?.iterations ?? 0)}`,
    );
    lines.push(
      `  purge before/purged/after=${String(fold.purge.trainSamplesBeforePurge)}/${String(fold.purge.trainSamplesPurged)}/${String(fold.purge.trainSamplesAfterPurge)} TRAIN censoringBps=${fold.evaluability.trainCensoringBps === null ? 'n/a' : String(fold.evaluability.trainCensoringBps)} TEST decision/labeled/censored=${String(fold.selectedEconomics.testDecisionSamples)}/${String(fold.selectedEconomics.testLabeledSamples)}/${String(fold.selectedEconomics.testCensoredSamples)}`,
    );
    lines.push(formatMetricsInline('  model', fold.metrics));
    lines.push(formatMetricsInline('  null', fold.nullMetrics));
    lines.push(
      `  selected opened=${String(fold.selectedEconomics.selectedOpened)} completed=${String(fold.selectedEconomics.completed)} censored=${String(fold.selectedEconomics.censored)} censoringBps=${fold.selectedEconomics.selectedCensoringBps === null ? 'n/a' : String(fold.selectedEconomics.selectedCensoringBps)} BASE expectancy=${formatMaybe(fold.selectedEconomics.netBase?.expectancyUsd)}`,
    );
  }
  lines.push('');
  lines.push('Aggregate OOS');
  lines.push(formatMetricsInline('model', report.aggregateMetrics));
  lines.push(formatMetricsInline('null', report.aggregateNullMetrics));
  lines.push(
    `selected opened=${String(report.aggregateSelectedEconomics.selectedOpened)} completed=${String(report.aggregateSelectedEconomics.completed)} censored=${String(report.aggregateSelectedEconomics.censored)} censoringBps=${report.aggregateSelectedEconomics.selectedCensoringBps === null ? 'n/a' : String(report.aggregateSelectedEconomics.selectedCensoringBps)} BASE expectancy=${formatMaybe(report.aggregateSelectedEconomics.netBase?.expectancyUsd)} STRESS expectancy=${formatMaybe(report.aggregateSelectedEconomics.netStress?.expectancyUsd)}`,
  );
  lines.push(
    `baseline: ${report.baselineComparison.status} opened=${String(report.baselineComparison.aggregateOpened)} completed=${String(report.baselineComparison.aggregateCompleted)} censored=${String(report.baselineComparison.aggregateCensored)} censoringBps=${report.baselineComparison.aggregateCensoringBps === null ? 'n/a' : String(report.baselineComparison.aggregateCensoringBps)}`,
  );
  lines.push(
    `novel-token TEST count=${String(report.novelToken.count)} rocAuc=${formatMaybe(report.novelToken.rocAuc)} selected=${String(report.novelToken.selectedCount)}`,
  );
  lines.push(`integrity: ${report.integrity.status}`);
  lines.push('');
  lines.push('Promotion gates');
  for (const item of report.promotionGates) {
    lines.push(formatGate(item));
  }
  lines.push('');
  lines.push('Predicted probabilities are not guarantees. A passing lab result is not live profitability.');
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatMlFoldLines(report: MlWalkForwardReport): string[] {
  const lines = [
    'ML19 FOLD EVIDENCE',
    'NO CANDIDATE TRAINING',
    `final status: ${report.promotionStatus}`,
    '',
  ];
  for (const fold of report.folds) {
    lines.push(`Fold ${String(fold.fold.foldId)}`);
    lines.push(`  trainEndExclusiveMs=${String(fold.fold.trainEndExclusiveMs)}`);
    lines.push(`  testStartInclusiveMs=${String(fold.fold.testStartInclusiveMs)}`);
    lines.push(`  testEndInclusiveMs=${String(fold.fold.testEndInclusiveMs)}`);
    lines.push(
      `  purge before/purged/after=${String(fold.purge.trainSamplesBeforePurge)}/${String(fold.purge.trainSamplesPurged)}/${String(fold.purge.trainSamplesAfterPurge)}`,
    );
    lines.push(
      `  class TRAIN pos/neg=${String(fold.evaluability.trainPositives)}/${String(fold.evaluability.trainNegatives)} TEST pos/neg=${String(fold.evaluability.testPositives)}/${String(fold.evaluability.testNegatives)}`,
    );
    lines.push(`  preprocessor fingerprint: ${fold.preprocessorFingerprint ?? 'n/a'}`);
    lines.push(`  model fingerprint: ${fold.modelFingerprint ?? 'n/a'}`);
    lines.push(`  iterations=${String(fold.logistic?.iterations ?? 0)} converged=${String(fold.logistic?.converged ?? false)} trainLoss=${formatMaybe(fold.logistic?.finalTrainLoss ?? null)}`);
    lines.push(formatMetricsInline('  model', fold.metrics));
    lines.push(
      `  selected opened=${String(fold.selectedEconomics.selectedOpened)} completed=${String(fold.selectedEconomics.completed)} censored=${String(fold.selectedEconomics.censored)} censoringBps=${fold.selectedEconomics.selectedCensoringBps === null ? 'n/a' : String(fold.selectedEconomics.selectedCensoringBps)} BASE pf=${fold.selectedEconomics.netBase?.profitFactor.kind === 'finite' ? String(fold.selectedEconomics.netBase.profitFactor.value) : (fold.selectedEconomics.netBase?.profitFactor.kind ?? 'n/a')}`,
    );
    lines.push(
      `  baseline opened=${String(fold.baseline.openedPositions)} completed=${String(fold.baseline.completedTrades)} censored=${String(fold.baseline.censoredTrades)} censoringBps=${fold.baseline.censoringBps === null ? 'n/a' : String(fold.baseline.censoringBps)} BASE expectancy=${formatMaybe(fold.baseline.netBaseExpectancy)}`,
    );
    lines.push(`  integrity notes: ${fold.integrityNotes.join(' ')}`);
    lines.push('');
  }
  lines.push(`integrity: ${report.integrity.status}`);
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatMlCandidateLines(report: MlWalkForwardReport): string[] {
  const lines = [
    'ML19 FORWARD CANDIDATE',
    `OOS status: ${report.promotionStatus}`,
    `candidateTrainingInvoked: ${String(report.candidateTrainingInvoked)}`,
  ];
  if (report.candidate === null) {
    lines.push('candidate unavailable');
    lines.push('No file write. No DB write. No paper activation. No live.');
    lines.push('');
    lines.push(...formatCapabilityFooter());
    return lines;
  }
  const candidate = report.candidate;
  lines.push(`modelCandidateId: ${candidate.modelCandidateId}`);
  lines.push(`candidateFingerprint: ${candidate.candidateFingerprint}`);
  lines.push(`trainingDatasetFingerprint: ${candidate.trainingDatasetFingerprint}`);
  lines.push(`featureFingerprint: ${candidate.featureFingerprint}`);
  lines.push(`preprocessingFingerprint: ${candidate.preprocessingFingerprint}`);
  lines.push(`intercept: ${candidate.interceptCanonical}`);
  lines.push(`threshold: ${String(candidate.threshold)}`);
  lines.push(
    `training samples labeled/pos/neg=${String(candidate.labeledTrainingCount)}/${String(candidate.positiveCount)}/${String(candidate.negativeCount)}`,
  );
  lines.push(`trainingEndTime: ${candidate.trainingEndTime ?? 'n/a'}`);
  lines.push(`trainingCutoffAt: ${candidate.trainingCutoffAt ?? 'n/a'}`);
  lines.push(`iterations=${String(candidate.iterations)} converged=${String(candidate.converged)}`);
  lines.push('coefficients (canonical toPrecision 17, transformed column order):');
  for (let index = 0; index < candidate.coefficientCanonical.length; index += 1) {
    const name = ML19_TRANSFORMED_COLUMN_NAMES[index] ?? `w[${String(index)}]`;
    const value = candidate.coefficientCanonical[index];
    lines.push(`  ${name}=${value ?? 'n/a'}`);
  }
  lines.push('This candidate is not persisted, not paper-enabled, and not live.');
  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatMetricsInline(label: string, metrics: ClassificationMetrics | null): string {
  if (metrics === null) {
    return `${label}: NOT_EVALUABLE`;
  }
  return `${label}: n=${String(metrics.labeledSamples)} pos=${String(metrics.positiveCount)} rocAuc=${formatMaybe(metrics.rocAuc)} prAuc=${formatMaybe(metrics.prAuc)} logLoss=${formatMaybe(metrics.logLoss)} brier=${formatMaybe(metrics.brierScore)} selected=${String(metrics.selectedCount)} precision=${formatMaybe(metrics.precision)} recall=${formatMaybe(metrics.recall)}`;
}

function formatGate(gate: PromotionGate): string {
  return `${gate.result} ${gate.id} — ${gate.title} (${gate.detail})`;
}

function formatMaybe(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return 'n/a';
  }
  return String(value);
}
