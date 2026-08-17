import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../performance/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { POSITION_QUANTITY_FORMULA } from '../position/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import { frozenCandidateFingerprintRecords } from './catalog.js';
import {
  COMMON_GATE_VERSION,
  NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE,
  RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
  RESEARCH_SPEC_NAME,
  RESEARCH_SPEC_VERSION,
  REQUIRED_RESEARCH_EXIT_SPEC_VERSION,
  REQUIRED_RESEARCH_FEATURE_SET_VERSION,
  REQUIRED_RESEARCH_PAPER_SPEC_VERSION,
  REQUIRED_RESEARCH_PERFORMANCE_SPEC_VERSION,
  REQUIRED_RESEARCH_POSITION_SPEC_VERSION,
  REQUIRED_RESEARCH_STRATEGY_VERSION,
  S07_BASELINE_DECISION_PRECEDENCE,
  SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE,
  SLICE_EARLY_ELAPSED_FRACTION,
  SLICE_LATE_ELAPSED_FRACTION,
  SLICE_MIDDLE_ELAPSED_FRACTION,
} from './constants.js';

export type CanonicalResearchDefinition = {
  researchSpecVersion: string;
  researchSpecName: string;
  requiredFeatureSetVersion: string;
  requiredStrategyVersion: string;
  requiredStrategyDefinitionFingerprint: string;
  requiredBacktestDefinitionFingerprint: string;
  requiredPaperSpecVersion: string;
  requiredPaperDefinitionFingerprint: string;
  requiredPositionSpecVersion: string;
  requiredPositionDefinitionFingerprint: string;
  requiredExitSpecVersion: string;
  requiredExitDefinitionFingerprint: string;
  requiredPerformanceSpecVersion: string;
  requiredPerformanceDefinitionFingerprint: string;
  snapshotUniverse: {
    source: string;
    sameDatasetForEveryCandidate: true;
    excludeRuntimeExitReferencedSnapshots: true;
    exclusionIsProvenanceControlNotPerformanceFilter: true;
    conservativeExcludeIfLaterReusedByX11: true;
    noTokenProfitabilityFilter: true;
    noCandidateSpecificDatasetFilter: true;
  };
  pointInTimeReconstruction: {
    asOf: 'snapshot.collectedAt';
    generatedAt: 'snapshot.collectedAt';
    featureEngine: 'frozen_c06_v1_generateFeatureVector';
    doNotUseLaterStoredFeatureVectors: true;
    previousMarket: {
      sameToken: true;
      sameExactPair: true;
      strictlyEarlier: true;
      newestEligibleEarlierResearchSnapshot: true;
      neverFuture: true;
      neverSelf: true;
      neverSameTimestamp: true;
    };
    riskAsOf: {
      sameToken: true;
      scannedAtAtOrBeforeAsOf: true;
      newestEligible: true;
      neverFuture: true;
    };
  };
  candidateRegistry: {
    fixedCount: 5;
    order: 'candidateId_registry_order';
    userConfigurableThresholds: false;
    envStrategySettings: false;
    hyperparameters: false;
    optimizer: false;
    candidates: readonly { candidateId: string; candidateDefinitionFingerprint: string }[];
  };
  commonGateVersion: string;
  newCandidateRequiredDataPrecedence: typeof NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE;
  s07BaselineDecisionPrecedence: typeof S07_BASELINE_DECISION_PRECEDENCE;
  eventOrdering: readonly [
    'collectedAt_instant_ascending',
    'tokenMint_ascending',
    'pairAddress_ascending',
    'deterministic_market_semantic_identity',
    'research_market_observation_identity',
  ];
  sqliteRowIdNotSemanticOrder: true;
  sameTimestampSameTokenLifecycle: typeof SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE;
  oneOpenPositionPerTokenMint: true;
  noBankroll: true;
  noPortfolioCapitalConstraint: true;
  overlappingTokensAreNotPortfolioReturn: true;
  entry: {
    referencePrice: 'current_research_snapshot_priceUsd';
    requireFinitePriceGreaterThanZero: true;
    referenceNotionalUsd: number;
    quantityFormula: string;
    quantityRounding: 'none';
    slippage: 'none';
    fees: 'none';
    priceImpact: 'none';
    model: 'paper_reference_entry';
  };
  exit: {
    sharedAcrossAllCandidates: true;
    spec: 'x11_v1';
    fingerprint: string;
    exactOpeningPairOnly: true;
    noPairFallback: true;
    noPartialExit: true;
    noTrailingStop: true;
    noRunnerMoonbagExit: true;
  };
  noSameSnapshotReentry: true;
  earliestReentry: 'next_eligible_later_snapshot';
  unresolved: {
    classify: 'unresolved_at_dataset_end';
    noLastPriceClose: true;
    noMarkToMarket: true;
    noFabricatedMaxHoldPrice: true;
    noOtherPair: true;
    noInterpolatedSixHourPrice: true;
    evaluateMaxHoldAtNextExactPairObservation: true;
    completedAnalyticsUsesCompletedTradesOnly: true;
    coverageMustShowUnresolved: true;
  };
  identities: {
    noRandomIds: true;
    noDatabaseRowIds: true;
    noReportTimeTimestamps: true;
    datasetBindsFullMarketObservationFacts: true;
    datasetBindsFullRiskFeatureInputFacts: true;
    datasetBindsExcludedRuntimeExitObservationFacts: true;
    candidateRunBindsDecisionCounts: true;
    candidateRunBindsLifecycleCounts: true;
    candidateRunBindsUnresolvedReasonAndLastExactPair: true;
  };
  performance: {
    mathematics: 'a12_compatible_gross_paper_reference';
    notA12RuntimeImmutableReport: true;
    noNetPnl: true;
    noSharpe: true;
    noSortino: true;
    noCagr: true;
    noPortfolioReturn: true;
    noPortfolioDrawdownPct: true;
    noLiveExpectancy: true;
    noCosts: true;
    noSlippage: true;
  };
  chronologicalSlices: {
    kind: 'descriptive_robustness_slices_not_formal_oos';
    earlyElapsedFraction: number;
    middleElapsedFraction: number;
    lateElapsedFraction: number;
    assignCompletedTradeBy: 'exit_timestamp';
    earlyEndExclusive: true;
    middleEndExclusive: true;
    spanZeroAssignsEarly: true;
    oneMillisecondSpanCollapsesEarlyAndMiddleToLate: true;
    doNotResetOpenPositionsAtSliceBoundaries: true;
    simulationRunsContinuously: true;
  };
  sampleAdequacy: {
    noNumericValidityThreshold: true;
    noMinimumSnapshotCount: true;
    noMinimumTokenCount: true;
    noEnoughDataBoolean: true;
    noScientificSignificanceThreshold: true;
    reportRawCoverageFactsOnly: true;
  };
  noOptimization: true;
  noRankingOrWinnerSelection: true;
  noCherryPicking: {
    noStartDate: true;
    noEndDate: true;
    noTokenFilter: true;
    noExcludeToken: true;
    noOnlyWinners: true;
    noMinimumReturn: true;
    noBestPeriod: true;
    noThresholdFlag: true;
    noCandidateParameter: true;
    alwaysFullResearchUniverse: true;
  };
  database: {
    queryOnly: true;
    noNetwork: true;
    noPersistedResearchResults: true;
    noMigration008: true;
  };
};

export type CanonicalResearchDefinitionOverrides = {
  researchSpecVersion?: string;
  researchSpecName?: string;
  requiredFeatureSetVersion?: string;
  requiredStrategyVersion?: string;
  requiredStrategyDefinitionFingerprint?: string;
  requiredBacktestDefinitionFingerprint?: string;
  requiredPaperSpecVersion?: string;
  requiredPaperDefinitionFingerprint?: string;
  requiredPositionSpecVersion?: string;
  requiredPositionDefinitionFingerprint?: string;
  requiredExitSpecVersion?: string;
  requiredExitDefinitionFingerprint?: string;
  requiredPerformanceSpecVersion?: string;
  requiredPerformanceDefinitionFingerprint?: string;
  snapshotUniverse?: Partial<CanonicalResearchDefinition['snapshotUniverse']>;
  pointInTimeReconstruction?: Partial<CanonicalResearchDefinition['pointInTimeReconstruction']>;
  candidateRegistry?: Partial<CanonicalResearchDefinition['candidateRegistry']>;
  commonGateVersion?: string;
  newCandidateRequiredDataPrecedence?: CanonicalResearchDefinition['newCandidateRequiredDataPrecedence'];
  s07BaselineDecisionPrecedence?: CanonicalResearchDefinition['s07BaselineDecisionPrecedence'];
  eventOrdering?: CanonicalResearchDefinition['eventOrdering'];
  sqliteRowIdNotSemanticOrder?: true;
  sameTimestampSameTokenLifecycle?: CanonicalResearchDefinition['sameTimestampSameTokenLifecycle'];
  oneOpenPositionPerTokenMint?: true;
  noBankroll?: true;
  noPortfolioCapitalConstraint?: true;
  overlappingTokensAreNotPortfolioReturn?: true;
  entry?: Partial<CanonicalResearchDefinition['entry']>;
  exit?: Partial<CanonicalResearchDefinition['exit']>;
  noSameSnapshotReentry?: true;
  earliestReentry?: 'next_eligible_later_snapshot';
  unresolved?: Partial<CanonicalResearchDefinition['unresolved']>;
  identities?: Partial<CanonicalResearchDefinition['identities']>;
  performance?: Partial<CanonicalResearchDefinition['performance']>;
  chronologicalSlices?: Partial<CanonicalResearchDefinition['chronologicalSlices']>;
  sampleAdequacy?: Partial<CanonicalResearchDefinition['sampleAdequacy']>;
  noOptimization?: true;
  noRankingOrWinnerSelection?: true;
  noCherryPicking?: Partial<CanonicalResearchDefinition['noCherryPicking']>;
  database?: Partial<CanonicalResearchDefinition['database']>;
};

export function canonicalResearchDefinition(
  overrides: CanonicalResearchDefinitionOverrides = {},
): CanonicalResearchDefinition {
  return {
    researchSpecVersion: overrides.researchSpecVersion ?? RESEARCH_SPEC_VERSION,
    researchSpecName: overrides.researchSpecName ?? RESEARCH_SPEC_NAME,
    requiredFeatureSetVersion: overrides.requiredFeatureSetVersion ?? REQUIRED_RESEARCH_FEATURE_SET_VERSION,
    requiredStrategyVersion: overrides.requiredStrategyVersion ?? REQUIRED_RESEARCH_STRATEGY_VERSION,
    requiredStrategyDefinitionFingerprint:
      overrides.requiredStrategyDefinitionFingerprint ?? STRATEGY_DEFINITION_FINGERPRINT,
    requiredBacktestDefinitionFingerprint:
      overrides.requiredBacktestDefinitionFingerprint ?? BACKTEST_DEFINITION_FINGERPRINT,
    requiredPaperSpecVersion: overrides.requiredPaperSpecVersion ?? REQUIRED_RESEARCH_PAPER_SPEC_VERSION,
    requiredPaperDefinitionFingerprint:
      overrides.requiredPaperDefinitionFingerprint ?? PAPER_DEFINITION_FINGERPRINT,
    requiredPositionSpecVersion:
      overrides.requiredPositionSpecVersion ?? REQUIRED_RESEARCH_POSITION_SPEC_VERSION,
    requiredPositionDefinitionFingerprint:
      overrides.requiredPositionDefinitionFingerprint ?? POSITION_DEFINITION_FINGERPRINT,
    requiredExitSpecVersion: overrides.requiredExitSpecVersion ?? REQUIRED_RESEARCH_EXIT_SPEC_VERSION,
    requiredExitDefinitionFingerprint:
      overrides.requiredExitDefinitionFingerprint ?? EXIT_DEFINITION_FINGERPRINT,
    requiredPerformanceSpecVersion:
      overrides.requiredPerformanceSpecVersion ?? REQUIRED_RESEARCH_PERFORMANCE_SPEC_VERSION,
    requiredPerformanceDefinitionFingerprint:
      overrides.requiredPerformanceDefinitionFingerprint ?? PERFORMANCE_DEFINITION_FINGERPRINT,
    snapshotUniverse: {
      source: overrides.snapshotUniverse?.source ?? 'sqlite_market_snapshots_query_only',
      sameDatasetForEveryCandidate: overrides.snapshotUniverse?.sameDatasetForEveryCandidate ?? true,
      excludeRuntimeExitReferencedSnapshots:
        overrides.snapshotUniverse?.excludeRuntimeExitReferencedSnapshots ?? true,
      exclusionIsProvenanceControlNotPerformanceFilter:
        overrides.snapshotUniverse?.exclusionIsProvenanceControlNotPerformanceFilter ?? true,
      conservativeExcludeIfLaterReusedByX11:
        overrides.snapshotUniverse?.conservativeExcludeIfLaterReusedByX11 ?? true,
      noTokenProfitabilityFilter: overrides.snapshotUniverse?.noTokenProfitabilityFilter ?? true,
      noCandidateSpecificDatasetFilter:
        overrides.snapshotUniverse?.noCandidateSpecificDatasetFilter ?? true,
    },
    pointInTimeReconstruction: {
      asOf: overrides.pointInTimeReconstruction?.asOf ?? 'snapshot.collectedAt',
      generatedAt: overrides.pointInTimeReconstruction?.generatedAt ?? 'snapshot.collectedAt',
      featureEngine:
        overrides.pointInTimeReconstruction?.featureEngine ?? 'frozen_c06_v1_generateFeatureVector',
      doNotUseLaterStoredFeatureVectors:
        overrides.pointInTimeReconstruction?.doNotUseLaterStoredFeatureVectors ?? true,
      previousMarket: {
        sameToken: true,
        sameExactPair: true,
        strictlyEarlier: true,
        newestEligibleEarlierResearchSnapshot: true,
        neverFuture: true,
        neverSelf: true,
        neverSameTimestamp: true,
        ...overrides.pointInTimeReconstruction?.previousMarket,
      },
      riskAsOf: {
        sameToken: true,
        scannedAtAtOrBeforeAsOf: true,
        newestEligible: true,
        neverFuture: true,
        ...overrides.pointInTimeReconstruction?.riskAsOf,
      },
    },
    candidateRegistry: {
      fixedCount: overrides.candidateRegistry?.fixedCount ?? 5,
      order: overrides.candidateRegistry?.order ?? 'candidateId_registry_order',
      userConfigurableThresholds: overrides.candidateRegistry?.userConfigurableThresholds ?? false,
      envStrategySettings: overrides.candidateRegistry?.envStrategySettings ?? false,
      hyperparameters: overrides.candidateRegistry?.hyperparameters ?? false,
      optimizer: overrides.candidateRegistry?.optimizer ?? false,
      candidates: overrides.candidateRegistry?.candidates ?? frozenCandidateFingerprintRecords(),
    },
    commonGateVersion: overrides.commonGateVersion ?? COMMON_GATE_VERSION,
    newCandidateRequiredDataPrecedence:
      overrides.newCandidateRequiredDataPrecedence ?? NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE,
    s07BaselineDecisionPrecedence:
      overrides.s07BaselineDecisionPrecedence ?? S07_BASELINE_DECISION_PRECEDENCE,
    eventOrdering: overrides.eventOrdering ?? [
      'collectedAt_instant_ascending',
      'tokenMint_ascending',
      'pairAddress_ascending',
      'deterministic_market_semantic_identity',
      'research_market_observation_identity',
    ],
    sqliteRowIdNotSemanticOrder: overrides.sqliteRowIdNotSemanticOrder ?? true,
    sameTimestampSameTokenLifecycle:
      overrides.sameTimestampSameTokenLifecycle ?? SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE,
    oneOpenPositionPerTokenMint: overrides.oneOpenPositionPerTokenMint ?? true,
    noBankroll: overrides.noBankroll ?? true,
    noPortfolioCapitalConstraint: overrides.noPortfolioCapitalConstraint ?? true,
    overlappingTokensAreNotPortfolioReturn: overrides.overlappingTokensAreNotPortfolioReturn ?? true,
    entry: {
      referencePrice: overrides.entry?.referencePrice ?? 'current_research_snapshot_priceUsd',
      requireFinitePriceGreaterThanZero: overrides.entry?.requireFinitePriceGreaterThanZero ?? true,
      referenceNotionalUsd: overrides.entry?.referenceNotionalUsd ?? RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
      quantityFormula: overrides.entry?.quantityFormula ?? POSITION_QUANTITY_FORMULA,
      quantityRounding: overrides.entry?.quantityRounding ?? 'none',
      slippage: overrides.entry?.slippage ?? 'none',
      fees: overrides.entry?.fees ?? 'none',
      priceImpact: overrides.entry?.priceImpact ?? 'none',
      model: overrides.entry?.model ?? 'paper_reference_entry',
    },
    exit: {
      sharedAcrossAllCandidates: overrides.exit?.sharedAcrossAllCandidates ?? true,
      spec: overrides.exit?.spec ?? 'x11_v1',
      fingerprint: overrides.exit?.fingerprint ?? EXIT_DEFINITION_FINGERPRINT,
      exactOpeningPairOnly: overrides.exit?.exactOpeningPairOnly ?? true,
      noPairFallback: overrides.exit?.noPairFallback ?? true,
      noPartialExit: overrides.exit?.noPartialExit ?? true,
      noTrailingStop: overrides.exit?.noTrailingStop ?? true,
      noRunnerMoonbagExit: overrides.exit?.noRunnerMoonbagExit ?? true,
    },
    noSameSnapshotReentry: overrides.noSameSnapshotReentry ?? true,
    earliestReentry: overrides.earliestReentry ?? 'next_eligible_later_snapshot',
    unresolved: {
      classify: overrides.unresolved?.classify ?? 'unresolved_at_dataset_end',
      noLastPriceClose: overrides.unresolved?.noLastPriceClose ?? true,
      noMarkToMarket: overrides.unresolved?.noMarkToMarket ?? true,
      noFabricatedMaxHoldPrice: overrides.unresolved?.noFabricatedMaxHoldPrice ?? true,
      noOtherPair: overrides.unresolved?.noOtherPair ?? true,
      noInterpolatedSixHourPrice: overrides.unresolved?.noInterpolatedSixHourPrice ?? true,
      evaluateMaxHoldAtNextExactPairObservation:
        overrides.unresolved?.evaluateMaxHoldAtNextExactPairObservation ?? true,
      completedAnalyticsUsesCompletedTradesOnly:
        overrides.unresolved?.completedAnalyticsUsesCompletedTradesOnly ?? true,
      coverageMustShowUnresolved: overrides.unresolved?.coverageMustShowUnresolved ?? true,
    },
    identities: {
      noRandomIds: overrides.identities?.noRandomIds ?? true,
      noDatabaseRowIds: overrides.identities?.noDatabaseRowIds ?? true,
      noReportTimeTimestamps: overrides.identities?.noReportTimeTimestamps ?? true,
      datasetBindsFullMarketObservationFacts:
        overrides.identities?.datasetBindsFullMarketObservationFacts ?? true,
      datasetBindsFullRiskFeatureInputFacts:
        overrides.identities?.datasetBindsFullRiskFeatureInputFacts ?? true,
      datasetBindsExcludedRuntimeExitObservationFacts:
        overrides.identities?.datasetBindsExcludedRuntimeExitObservationFacts ?? true,
      candidateRunBindsDecisionCounts: overrides.identities?.candidateRunBindsDecisionCounts ?? true,
      candidateRunBindsLifecycleCounts: overrides.identities?.candidateRunBindsLifecycleCounts ?? true,
      candidateRunBindsUnresolvedReasonAndLastExactPair:
        overrides.identities?.candidateRunBindsUnresolvedReasonAndLastExactPair ?? true,
    },
    performance: {
      mathematics: overrides.performance?.mathematics ?? 'a12_compatible_gross_paper_reference',
      notA12RuntimeImmutableReport: overrides.performance?.notA12RuntimeImmutableReport ?? true,
      noNetPnl: overrides.performance?.noNetPnl ?? true,
      noSharpe: overrides.performance?.noSharpe ?? true,
      noSortino: overrides.performance?.noSortino ?? true,
      noCagr: overrides.performance?.noCagr ?? true,
      noPortfolioReturn: overrides.performance?.noPortfolioReturn ?? true,
      noPortfolioDrawdownPct: overrides.performance?.noPortfolioDrawdownPct ?? true,
      noLiveExpectancy: overrides.performance?.noLiveExpectancy ?? true,
      noCosts: overrides.performance?.noCosts ?? true,
      noSlippage: overrides.performance?.noSlippage ?? true,
    },
    chronologicalSlices: {
      kind: overrides.chronologicalSlices?.kind ?? 'descriptive_robustness_slices_not_formal_oos',
      earlyElapsedFraction: overrides.chronologicalSlices?.earlyElapsedFraction ?? SLICE_EARLY_ELAPSED_FRACTION,
      middleElapsedFraction:
        overrides.chronologicalSlices?.middleElapsedFraction ?? SLICE_MIDDLE_ELAPSED_FRACTION,
      lateElapsedFraction: overrides.chronologicalSlices?.lateElapsedFraction ?? SLICE_LATE_ELAPSED_FRACTION,
      assignCompletedTradeBy: overrides.chronologicalSlices?.assignCompletedTradeBy ?? 'exit_timestamp',
      earlyEndExclusive: overrides.chronologicalSlices?.earlyEndExclusive ?? true,
      middleEndExclusive: overrides.chronologicalSlices?.middleEndExclusive ?? true,
      spanZeroAssignsEarly: overrides.chronologicalSlices?.spanZeroAssignsEarly ?? true,
      oneMillisecondSpanCollapsesEarlyAndMiddleToLate:
        overrides.chronologicalSlices?.oneMillisecondSpanCollapsesEarlyAndMiddleToLate ?? true,
      doNotResetOpenPositionsAtSliceBoundaries:
        overrides.chronologicalSlices?.doNotResetOpenPositionsAtSliceBoundaries ?? true,
      simulationRunsContinuously: overrides.chronologicalSlices?.simulationRunsContinuously ?? true,
    },
    sampleAdequacy: {
      noNumericValidityThreshold: overrides.sampleAdequacy?.noNumericValidityThreshold ?? true,
      noMinimumSnapshotCount: overrides.sampleAdequacy?.noMinimumSnapshotCount ?? true,
      noMinimumTokenCount: overrides.sampleAdequacy?.noMinimumTokenCount ?? true,
      noEnoughDataBoolean: overrides.sampleAdequacy?.noEnoughDataBoolean ?? true,
      noScientificSignificanceThreshold:
        overrides.sampleAdequacy?.noScientificSignificanceThreshold ?? true,
      reportRawCoverageFactsOnly: overrides.sampleAdequacy?.reportRawCoverageFactsOnly ?? true,
    },
    noOptimization: overrides.noOptimization ?? true,
    noRankingOrWinnerSelection: overrides.noRankingOrWinnerSelection ?? true,
    noCherryPicking: {
      noStartDate: overrides.noCherryPicking?.noStartDate ?? true,
      noEndDate: overrides.noCherryPicking?.noEndDate ?? true,
      noTokenFilter: overrides.noCherryPicking?.noTokenFilter ?? true,
      noExcludeToken: overrides.noCherryPicking?.noExcludeToken ?? true,
      noOnlyWinners: overrides.noCherryPicking?.noOnlyWinners ?? true,
      noMinimumReturn: overrides.noCherryPicking?.noMinimumReturn ?? true,
      noBestPeriod: overrides.noCherryPicking?.noBestPeriod ?? true,
      noThresholdFlag: overrides.noCherryPicking?.noThresholdFlag ?? true,
      noCandidateParameter: overrides.noCherryPicking?.noCandidateParameter ?? true,
      alwaysFullResearchUniverse: overrides.noCherryPicking?.alwaysFullResearchUniverse ?? true,
    },
    database: {
      queryOnly: overrides.database?.queryOnly ?? true,
      noNetwork: overrides.database?.noNetwork ?? true,
      noPersistedResearchResults: overrides.database?.noPersistedResearchResults ?? true,
      noMigration008: overrides.database?.noMigration008 ?? true,
    },
  };
}

export function mutateCanonicalResearchDefinition(
  mutate: (definition: CanonicalResearchDefinition) => void,
): CanonicalResearchDefinition {
  const definition = structuredClone(canonicalResearchDefinition());
  mutate(definition);
  return definition;
}
