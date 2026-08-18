import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { POSITION_QUANTITY_FORMULA } from '../position/constants.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../research/identity.js';
import { optimizationEntryCatalog, optimizationExitCatalog } from './catalog.js';
import {
  CHRONOLOGICAL_SEGMENT_COUNT,
  COMBINED_THEORETICAL_PAIRS,
  COST_SPEC_VERSION,
  ENTRY_CANDIDATE_COUNT,
  EXIT_CANDIDATE_COUNT,
  MAX_OPTIMIZATION_HOLD_MS,
  OOS_MAX_AGGREGATE_CENSORED_FRACTION,
  OOS_MIN_AGGREGATE_COMPLETED_TRADES,
  OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
  BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES,
  BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
  OPTIMIZATION_ENTRY_REFERENCE_NOTIONAL_USD,
  OPTIMIZATION_SPEC_NAME,
  OPTIMIZATION_SPEC_VERSION,
  PROMOTION_MAX_BASE_DRAWDOWN_PCT,
  PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
  PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
  PROMOTION_MIN_BASE_PROFIT_FACTOR,
  PROMOTION_MIN_POSITIVE_BASE_EXPECTANCY_FOLDS,
  SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE,
  TRAIN_MAX_CENSORED_FRACTION,
  TRAIN_MIN_COMPLETED_TRADES,
  WALK_FORWARD_FOLD_COUNT,
} from './constants.js';
import { COST_DEFINITION_FINGERPRINT } from './costs.js';

export type CanonicalOptimizationDefinition = {
  optimizationSpecVersion: string;
  optimizationSpecName: string;
  researchOnly: true;
  noNetwork: true;
  frozenSnapshotUniverse: {
    reuseExactR125ResearchUniverse: true;
    excludeRuntimeExitReferencedSnapshotsBeforeOptimization: true;
    noWiderUniverseForBetterResults: true;
    requiredResearchDefinitionFingerprint: string;
  };
  pointInTimeFeatureReconstruction: {
    asOf: 'snapshot.collectedAt';
    generatedAt: 'snapshot.collectedAt';
    featureEngine: 'frozen_c06_v1_generateFeatureVector';
    previousMarket: {
      sameToken: true;
      sameExactPair: true;
      strictlyEarlier: true;
      neverFuture: true;
      neverSelf: true;
      neverSameTimestamp: true;
    };
    riskAsOf: {
      sameToken: true;
      scannedAtAtOrBeforeAsOf: true;
      neverFuture: true;
    };
  };
  entryCatalog: {
    fixedCount: number;
    order: 'candidateId_registry_order';
    noResultBasedSort: true;
    candidates: readonly { candidateId: string; candidateDefinitionFingerprint: string }[];
  };
  exitCatalog: {
    fixedCount: number;
    order: 'candidateId_registry_order';
    noResultBasedSort: true;
    candidates: readonly { candidateId: string; candidateDefinitionFingerprint: string }[];
  };
  combinedTheoreticalPairs: number;
  stageWiseSelectionNotBlindFortyWay: true;
  referenceNotionalUsd: number;
  quantityFormula: string;
  costScenarios: {
    costSpecVersion: string;
    costDefinitionFingerprint: string;
    noEnvironmentOverride: true;
    notMeasuredHistoricalExecutionCost: true;
  };
  chronologicalSegmentCount: number;
  anchoredWalkForward: {
    foldCount: number;
    fold1: { train: 'S1+S2'; test: 'S3' };
    fold2: { train: 'S1+S2+S3'; test: 'S4' };
    fold3: { train: 'S1+S2+S3+S4'; test: 'S5' };
    fold4: { train: 'S1+S2+S3+S4+S5'; test: 'S6' };
    testNeverUsedForSelection: true;
  };
  foldEntryCutoff: {
    maxOptimizationHoldMs: number;
    trainLatestEntry: 'trainEndExclusive - 24h inclusive';
    testLatestEntry: 'testObservationEnd - 24h inclusive';
    entryAfterCutoffIneligible: true;
    entryInTestNeverTraining: true;
    noCrossFoldOutcomeLeakage: true;
  };
  trainingOnlySelection: true;
  noOosSelection: true;
  entrySelectionRanking: readonly [
    'higher_stress_net_expectancy_usd_per_completed_trade',
    'higher_base_profit_factor',
    'lower_base_max_drawdown_usd',
    'higher_base_median_trade_pnl',
    'lexicographically_smaller_candidateId',
  ];
  exitSelectionRanking: readonly [
    'higher_stress_net_expectancy_usd_per_completed_trade',
    'higher_base_profit_factor',
    'lower_base_max_drawdown_usd',
    'higher_base_median_trade_pnl',
    'lexicographically_smaller_exitCandidateId',
  ];
  minimumTrainingEligibility: {
    completedTrades: number;
    maxCensoredFraction: number;
  };
  oosPromotionGates: {
    allFourFoldsExist: true;
    minAggregateSelectedOosCompletedTrades: number;
    minCompletedSelectedTradesEachTestFold: number;
    maxAggregateCensoredFraction: number;
    aggregateOosBaseExpectancyMustBePositive: true;
    aggregateOosStressExpectancyMustBePositive: true;
    minAggregateOosBaseProfitFactor: number;
    maxAggregateOosBaseDrawdownPctOfPeakCumulativeCompletedNetPnl: number;
    minFoldsWithPositiveBaseExpectancy: number;
    maxTop1PositiveConcentrationPct: number;
    maxTop3PositiveConcentrationPct: number;
    selectedMustBeatS07X11BaselineWhenComparable: true;
    missingBaselineComparisonIsNotPass: true;
    runtimeIntegrityMustPass: true;
  };
  baselineComparison: {
    control1: { entry: 's07_baseline'; exit: 'x11_baseline' };
    control2: { entry: 'quality_control_v1'; exit: 'x11_baseline' };
    sameTestBoundariesAndCostScenarios: true;
    comparableOnlyWhen: {
      allFourExactOosWindows: true;
      minAggregateCompletedTrades: number;
      minCompletedTradesEachTestFold: number;
    };
    ifNotComparable: 'NOT_COMPARABLE';
    notComparableBlocksEligibility: true;
  };
  drawdownPercent: {
    usd: 'peak_to_trough_of_cumulative_completed_net_pnl_sorted_by_exit_time';
    percentDenominator: 'peak_cumulative_completed_net_pnl_usd';
    ifPeakNotPositive: null;
    notBankrollDrawdown: true;
    notInflatedByCompletedTradeCount: true;
  };
  structuralReadiness: {
    distinguishTimePartitionsConstructible: true;
    distinguishWalkForwardEvaluable: true;
    distinguishPromotionDataSufficient: true;
    noGenericYesWhenUnevaluable: true;
  };
  segmentBoundaries: {
    construction: 'integer_ms_span_divmod_6';
    noIeeeFractionalMillisecondsInFoldIdentity: true;
    exactPartition: true;
  };
  foldCutoff: {
    providesMaximumConfiguredClockWindowInsideFold: true;
    doesNotGuaranteeClosingObservation: true;
    sparseDataRemainsCensored: true;
    entryAtCutoffInclusive: true;
    entryAfterCutoffIneligible: true;
  };
  censoredFraction: {
    numerator: 'unresolved_plus_partially_realized_censored';
    denominator: 'opened_positions';
    openedZero: 'null_not_eligible';
  };
  partialCensoredAccounting: {
    notACompletedTrade: true;
    countsAsOpenedAndCensoredForEligibility: true;
    realizedLegMayBeReportedSeparately: true;
    mustNotImproveCompletedTradeRankingOrPromotionMetrics: true;
  };
  costApplication: {
    triggersUseGrossReferencePathOnly: true;
    frictionAppliedAfterGrossLegExists: true;
    quantityFromGrossReferenceNotional: true;
    effectiveCashOutlayMayExceedReferenceNotional: true;
  };
  x11Baseline: {
    historicalControl: true;
    retainsFrozenObservedTakeFill: true;
    notANormalizedExecutionComparisonWithO17Exits: true;
  };
  runtimeIntegrity: {
    evaluatedOnEachRun: true;
    notHardcodedPassBecauseUnitTestsPassed: true;
    failureBlocksPromotion: true;
  };
  selectorIsolation: {
    receivesTrainingSelectorRowsOnly: true;
    oosResultObjectsNotAvailableToSelector: true;
  };
  aggregateSelectedOos: {
    measuresWalkForwardSelectionMethodology: true;
    notASingleFixedStrategyUnlessEveryFoldSelectedTheSamePair: true;
  };
  paperCandidate: {
    onlyIfEligibleForForwardPaperValidation: true;
    fullHistorySelectionIsNotFreshOosProof: true;
    doesNotMutatePaperEngine: true;
  };
  concentrationMetrics: {
    top1PositiveProfit: true;
    top3PositiveProfit: true;
    pnlByToken: true;
    pnlByChronologicalFold: true;
  };
  unresolvedCensoringPolicy: {
    noLastPriceClose: true;
    noFabricatedStop: true;
    noFabricatedMaxHoldFill: true;
    unresolvedAtDatasetOrFoldEnd: true;
    partialFirstLegThenOpenRunner: 'partially_realized_censored';
    completedMetricsExcludePartialCensored: true;
  };
  noInterpolation: true;
  observedPriceTrailingSemantics: 'highest_observed_post_entry_only';
  deterministicDatasetFingerprint: true;
  deterministicTieBreaking: 'lexicographically_smaller_candidateId';
  noHyperopt: true;
  noRandomSearch: true;
  noLiveIntegration: true;
  noDbWrites: true;
  noMachineLearning: true;
  eventOrdering: readonly [
    'collectedAt_instant_ascending',
    'tokenMint_ascending',
    'pairAddress_ascending',
    'deterministic_market_semantic_identity',
    'research_market_observation_identity',
  ];
  sqliteRowIdNotSemanticOrder: true;
  sameTimestampSameTokenLifecycle: typeof SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE;
  requiredExitDefinitionFingerprint: string;
  frozenX11BaselineExitFingerprint: string;
};

export type CanonicalOptimizationDefinitionOverrides = Partial<CanonicalOptimizationDefinition>;

export function canonicalOptimizationDefinition(
  overrides: CanonicalOptimizationDefinitionOverrides = {},
): CanonicalOptimizationDefinition {
  return {
    optimizationSpecVersion: overrides.optimizationSpecVersion ?? OPTIMIZATION_SPEC_VERSION,
    optimizationSpecName: overrides.optimizationSpecName ?? OPTIMIZATION_SPEC_NAME,
    researchOnly: true,
    noNetwork: true,
    frozenSnapshotUniverse: {
      reuseExactR125ResearchUniverse: true,
      excludeRuntimeExitReferencedSnapshotsBeforeOptimization: true,
      noWiderUniverseForBetterResults: true,
      requiredResearchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
      ...overrides.frozenSnapshotUniverse,
    },
    pointInTimeFeatureReconstruction: {
      asOf: 'snapshot.collectedAt',
      generatedAt: 'snapshot.collectedAt',
      featureEngine: 'frozen_c06_v1_generateFeatureVector',
      previousMarket: {
        sameToken: true,
        sameExactPair: true,
        strictlyEarlier: true,
        neverFuture: true,
        neverSelf: true,
        neverSameTimestamp: true,
      },
      riskAsOf: {
        sameToken: true,
        scannedAtAtOrBeforeAsOf: true,
        neverFuture: true,
      },
      ...overrides.pointInTimeFeatureReconstruction,
    },
    entryCatalog: {
      fixedCount: overrides.entryCatalog?.fixedCount ?? ENTRY_CANDIDATE_COUNT,
      order: 'candidateId_registry_order',
      noResultBasedSort: true,
      candidates: overrides.entryCatalog?.candidates ?? optimizationEntryCatalog(),
    },
    exitCatalog: {
      fixedCount: overrides.exitCatalog?.fixedCount ?? EXIT_CANDIDATE_COUNT,
      order: 'candidateId_registry_order',
      noResultBasedSort: true,
      candidates: overrides.exitCatalog?.candidates ?? optimizationExitCatalog(),
    },
    combinedTheoreticalPairs: overrides.combinedTheoreticalPairs ?? COMBINED_THEORETICAL_PAIRS,
    stageWiseSelectionNotBlindFortyWay: true,
    referenceNotionalUsd: overrides.referenceNotionalUsd ?? OPTIMIZATION_ENTRY_REFERENCE_NOTIONAL_USD,
    quantityFormula: overrides.quantityFormula ?? POSITION_QUANTITY_FORMULA,
    costScenarios: {
      costSpecVersion: COST_SPEC_VERSION,
      costDefinitionFingerprint: COST_DEFINITION_FINGERPRINT,
      noEnvironmentOverride: true,
      notMeasuredHistoricalExecutionCost: true,
      ...overrides.costScenarios,
    },
    chronologicalSegmentCount: overrides.chronologicalSegmentCount ?? CHRONOLOGICAL_SEGMENT_COUNT,
    anchoredWalkForward: {
      foldCount: WALK_FORWARD_FOLD_COUNT,
      fold1: { train: 'S1+S2', test: 'S3' },
      fold2: { train: 'S1+S2+S3', test: 'S4' },
      fold3: { train: 'S1+S2+S3+S4', test: 'S5' },
      fold4: { train: 'S1+S2+S3+S4+S5', test: 'S6' },
      testNeverUsedForSelection: true,
      ...overrides.anchoredWalkForward,
    },
    foldEntryCutoff: {
      maxOptimizationHoldMs: MAX_OPTIMIZATION_HOLD_MS,
      trainLatestEntry: 'trainEndExclusive - 24h inclusive',
      testLatestEntry: 'testObservationEnd - 24h inclusive',
      entryAfterCutoffIneligible: true,
      entryInTestNeverTraining: true,
      noCrossFoldOutcomeLeakage: true,
      ...overrides.foldEntryCutoff,
    },
    trainingOnlySelection: true,
    noOosSelection: true,
    entrySelectionRanking: overrides.entrySelectionRanking ?? [
      'higher_stress_net_expectancy_usd_per_completed_trade',
      'higher_base_profit_factor',
      'lower_base_max_drawdown_usd',
      'higher_base_median_trade_pnl',
      'lexicographically_smaller_candidateId',
    ],
    exitSelectionRanking: overrides.exitSelectionRanking ?? [
      'higher_stress_net_expectancy_usd_per_completed_trade',
      'higher_base_profit_factor',
      'lower_base_max_drawdown_usd',
      'higher_base_median_trade_pnl',
      'lexicographically_smaller_exitCandidateId',
    ],
    minimumTrainingEligibility: {
      completedTrades: TRAIN_MIN_COMPLETED_TRADES,
      maxCensoredFraction: TRAIN_MAX_CENSORED_FRACTION,
      ...overrides.minimumTrainingEligibility,
    },
    oosPromotionGates: {
      allFourFoldsExist: true,
      minAggregateSelectedOosCompletedTrades: OOS_MIN_AGGREGATE_COMPLETED_TRADES,
      minCompletedSelectedTradesEachTestFold: OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
      maxAggregateCensoredFraction: OOS_MAX_AGGREGATE_CENSORED_FRACTION,
      aggregateOosBaseExpectancyMustBePositive: true,
      aggregateOosStressExpectancyMustBePositive: true,
      minAggregateOosBaseProfitFactor: PROMOTION_MIN_BASE_PROFIT_FACTOR,
      maxAggregateOosBaseDrawdownPctOfPeakCumulativeCompletedNetPnl: PROMOTION_MAX_BASE_DRAWDOWN_PCT,
      minFoldsWithPositiveBaseExpectancy: PROMOTION_MIN_POSITIVE_BASE_EXPECTANCY_FOLDS,
      maxTop1PositiveConcentrationPct: PROMOTION_MAX_TOP1_CONCENTRATION_PCT,
      maxTop3PositiveConcentrationPct: PROMOTION_MAX_TOP3_CONCENTRATION_PCT,
      selectedMustBeatS07X11BaselineWhenComparable: true,
      missingBaselineComparisonIsNotPass: true,
      runtimeIntegrityMustPass: true,
      ...overrides.oosPromotionGates,
    },
    baselineComparison: {
      control1: { entry: 's07_baseline', exit: 'x11_baseline' },
      control2: { entry: 'quality_control_v1', exit: 'x11_baseline' },
      sameTestBoundariesAndCostScenarios: true,
      comparableOnlyWhen: {
        allFourExactOosWindows: true,
        minAggregateCompletedTrades: BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES,
        minCompletedTradesEachTestFold: BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD,
      },
      ifNotComparable: 'NOT_COMPARABLE',
      notComparableBlocksEligibility: true,
      ...overrides.baselineComparison,
    },
    drawdownPercent: {
      usd: 'peak_to_trough_of_cumulative_completed_net_pnl_sorted_by_exit_time',
      percentDenominator: 'peak_cumulative_completed_net_pnl_usd',
      ifPeakNotPositive: null,
      notBankrollDrawdown: true,
      notInflatedByCompletedTradeCount: true,
      ...overrides.drawdownPercent,
    },
    structuralReadiness: {
      distinguishTimePartitionsConstructible: true,
      distinguishWalkForwardEvaluable: true,
      distinguishPromotionDataSufficient: true,
      noGenericYesWhenUnevaluable: true,
      ...overrides.structuralReadiness,
    },
    segmentBoundaries: {
      construction: 'integer_ms_span_divmod_6',
      noIeeeFractionalMillisecondsInFoldIdentity: true,
      exactPartition: true,
      ...overrides.segmentBoundaries,
    },
    foldCutoff: {
      providesMaximumConfiguredClockWindowInsideFold: true,
      doesNotGuaranteeClosingObservation: true,
      sparseDataRemainsCensored: true,
      entryAtCutoffInclusive: true,
      entryAfterCutoffIneligible: true,
      ...overrides.foldCutoff,
    },
    censoredFraction: {
      numerator: 'unresolved_plus_partially_realized_censored',
      denominator: 'opened_positions',
      openedZero: 'null_not_eligible',
      ...overrides.censoredFraction,
    },
    partialCensoredAccounting: {
      notACompletedTrade: true,
      countsAsOpenedAndCensoredForEligibility: true,
      realizedLegMayBeReportedSeparately: true,
      mustNotImproveCompletedTradeRankingOrPromotionMetrics: true,
      ...overrides.partialCensoredAccounting,
    },
    costApplication: {
      triggersUseGrossReferencePathOnly: true,
      frictionAppliedAfterGrossLegExists: true,
      quantityFromGrossReferenceNotional: true,
      effectiveCashOutlayMayExceedReferenceNotional: true,
      ...overrides.costApplication,
    },
    x11Baseline: {
      historicalControl: true,
      retainsFrozenObservedTakeFill: true,
      notANormalizedExecutionComparisonWithO17Exits: true,
      ...overrides.x11Baseline,
    },
    runtimeIntegrity: {
      evaluatedOnEachRun: true,
      notHardcodedPassBecauseUnitTestsPassed: true,
      failureBlocksPromotion: true,
      ...overrides.runtimeIntegrity,
    },
    selectorIsolation: {
      receivesTrainingSelectorRowsOnly: true,
      oosResultObjectsNotAvailableToSelector: true,
      ...overrides.selectorIsolation,
    },
    aggregateSelectedOos: {
      measuresWalkForwardSelectionMethodology: true,
      notASingleFixedStrategyUnlessEveryFoldSelectedTheSamePair: true,
      ...overrides.aggregateSelectedOos,
    },
    paperCandidate: {
      onlyIfEligibleForForwardPaperValidation: true,
      fullHistorySelectionIsNotFreshOosProof: true,
      doesNotMutatePaperEngine: true,
      ...overrides.paperCandidate,
    },
    concentrationMetrics: {
      top1PositiveProfit: true,
      top3PositiveProfit: true,
      pnlByToken: true,
      pnlByChronologicalFold: true,
      ...overrides.concentrationMetrics,
    },
    unresolvedCensoringPolicy: {
      noLastPriceClose: true,
      noFabricatedStop: true,
      noFabricatedMaxHoldFill: true,
      unresolvedAtDatasetOrFoldEnd: true,
      partialFirstLegThenOpenRunner: 'partially_realized_censored',
      completedMetricsExcludePartialCensored: true,
      ...overrides.unresolvedCensoringPolicy,
    },
    noInterpolation: true,
    observedPriceTrailingSemantics: 'highest_observed_post_entry_only',
    deterministicDatasetFingerprint: true,
    deterministicTieBreaking: 'lexicographically_smaller_candidateId',
    noHyperopt: true,
    noRandomSearch: true,
    noLiveIntegration: true,
    noDbWrites: true,
    noMachineLearning: true,
    eventOrdering: overrides.eventOrdering ?? [
      'collectedAt_instant_ascending',
      'tokenMint_ascending',
      'pairAddress_ascending',
      'deterministic_market_semantic_identity',
      'research_market_observation_identity',
    ],
    sqliteRowIdNotSemanticOrder: true,
    sameTimestampSameTokenLifecycle:
      overrides.sameTimestampSameTokenLifecycle ?? SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE,
    requiredExitDefinitionFingerprint: overrides.requiredExitDefinitionFingerprint ?? EXIT_DEFINITION_FINGERPRINT,
    frozenX11BaselineExitFingerprint:
      overrides.frozenX11BaselineExitFingerprint ?? EXIT_DEFINITION_FINGERPRINT,
  };
}

export function mutateCanonicalOptimizationDefinition(
  mutate: (definition: CanonicalOptimizationDefinition) => void,
): CanonicalOptimizationDefinition {
  const definition = structuredClone(canonicalOptimizationDefinition());
  mutate(definition);
  return definition;
}
