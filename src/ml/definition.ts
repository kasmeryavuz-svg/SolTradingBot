import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { COST_DEFINITION_FINGERPRINT } from '../optimization/costs.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../optimization/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../research/identity.js';
import {
  CALIBRATION_BIN_EDGES,
  FOLD_TEST_MIN_LABELED,
  FOLD_TEST_MIN_NEGATIVES,
  FOLD_TEST_MIN_POSITIVES,
  FOLD_TRAIN_MIN_LABELED,
  FOLD_TRAIN_MIN_NEGATIVES,
  FOLD_TRAIN_MIN_POSITIVES,
  AGGREGATE_OOS_MIN_LABELED,
  BASELINE_COMPARISON_POLICY,
  LABEL_MAX_HOLD_MS,
  LOGISTIC_EARLY_STOP_ABSOLUTE_IMPROVEMENT,
  LOGISTIC_EARLY_STOP_CONSECUTIVE_ITERATIONS,
  LOGISTIC_INTERCEPT_REGULARIZED,
  LOGISTIC_L2_LAMBDA,
  LOGISTIC_LEARNING_RATE,
  LOGISTIC_MAX_ITERATIONS,
  LOGISTIC_OBJECTIVE,
  LOGISTIC_EARLY_STOP_RULE,
  LOGISTIC_PROBABILITY_EPSILON,
  LOGISTIC_SIGMOID_CLIP,
  ML_CHECKPOINT,
  ML_SPEC_NAME,
  ML_SPEC_VERSION,
    BOOLEAN_MISSING_POLICY,
    MAX_CENSORING_BPS,
  STD_DENOMINATOR,
  MODEL_FAMILY,
  MODEL_SIGNAL_THRESHOLD,
  NULL_MODEL_FAMILY,
  PROMOTION_MAX_DRAWDOWN_PCT,
  PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
  PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
  PROMOTION_MIN_AGGREGATE_ROC_AUC,
  PROMOTION_MIN_BASE_PROFIT_FACTOR,
  PROMOTION_MIN_FOLDS_AUC_ABOVE_CHANCE,
  REFERENCE_NOTIONAL_USD,
  REQUIRED_SCHEMA_VERSION,
  SAMPLE_COOLDOWN_MS,
  SELECTED_MIN_AGGREGATE_COMPLETED,
  SELECTED_MIN_COMPLETED_PER_FOLD,
  WALLET_INTELLIGENCE_REASON,
  WALLET_INTELLIGENCE_USED,
  ZSCORE_CLIP,
} from './constants.js';
import {
  EXCLUDED_CATEGORICAL_TEXT_FEATURES,
  FORBIDDEN_ML_IDENTITY_FEATURES,
  ML19_BOOLEAN_FEATURE_COUNT,
  ML19_CONTINUOUS_FEATURE_COUNT,
  ML19_MODEL_FEATURES,
  ML19_NULLABLE_FEATURE_COUNT,
  ML19_RAW_FEATURE_COUNT,
  ML19_TRANSFORMED_COLUMN_NAMES,
  ML19_TRANSFORMED_DIMENSION,
} from './features.js';

export type CanonicalMlDefinition = {
  mlSpecVersion: string;
  mlSpecName: string;
  checkpoint: string;
  researchOnly: true;
  noNetwork: true;
  noDbWrites: true;
  noLiveIntegration: true;
  noSigning: true;
  noAutomaticTrading: true;
  noOosModelSelection: true;
  noHyperparameterSearch: true;
  noThresholdSearch: true;
  walletIntelligenceUsed: false;
  walletIntelligenceReason: string;
  frozenSnapshotUniverse: {
    reuseExactO17R125ResearchUniverse: true;
    noWiderUniverseForBetterResults: true;
    requiredResearchDefinitionFingerprint: string;
    requiredOptimizationDefinitionFingerprint: string;
  };
  pointInTimeFeatures: {
    featureEngine: 'frozen_c06_v1_generateFeatureVector';
    featureSetVersion: string;
    asOf: 'snapshot.collectedAt';
    generatedAt: 'snapshot.collectedAt';
    neverFuture: true;
    walletIntelligenceFeatures: false;
  };
  modelFamily: typeof MODEL_FAMILY;
  nullModelFamily: typeof NULL_MODEL_FAMILY;
  features: {
    rawCount: number;
    nullableCount: number;
    continuousCount: number;
    booleanCount: number;
    transformedDimension: number;
    order: readonly string[];
    transformedColumns: readonly string[];
    specs: readonly {
      name: string;
      kind: string;
      role: string;
      nullable: boolean;
      missingIndicatorName: string | null;
    }[];
    forbiddenIdentityFeatures: readonly string[];
    excludedCategoricalText: readonly { name: string; reason: string }[];
    noInventedIndicators: true;
  };
  missingValuePolicy: {
    fitOn: 'TRAIN_ONLY';
    numeric: 'train_median_imputation';
    entirelyMissingNumericImpute: 0;
    missingIndicator: '1_if_unavailable_else_0';
    booleanObservedFalse: 'value=0_missing=0';
    booleanObservedTrue: 'value=1_missing=0';
    booleanMissing: 'value=0_missing=1';
    noMedianImputeBooleans: true;
    noTreatMissingBooleanAsObservedFalse: true;
    booleanMissingPolicy: typeof BOOLEAN_MISSING_POLICY;
    noTestStatistics: true;
  };
  medianPolicy: {
    sortFiniteTrainValuesNumerically: true;
    oddN: 'middle_value';
    evenN: 'arithmetic_mean_of_two_middle_values';
    entireTrainColumnMissing: 0;
    testNeverParticipates: true;
  };
  scalingPolicy: {
    fitOn: 'TRAIN_ONLY';
    method: 'zscore_population_after_imputation';
    mean: 'sum(x)/N';
    variance: 'sum((x-mean)^2)/N';
    stdDenominator: 'population_N';
    stdZero: 'z=0';
    clip: readonly [number, number];
    missingIndicatorsNotStandardized: true;
    booleansNotStandardized: true;
    noGlobalNormalization: true;
    noTestMeanOrVariance: true;
  };
  evaluationUniverses: {
    classification: 'labeled_TEST_only';
    modelSignal: 'all_feature_valid_TEST_decision_samples';
    economicCompleted: 'threshold_selected_with_completed_fold_x11';
    selectedCensoring: 'threshold_selected_without_completed_outcome';
    predictProbabilityBeforeReadingOutcome: true;
    completedLabelNotRequiredForSelection: true;
  };
  nonFinitePolicy: {
    sourceNonFinite: 'c06_unavailable_semantics';
    trainerNonFiniteTransformed: 'FAIL';
    nonFiniteCoefficientLossOrGradient: 'model_training_failure';
  };
  sampling: {
    eventBased: true;
    perTokenPairChronological: true;
    cooldownMs: number;
    usesTimeOnly: true;
    neverUsesFutureOutcome: true;
    inputOrderIndependent: true;
  };
  label: {
    family: 'binary_cost_adjusted_x11_baseline';
    positive: 'baseNetPnlUsd > 0';
    nonPositive: 'baseNetPnlUsd <= 0';
    exactNetZero: 0;
    censored: 'unresolved_without_invented_close';
    censoredNotTrain: true;
    censoredNotClassificationEval: true;
    censoredRemainInModelSignalUniverse: true;
    entryRowExcludedFromExitEvidence: true;
    maxHoldBoundaryInclusive: 'T_plus_6h_included';
    sharedCooldownBoundaryObservation: 'first_sample_may_use_T_plus_6h_as_exit_and_second_sample_may_use_it_as_entry';
    x11: {
      stopBps: 1000;
      takeBps: 2000;
      maxHoldMs: number;
      fill: 'frozen_x11_observed_price';
      notO17NormalizedTakeFill: true;
    };
    permittedLabelWindowMs: number;
    noForcedLastObservationClose: true;
    noLaterFoldCompletion: true;
  };
  costs: {
    trainingLabel: 'cost17_BASE_200_200';
    oosDiagnostics: readonly ['BASE_200_200', 'STRESS_500_500'];
    costDefinitionFingerprint: string;
    referenceNotionalUsd: number;
  };
  partitions: {
    reuseExactO17IntegerMillisecondSegments: true;
    foldDesign: 'anchored_four_fold_S1S2_S3__through__S1toS5_S6';
    noRandomSplit: true;
    noShuffledCv: true;
    noOrdinaryKfold: true;
    noFutureToPastTraining: true;
  };
  purging: {
    trainAllowedOnlyIfLabelEvidenceFinishesStrictlyBeforeTestStart: true;
    labelEndEqualsTestStart: 'PURGE';
    labelEndOneMsBeforeTest: 'allowed';
    reportBeforePurgedAfter: true;
  };
  logistic: {
    batch: 'full_train';
    initialization: 'all_coefficients_and_intercept_zero';
    learningRate: number;
    maxIterations: number;
    l2Lambda: number;
    interceptRegularized: false;
    probabilityEpsilon: number;
    sigmoidClip: readonly [number, number];
    earlyStopAbsoluteImprovement: number;
    earlyStopConsecutiveIterations: number;
    earlyStopRule: typeof LOGISTIC_EARLY_STOP_RULE;
    objective: typeof LOGISTIC_OBJECTIVE;
    weightGradient: 'mean((p-y)*x_j) + 2*lambda*w_j';
    interceptGradient: 'mean(p-y)';
    lambdaNotDividedByN: true;
    canonicalSampleOrder: true;
    noRandomness: true;
  };
  nullModel: {
    family: typeof NULL_MODEL_FAMILY;
    probability: 'train_positive_rate_epsilon_clipped';
    testUsesTrainBaseRate: true;
    neverTestBaseRate: true;
  };
  threshold: {
    value: number;
    rule: 'probability_gte_selects_research_sample';
    noSearch: true;
    notS07: true;
    notPaper: true;
    notLive: true;
  };
  metrics: {
    rocAuc: 'tie_aware_mann_whitney_0.5_on_ties';
    prAuc: 'average_precision_descending_score_groups';
    logLoss: 'mean_stable_clipped_probability_log_loss';
    brier: 'mean_squared_probability_error';
    calibrationBins: readonly number[];
    lastBinIncludesOne: true;
    singleClass: 'null_NOT_EVALUABLE';
    prAucNoPositives: 'null_NOT_EVALUABLE';
    prAucPositivesNoNegatives: '1';
    aggregateOos: 'pool_exact_OOS_predictions_and_labels_then_compute';
    nullAggregate: 'pool_each_TEST_row_with_its_fold_TRAIN_null_probability';
    noAverageOfFoldAuc: true;
  };
  censoring: {
    selectedCensoringBps: 'floor(selectedCensored * 10000 / selectedOpened)';
    maxCensoringBps: number;
    trainTestLabelCensoringLimitAppliesToEveryEvaluableFold: true;
    selectedCensoringLimitAppliesAggregateAndPerFold: true;
    baselineCensoringLimitAppliesToComparability: true;
  };
  baseline: {
    entryCandidateId: 's07_baseline';
    testSignalWindow: 'exact_fold_TEST_observation_interval';
    usesLatestEntryInclusive: false;
    comparison: typeof BASELINE_COMPARISON_POLICY;
    opened: 'all_valid_s07_signals_inside_TEST_observation_interval';
    completed: 'opened_with_fold_bounded_completed_x11';
    censored: 'opened_without_fold_bounded_completed_x11';
    noFavorableOutcomePreFilter: true;
    noForcedClose: true;
    keepsS07EntryPolicy: true;
    doesNotUseMlCooldownSampling: true;
  };
  promotion: {
    statuses: readonly [
      'NO_MODEL_PROMOTION_INSUFFICIENT_DATA',
      'NO_MODEL_PROMOTION_FAILED_VALIDATION',
      'ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION',
    ];
    noLiveReady: true;
    noDeploy: true;
    noAutoEnable: true;
    noWinnerLanguage: true;
    minTrainLabeled: number;
    minTestLabeled: number;
    minTrainPositives: number;
    minTrainNegatives: number;
    minTestPositives: number;
    minTestNegatives: number;
    minAggregateOosLabeled: number;
    minSelectedCompletedAggregate: number;
    minSelectedCompletedPerFold: number;
    minAggregateRocAuc: number;
    minFoldsAucAboveChance: number;
    minBaseProfitFactor: number;
    maxDrawdownPct: number;
    maxTop1Pct: number;
    maxTop3Pct: number;
    maxCensoringBps: number;
    statusPrecedence: 'integrity_FAIL_then_failed_validation__sample_or_censoring_readiness_then_insufficient_data__else_robustness_FAIL_then_failed_validation__else_eligible';
  };
  schema: {
    version: number;
    migration010: 'ABSENT';
  };
  requiredExitDefinitionFingerprint: string;
};

export type CanonicalMlDefinitionOverrides = Partial<CanonicalMlDefinition>;

export function canonicalMlDefinition(
  overrides: CanonicalMlDefinitionOverrides = {},
): CanonicalMlDefinition {
  return {
    mlSpecVersion: overrides.mlSpecVersion ?? ML_SPEC_VERSION,
    mlSpecName: overrides.mlSpecName ?? ML_SPEC_NAME,
    checkpoint: overrides.checkpoint ?? ML_CHECKPOINT,
    researchOnly: true,
    noNetwork: true,
    noDbWrites: true,
    noLiveIntegration: true,
    noSigning: true,
    noAutomaticTrading: true,
    noOosModelSelection: true,
    noHyperparameterSearch: true,
    noThresholdSearch: true,
    walletIntelligenceUsed: WALLET_INTELLIGENCE_USED,
    walletIntelligenceReason: overrides.walletIntelligenceReason ?? WALLET_INTELLIGENCE_REASON,
    frozenSnapshotUniverse: {
      reuseExactO17R125ResearchUniverse: true,
      noWiderUniverseForBetterResults: true,
      requiredResearchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
      requiredOptimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
      ...overrides.frozenSnapshotUniverse,
    },
    pointInTimeFeatures: {
      featureEngine: 'frozen_c06_v1_generateFeatureVector',
      featureSetVersion: FEATURE_SET_VERSION,
      asOf: 'snapshot.collectedAt',
      generatedAt: 'snapshot.collectedAt',
      neverFuture: true,
      walletIntelligenceFeatures: false,
      ...overrides.pointInTimeFeatures,
    },
    modelFamily: MODEL_FAMILY,
    nullModelFamily: NULL_MODEL_FAMILY,
    features: {
      rawCount: ML19_RAW_FEATURE_COUNT,
      nullableCount: ML19_NULLABLE_FEATURE_COUNT,
      continuousCount: ML19_CONTINUOUS_FEATURE_COUNT,
      booleanCount: ML19_BOOLEAN_FEATURE_COUNT,
      transformedDimension: ML19_TRANSFORMED_DIMENSION,
      order: ML19_MODEL_FEATURES.map((feature) => feature.name),
      transformedColumns: ML19_TRANSFORMED_COLUMN_NAMES,
      specs: ML19_MODEL_FEATURES.map((feature) => ({
        name: feature.name,
        kind: feature.kind,
        role: feature.role,
        nullable: feature.nullable,
        missingIndicatorName: feature.missingIndicatorName,
      })),
      forbiddenIdentityFeatures: FORBIDDEN_ML_IDENTITY_FEATURES,
      excludedCategoricalText: EXCLUDED_CATEGORICAL_TEXT_FEATURES,
      noInventedIndicators: true,
      ...overrides.features,
    },
    missingValuePolicy: {
      fitOn: 'TRAIN_ONLY',
      numeric: 'train_median_imputation',
      entirelyMissingNumericImpute: 0,
      missingIndicator: '1_if_unavailable_else_0',
      booleanObservedFalse: 'value=0_missing=0',
      booleanObservedTrue: 'value=1_missing=0',
      booleanMissing: 'value=0_missing=1',
      noMedianImputeBooleans: true,
      noTreatMissingBooleanAsObservedFalse: true,
      booleanMissingPolicy: BOOLEAN_MISSING_POLICY,
      noTestStatistics: true,
      ...overrides.missingValuePolicy,
    },
    medianPolicy: {
      sortFiniteTrainValuesNumerically: true,
      oddN: 'middle_value',
      evenN: 'arithmetic_mean_of_two_middle_values',
      entireTrainColumnMissing: 0,
      testNeverParticipates: true,
    },
    scalingPolicy: {
      fitOn: 'TRAIN_ONLY',
      method: 'zscore_population_after_imputation',
      mean: 'sum(x)/N',
      variance: 'sum((x-mean)^2)/N',
      stdDenominator: STD_DENOMINATOR,
      stdZero: 'z=0',
      clip: [ZSCORE_CLIP * -1, ZSCORE_CLIP],
      missingIndicatorsNotStandardized: true,
      booleansNotStandardized: true,
      noGlobalNormalization: true,
      noTestMeanOrVariance: true,
      ...overrides.scalingPolicy,
    },
    evaluationUniverses: {
      classification: 'labeled_TEST_only',
      modelSignal: 'all_feature_valid_TEST_decision_samples',
      economicCompleted: 'threshold_selected_with_completed_fold_x11',
      selectedCensoring: 'threshold_selected_without_completed_outcome',
      predictProbabilityBeforeReadingOutcome: true,
      completedLabelNotRequiredForSelection: true,
    },
    nonFinitePolicy: {
      sourceNonFinite: 'c06_unavailable_semantics',
      trainerNonFiniteTransformed: 'FAIL',
      nonFiniteCoefficientLossOrGradient: 'model_training_failure',
      ...overrides.nonFinitePolicy,
    },
    sampling: {
      eventBased: true,
      perTokenPairChronological: true,
      cooldownMs: SAMPLE_COOLDOWN_MS,
      usesTimeOnly: true,
      neverUsesFutureOutcome: true,
      inputOrderIndependent: true,
      ...overrides.sampling,
    },
    label: {
      family: 'binary_cost_adjusted_x11_baseline',
      positive: 'baseNetPnlUsd > 0',
      nonPositive: 'baseNetPnlUsd <= 0',
      exactNetZero: 0,
      censored: 'unresolved_without_invented_close',
      censoredNotTrain: true,
      censoredNotClassificationEval: true,
      censoredRemainInModelSignalUniverse: true,
      entryRowExcludedFromExitEvidence: true,
      maxHoldBoundaryInclusive: 'T_plus_6h_included',
      sharedCooldownBoundaryObservation: 'first_sample_may_use_T_plus_6h_as_exit_and_second_sample_may_use_it_as_entry',
      x11: {
        stopBps: 1000,
        takeBps: 2000,
        maxHoldMs: LABEL_MAX_HOLD_MS,
        fill: 'frozen_x11_observed_price',
        notO17NormalizedTakeFill: true,
      },
      permittedLabelWindowMs: LABEL_MAX_HOLD_MS,
      noForcedLastObservationClose: true,
      noLaterFoldCompletion: true,
      ...overrides.label,
    },
    costs: {
      trainingLabel: 'cost17_BASE_200_200',
      oosDiagnostics: ['BASE_200_200', 'STRESS_500_500'],
      costDefinitionFingerprint: COST_DEFINITION_FINGERPRINT,
      referenceNotionalUsd: REFERENCE_NOTIONAL_USD,
      ...overrides.costs,
    },
    partitions: {
      reuseExactO17IntegerMillisecondSegments: true,
      foldDesign: 'anchored_four_fold_S1S2_S3__through__S1toS5_S6',
      noRandomSplit: true,
      noShuffledCv: true,
      noOrdinaryKfold: true,
      noFutureToPastTraining: true,
      ...overrides.partitions,
    },
    purging: {
      trainAllowedOnlyIfLabelEvidenceFinishesStrictlyBeforeTestStart: true,
      labelEndEqualsTestStart: 'PURGE',
      labelEndOneMsBeforeTest: 'allowed',
      reportBeforePurgedAfter: true,
      ...overrides.purging,
    },
    logistic: {
      batch: 'full_train',
      initialization: 'all_coefficients_and_intercept_zero',
      learningRate: LOGISTIC_LEARNING_RATE,
      maxIterations: LOGISTIC_MAX_ITERATIONS,
      l2Lambda: LOGISTIC_L2_LAMBDA,
      interceptRegularized: LOGISTIC_INTERCEPT_REGULARIZED,
      probabilityEpsilon: LOGISTIC_PROBABILITY_EPSILON,
      sigmoidClip: [-LOGISTIC_SIGMOID_CLIP, LOGISTIC_SIGMOID_CLIP],
      earlyStopAbsoluteImprovement: LOGISTIC_EARLY_STOP_ABSOLUTE_IMPROVEMENT,
      earlyStopConsecutiveIterations: LOGISTIC_EARLY_STOP_CONSECUTIVE_ITERATIONS,
      earlyStopRule: LOGISTIC_EARLY_STOP_RULE,
      objective: LOGISTIC_OBJECTIVE,
      weightGradient: 'mean((p-y)*x_j) + 2*lambda*w_j',
      interceptGradient: 'mean(p-y)',
      lambdaNotDividedByN: true,
      canonicalSampleOrder: true,
      noRandomness: true,
      ...overrides.logistic,
    },
    nullModel: {
      family: NULL_MODEL_FAMILY,
      probability: 'train_positive_rate_epsilon_clipped',
      testUsesTrainBaseRate: true,
      neverTestBaseRate: true,
      ...overrides.nullModel,
    },
    threshold: {
      value: MODEL_SIGNAL_THRESHOLD,
      rule: 'probability_gte_selects_research_sample',
      noSearch: true,
      notS07: true,
      notPaper: true,
      notLive: true,
      ...overrides.threshold,
    },
    metrics: {
      rocAuc: 'tie_aware_mann_whitney_0.5_on_ties',
      prAuc: 'average_precision_descending_score_groups',
      logLoss: 'mean_stable_clipped_probability_log_loss',
      brier: 'mean_squared_probability_error',
      calibrationBins: CALIBRATION_BIN_EDGES,
      lastBinIncludesOne: true,
      singleClass: 'null_NOT_EVALUABLE',
      prAucNoPositives: 'null_NOT_EVALUABLE',
      prAucPositivesNoNegatives: '1',
      aggregateOos: 'pool_exact_OOS_predictions_and_labels_then_compute',
      nullAggregate: 'pool_each_TEST_row_with_its_fold_TRAIN_null_probability',
      noAverageOfFoldAuc: true,
      ...overrides.metrics,
    },
    censoring: {
      selectedCensoringBps: 'floor(selectedCensored * 10000 / selectedOpened)',
      maxCensoringBps: MAX_CENSORING_BPS,
      trainTestLabelCensoringLimitAppliesToEveryEvaluableFold: true,
      selectedCensoringLimitAppliesAggregateAndPerFold: true,
      baselineCensoringLimitAppliesToComparability: true,
    },
    baseline: {
      entryCandidateId: 's07_baseline',
      testSignalWindow: 'exact_fold_TEST_observation_interval',
      usesLatestEntryInclusive: false,
      comparison: BASELINE_COMPARISON_POLICY,
      opened: 'all_valid_s07_signals_inside_TEST_observation_interval',
      completed: 'opened_with_fold_bounded_completed_x11',
      censored: 'opened_without_fold_bounded_completed_x11',
      noFavorableOutcomePreFilter: true,
      noForcedClose: true,
      keepsS07EntryPolicy: true,
      doesNotUseMlCooldownSampling: true,
      ...overrides.baseline,
    },
    promotion: {
      statuses: [
        'NO_MODEL_PROMOTION_INSUFFICIENT_DATA',
        'NO_MODEL_PROMOTION_FAILED_VALIDATION',
        'ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION',
      ],
      noLiveReady: true,
      noDeploy: true,
      noAutoEnable: true,
      noWinnerLanguage: true,
      minTrainLabeled: FOLD_TRAIN_MIN_LABELED,
      minTestLabeled: FOLD_TEST_MIN_LABELED,
      minTrainPositives: FOLD_TRAIN_MIN_POSITIVES,
      minTrainNegatives: FOLD_TRAIN_MIN_NEGATIVES,
      minTestPositives: FOLD_TEST_MIN_POSITIVES,
      minTestNegatives: FOLD_TEST_MIN_NEGATIVES,
      minAggregateOosLabeled: AGGREGATE_OOS_MIN_LABELED,
      minSelectedCompletedAggregate: SELECTED_MIN_AGGREGATE_COMPLETED,
      minSelectedCompletedPerFold: SELECTED_MIN_COMPLETED_PER_FOLD,
      minAggregateRocAuc: PROMOTION_MIN_AGGREGATE_ROC_AUC,
      minFoldsAucAboveChance: PROMOTION_MIN_FOLDS_AUC_ABOVE_CHANCE,
      minBaseProfitFactor: PROMOTION_MIN_BASE_PROFIT_FACTOR,
      maxDrawdownPct: PROMOTION_MAX_DRAWDOWN_PCT,
      maxTop1Pct: PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
      maxTop3Pct: PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
      maxCensoringBps: MAX_CENSORING_BPS,
      statusPrecedence: 'integrity_FAIL_then_failed_validation__sample_or_censoring_readiness_then_insufficient_data__else_robustness_FAIL_then_failed_validation__else_eligible',
      ...overrides.promotion,
    },
    schema: {
      version: REQUIRED_SCHEMA_VERSION,
      migration010: 'ABSENT',
      ...overrides.schema,
    },
    requiredExitDefinitionFingerprint: overrides.requiredExitDefinitionFingerprint ?? EXIT_DEFINITION_FINGERPRINT,
  };
}

export function mutateCanonicalMlDefinition(
  mutate: (definition: CanonicalMlDefinition) => void,
): CanonicalMlDefinition {
  const definition = structuredClone(canonicalMlDefinition());
  mutate(definition);
  return definition;
}
