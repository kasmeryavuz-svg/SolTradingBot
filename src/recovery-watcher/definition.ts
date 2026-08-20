import {
  RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT,
  RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE,
  RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD,
  RECOVERY_V0_MIN_DIP_VOLUME_5M_USD,
  RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT,
  RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M,
  RECOVERY_V0_SIGNAL_NAME,
  RECOVERY_V0_SIGNAL_VERSION,
  RW0_COOLDOWN_MS,
  RW0_COST_MODEL,
  RW0_EPISODE_WINDOW_MS,
  RW0_EXECUTION_MODEL,
  RW0_EXIT_MAX_HOLDING_MS,
  RW0_EXIT_SPEC_NAME,
  RW0_EXIT_SPEC_VERSION,
  RW0_EXIT_STOP_LOSS_BPS,
  RW0_EXIT_TAKE_PROFIT_BPS,
  RW0_MAX_CONCURRENT_WATCHES,
  RW0_MAX_EPISODES_PER_MINT_PER_24H,
  RW0_MIGRATION_NAME,
  RW0_NETWORK_TIMEOUT_MS,
  RW0_SCHEMA_VERSION,
  RW0_SAFETY_SPEC_VERSION,
  RW0_SCREENING_DISPOSITIONS,
  RW0_SCREENING_MAX_CANDIDATES,
  RW0_SCHEDULING_POLICY,
  RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE,
  RW0_SHADOW_PAPER_SPEC_NAME,
  RW0_SHADOW_PAPER_SPEC_VERSION,
  RW0_SPEC_NAME,
  RW0_SPEC_VERSION,
  RW0_WATCH_CADENCE_MS,
  RW0_WATCH_FETCH_CONCURRENCY,
  RW0_SCREENING_FETCH_CONCURRENCY,
  RW0_SCREENING_WALL_BUDGET_MS,
  RW0_DIP_FILTER_RESULTS,
  RW0_WATCH_SLOT_STATES,
  RW0_WATCH_TTL_MS,
  SHADOW_CLOSE_REASONS,
} from './constants.js';
import { recoveryMigrationSqlDigest } from './db/migrations.js';
import { canonicalRecoverySafetySpec, RW0_SAFETY_SPEC_FINGERPRINT } from './safety.js';

export type CanonicalRecoveryV0Signal = {
  signalVersion: string;
  signalName: string;
  unproven: true;
  inSampleDiscovered: true;
  notProfitableClaim: true;
  forwardEvidenceOnlyAfterFingerprintFreeze: true;
  historicalSampleCadence: 'sparse_approximately_5_minute_observations';
  forwardObservationCadenceMs: number;
  historicalPercentagesAreNotProofOfNewExecutionRegime: true;
  dipObservation: {
    priceChange5mPct: {
      minInclusive: number;
      maxInclusive: number;
      missing: 'fail_closed';
    };
    volume5mUsd: {
      minInclusive: number;
      missing: 'fail_closed';
    };
    observedPriceUsd: {
      mustBeKnown: true;
      mustBeFinite: true;
      mustBePositive: true;
      missing: 'fail_closed';
    };
    liquidityUsdNotADipGate: true;
    volumeToLiquidity5mNotADipGate: true;
  };
  recoveryConfirmation: {
    strictlyLater: true;
    exactSamePair: true;
    noFutureInformation: true;
    requiresWatchStartedAt: true;
    mustOccurWithinFrozenWatchWindow: true;
    watchExpiresAt: 'watchStartedAt + RW0_WATCH_TTL_MS';
    legalOnlyWhenRecoveryConfirmedAtStrictlyBeforeWatchExpiresAt: true;
    exactWatchExpiryBoundaryBelongsToExpired: true;
    observedPriceUsd: {
      mustBeKnown: true;
      mustBeFinite: true;
      mustBePositive: true;
      strictlyGreaterThanDipPrice: true;
    };
    liquidityUsd: {
      minInclusive: number;
      mustBeKnown: true;
      missing: 'fail_closed';
    };
    volume5mUsd: {
      mustBeKnown: true;
      missing: 'fail_closed';
    };
    volumeToLiquidity5m: {
      computedFromRawVolumeAndLiquidity: true;
      callerSuppliedRatioMustAgreeOrFailClosed: true;
      minInclusive: number;
      maxExclusive: number;
      missing: 'fail_closed';
    };
  };
};

export type CanonicalRw0ShadowPaper = {
  specVersion: string;
  specName: string;
  track: 'shadow';
  safetyIncomplete: true;
  completenessGate: 'FAIL';
  liveReadiness: false;
  neverCountsAsPaperEligible: true;
  neverCountsAsPaperOpen: true;
  onlySimulationPathInRw0V1: true;
  cannotClosedInRw0V1: true;
  entry: {
    source: 'recovery_confirmation_observation';
    allowedBecauseTrackIsExplicitlyUnsafe: true;
    costModel: typeof RW0_COST_MODEL;
    executionModel: typeof RW0_EXECUTION_MODEL;
  };
};

export type CanonicalRw0Exit = {
  specVersion: string;
  specName: string;
  exitExecutionImplementedInRw0V1: false;
  closedFromShadowReachableInRw0V1: false;
  unimplementedUntilDedicatedShadowExitSlice: true;
  intendedComparatorWhenImplemented: {
    stopLossBps: number;
    takeProfitBps: number;
    maxHoldingMs: number;
    thresholdsAreX11ComparatorsNotOptima: true;
    fill: 'observed_snapshot_price';
    noInventedExactFill: true;
    recordOvershootAndGap: true;
    maeMfe: 'observed_only';
    missingPrice: 'CENSORED_UNAVAILABLE_not_win_or_loss';
    closedRequiresObservedExitEvidence: true;
    closedRequiresPersistedMarketObservationIdentity: true;
    observedAtAndObservationCollectedAtAreTheSameInstant: true;
    censoredUnavailableIsNotWinOrLoss: true;
    maxHoldingExitsAsClosedNotExpired: true;
    closeReasons: typeof SHADOW_CLOSE_REASONS;
  };
};

export type CanonicalRecoveryWatcherDefinition = {
  specVersion: string;
  specName: string;
  paperDataResearchOnly: true;
  automaticLiveTrading: false;
  noSigner: true;
  noWallet: true;
  noSendTransaction: true;
  noBroadcast: true;
  noProductionSupervisor: true;
  noProductionSchemaMigration: true;
  productionSchemaMustRemain9: true;
  migration010: 'ABSENT';
  recoverySchemaVersion: number;
  recoveryMigrationName: string;
  recoveryMigrationSqlDigest: string;
  isolatedDatabase: true;
  neverUseProductionDatabasePath: true;
  rejectConfiguredProductionDatabasePath: true;
  discoveryCoverage: 'incomplete_dexscreener_latest_profile_boost_only';
  discoveryCoverageComplete: false;
  holderGate: 'persisted_fail_closed';
  bundleGate: 'persisted_fail_closed';
  creatorGate: 'persisted_fail_closed';
  largestRealHolderPctImplemented: true;
  linkedBundlePctImplemented: true;
  holderPercentageSemanticsUnresolved: false;
  bundlePercentageSemanticsUnresolved: false;
  incompleteOwnerCoverageIsUnknown: true;
  unexplainedTop20RemainderDoesNotProveHiddenSingleAccountOverTenPercent: true;
  heuristicClusterIsNotOwnership: true;
  shadowAndPaperAreDistinctTracks: true;
  safePaperReachableInRw0V1: false;
  completenessGatePassUnreachableInRw0V1: true;
  operational: {
    watchCadenceMs: number;
    watchTtlMs: number;
    cooldownMs: number;
    maxConcurrentWatches: number;
    watchSlotStates: readonly string[];
    maxEpisodesPerMintPer24h: number;
    episodeWindowMs: number;
    confirmationMustBindPersistedMarketObservation: true;
    confirmationEconomicsDerivedFromStoredObservation: true;
    confirmationLegalOnlyWhenRecoveryConfirmedAtStrictlyBeforeWatchExpiresAt: true;
    exactWatchExpiryBoundaryBelongsToExpired: true;
    closedFromShadowReachableInRw0V1: false;
    exitExecutionImplementedInRw0V1: false;
    safetyEvidenceReducerImplemented: true;
    runtimeFileDatabaseRejectsMemoryPath: true;
    networkedForwardObservationImplemented: true;
    screeningIndependentOfEpisodes: true;
    notDipDoesNotCreateEpisode: true;
    notDipDoesNotStartCooldown: true;
    incompleteDoesNotCreateEpisode: true;
    slice2DoesNotOpenShadowResearch: true;
    slice2DoesNotOpenPaper: true;
    slice2DoesNotClose: true;
    confirmationDrainsToRejectedSafetyUnknown: true;
    scheduling: typeof RW0_SCHEDULING_POLICY;
    noCatchUpStorm: true;
    noOverlappingCycles: true;
    noMathRandomJitter: true;
    watchWorkHasPriorityOverScreening: true;
    networkTimeoutMs: number;
    screeningMaxCandidates: number;
    discoveryCallsPerScreeningCycle: number;
    noProviderRetryStorm: true;
    collectedAtIsLocalCollectionTime: true;
    noTrustworthyDexScreenerQuoteTimestamp: true;
    pairSelectionAllowedForScreeningOnly: true;
    pinnedPairNeverSwitches: true;
    screeningDispositions: readonly string[];
    dipFilterResults: readonly string[];
    watchFetchConcurrency: number;
    screeningFetchConcurrency: number;
    screeningWallBudgetMs: number;
    unknownProviderErrorsAreFatal: true;
    singletonLockBeforeSchemaInit: true;
    reportOpensReadOnly: true;
    screeningIdentityMustMatchFrozenRw0: true;
    admissionRecomputesDipFilterInsideTransaction: true;
    priorPublicSmokeIsDisposableEngineeringOnly: true;
    priorPublicSmokeExcludedFromForwardValidation: true;
  };
  signal: CanonicalRecoveryV0Signal;
  safety: {
    specVersion: string;
    specFingerprint: string;
    definition: ReturnType<typeof canonicalRecoverySafetySpec>;
  };
  shadowPaper: CanonicalRw0ShadowPaper;
  exit: CanonicalRw0Exit;
  safePaperEntry: {
    unimplementedInRw0V1: true;
    requiresNewWatcherSpecVersionAndFingerprint: true;
    recoveryConfirmationFirst: true;
    thenCollectSafetyEvidence: true;
    allRequiredSafetyObservedAtAtOrBeforeSafeEntryAt: true;
    entryPriceFromFirstFreshObservationAtOrAfterSafetyCompletion: true;
    neverBackfillRecoveryConfirmationPriceIfSafetyCompletedLater: true;
  };
};

export function canonicalRecoveryV0Signal(): CanonicalRecoveryV0Signal {
  return {
    signalVersion: RECOVERY_V0_SIGNAL_VERSION,
    signalName: RECOVERY_V0_SIGNAL_NAME,
    unproven: true,
    inSampleDiscovered: true,
    notProfitableClaim: true,
    forwardEvidenceOnlyAfterFingerprintFreeze: true,
    historicalSampleCadence: 'sparse_approximately_5_minute_observations',
    forwardObservationCadenceMs: RW0_WATCH_CADENCE_MS,
    historicalPercentagesAreNotProofOfNewExecutionRegime: true,
    dipObservation: {
      priceChange5mPct: {
        minInclusive: RECOVERY_V0_MIN_PRICE_CHANGE_5M_PCT,
        maxInclusive: RECOVERY_V0_MAX_PRICE_CHANGE_5M_PCT,
        missing: 'fail_closed',
      },
      volume5mUsd: {
        minInclusive: RECOVERY_V0_MIN_DIP_VOLUME_5M_USD,
        missing: 'fail_closed',
      },
      observedPriceUsd: {
        mustBeKnown: true,
        mustBeFinite: true,
        mustBePositive: true,
        missing: 'fail_closed',
      },
      liquidityUsdNotADipGate: true,
      volumeToLiquidity5mNotADipGate: true,
    },
    recoveryConfirmation: {
      strictlyLater: true,
      exactSamePair: true,
      noFutureInformation: true,
      requiresWatchStartedAt: true,
      mustOccurWithinFrozenWatchWindow: true,
      watchExpiresAt: 'watchStartedAt + RW0_WATCH_TTL_MS',
      legalOnlyWhenRecoveryConfirmedAtStrictlyBeforeWatchExpiresAt: true,
      exactWatchExpiryBoundaryBelongsToExpired: true,
      observedPriceUsd: {
        mustBeKnown: true,
        mustBeFinite: true,
        mustBePositive: true,
        strictlyGreaterThanDipPrice: true,
      },
      liquidityUsd: {
        minInclusive: RECOVERY_V0_MIN_CONFIRMATION_LIQUIDITY_USD,
        mustBeKnown: true,
        missing: 'fail_closed',
      },
      volume5mUsd: {
        mustBeKnown: true,
        missing: 'fail_closed',
      },
      volumeToLiquidity5m: {
        computedFromRawVolumeAndLiquidity: true,
        callerSuppliedRatioMustAgreeOrFailClosed: true,
        minInclusive: RECOVERY_V0_MIN_VOLUME_TO_LIQUIDITY_5M,
        maxExclusive: RECOVERY_V0_MAX_VOLUME_TO_LIQUIDITY_5M_EXCLUSIVE,
        missing: 'fail_closed',
      },
    },
  };
}

export function canonicalRw0ShadowPaper(): CanonicalRw0ShadowPaper {
  return {
    specVersion: RW0_SHADOW_PAPER_SPEC_VERSION,
    specName: RW0_SHADOW_PAPER_SPEC_NAME,
    track: 'shadow',
    safetyIncomplete: true,
    completenessGate: 'FAIL',
    liveReadiness: false,
    neverCountsAsPaperEligible: true,
    neverCountsAsPaperOpen: true,
    onlySimulationPathInRw0V1: true,
    cannotClosedInRw0V1: true,
    entry: {
      source: 'recovery_confirmation_observation',
      allowedBecauseTrackIsExplicitlyUnsafe: true,
      costModel: RW0_COST_MODEL,
      executionModel: RW0_EXECUTION_MODEL,
    },
  };
}

export function canonicalRw0Exit(): CanonicalRw0Exit {
  return {
    specVersion: RW0_EXIT_SPEC_VERSION,
    specName: RW0_EXIT_SPEC_NAME,
    exitExecutionImplementedInRw0V1: false,
    closedFromShadowReachableInRw0V1: false,
    unimplementedUntilDedicatedShadowExitSlice: true,
    intendedComparatorWhenImplemented: {
      stopLossBps: RW0_EXIT_STOP_LOSS_BPS,
      takeProfitBps: RW0_EXIT_TAKE_PROFIT_BPS,
      maxHoldingMs: RW0_EXIT_MAX_HOLDING_MS,
      thresholdsAreX11ComparatorsNotOptima: true,
      fill: 'observed_snapshot_price',
      noInventedExactFill: true,
      recordOvershootAndGap: true,
      maeMfe: 'observed_only',
      missingPrice: 'CENSORED_UNAVAILABLE_not_win_or_loss',
      closedRequiresObservedExitEvidence: true,
      closedRequiresPersistedMarketObservationIdentity: true,
      observedAtAndObservationCollectedAtAreTheSameInstant: true,
      censoredUnavailableIsNotWinOrLoss: true,
      maxHoldingExitsAsClosedNotExpired: true,
      closeReasons: SHADOW_CLOSE_REASONS,
    },
  };
}

export function canonicalRecoveryWatcherDefinition(): CanonicalRecoveryWatcherDefinition {
  return {
    specVersion: RW0_SPEC_VERSION,
    specName: RW0_SPEC_NAME,
    paperDataResearchOnly: true,
    automaticLiveTrading: false,
    noSigner: true,
    noWallet: true,
    noSendTransaction: true,
    noBroadcast: true,
    noProductionSupervisor: true,
    noProductionSchemaMigration: true,
    productionSchemaMustRemain9: true,
    migration010: 'ABSENT',
    recoverySchemaVersion: RW0_SCHEMA_VERSION,
    recoveryMigrationName: RW0_MIGRATION_NAME,
    recoveryMigrationSqlDigest: recoveryMigrationSqlDigest(RW0_SCHEMA_VERSION),
    isolatedDatabase: true,
    neverUseProductionDatabasePath: true,
    rejectConfiguredProductionDatabasePath: true,
    discoveryCoverage: 'incomplete_dexscreener_latest_profile_boost_only',
    discoveryCoverageComplete: false,
    holderGate: 'persisted_fail_closed',
    bundleGate: 'persisted_fail_closed',
    creatorGate: 'persisted_fail_closed',
    largestRealHolderPctImplemented: true,
    linkedBundlePctImplemented: true,
    holderPercentageSemanticsUnresolved: false,
    bundlePercentageSemanticsUnresolved: false,
    incompleteOwnerCoverageIsUnknown: true,
    unexplainedTop20RemainderDoesNotProveHiddenSingleAccountOverTenPercent: true,
    heuristicClusterIsNotOwnership: true,
    shadowAndPaperAreDistinctTracks: true,
    safePaperReachableInRw0V1: false,
    completenessGatePassUnreachableInRw0V1: true,
    operational: {
      watchCadenceMs: RW0_WATCH_CADENCE_MS,
      watchTtlMs: RW0_WATCH_TTL_MS,
      cooldownMs: RW0_COOLDOWN_MS,
      maxConcurrentWatches: RW0_MAX_CONCURRENT_WATCHES,
      watchSlotStates: [...RW0_WATCH_SLOT_STATES],
      maxEpisodesPerMintPer24h: RW0_MAX_EPISODES_PER_MINT_PER_24H,
      episodeWindowMs: RW0_EPISODE_WINDOW_MS,
      confirmationMustBindPersistedMarketObservation: true,
      confirmationEconomicsDerivedFromStoredObservation: true,
      confirmationLegalOnlyWhenRecoveryConfirmedAtStrictlyBeforeWatchExpiresAt: true,
      exactWatchExpiryBoundaryBelongsToExpired: true,
      closedFromShadowReachableInRw0V1: false,
      exitExecutionImplementedInRw0V1: false,
      safetyEvidenceReducerImplemented: true,
      runtimeFileDatabaseRejectsMemoryPath: true,
      networkedForwardObservationImplemented: true,
      screeningIndependentOfEpisodes: true,
      notDipDoesNotCreateEpisode: true,
      notDipDoesNotStartCooldown: true,
      incompleteDoesNotCreateEpisode: true,
      slice2DoesNotOpenShadowResearch: true,
      slice2DoesNotOpenPaper: true,
      slice2DoesNotClose: true,
      confirmationDrainsToRejectedSafetyUnknown: true,
      scheduling: RW0_SCHEDULING_POLICY,
      noCatchUpStorm: true,
      noOverlappingCycles: true,
      noMathRandomJitter: true,
      watchWorkHasPriorityOverScreening: true,
      networkTimeoutMs: RW0_NETWORK_TIMEOUT_MS,
      screeningMaxCandidates: RW0_SCREENING_MAX_CANDIDATES,
      discoveryCallsPerScreeningCycle: RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE,
      noProviderRetryStorm: true,
      collectedAtIsLocalCollectionTime: true,
      noTrustworthyDexScreenerQuoteTimestamp: true,
      pairSelectionAllowedForScreeningOnly: true,
      pinnedPairNeverSwitches: true,
      screeningDispositions: [...RW0_SCREENING_DISPOSITIONS],
      dipFilterResults: [...RW0_DIP_FILTER_RESULTS],
      watchFetchConcurrency: RW0_WATCH_FETCH_CONCURRENCY,
      screeningFetchConcurrency: RW0_SCREENING_FETCH_CONCURRENCY,
      screeningWallBudgetMs: RW0_SCREENING_WALL_BUDGET_MS,
      unknownProviderErrorsAreFatal: true,
      singletonLockBeforeSchemaInit: true,
      reportOpensReadOnly: true,
      screeningIdentityMustMatchFrozenRw0: true,
      admissionRecomputesDipFilterInsideTransaction: true,
      priorPublicSmokeIsDisposableEngineeringOnly: true,
      priorPublicSmokeExcludedFromForwardValidation: true,
    },
    signal: canonicalRecoveryV0Signal(),
    safety: {
      specVersion: RW0_SAFETY_SPEC_VERSION,
      specFingerprint: RW0_SAFETY_SPEC_FINGERPRINT,
      definition: canonicalRecoverySafetySpec(),
    },
    shadowPaper: canonicalRw0ShadowPaper(),
    exit: canonicalRw0Exit(),
    safePaperEntry: {
      unimplementedInRw0V1: true,
      requiresNewWatcherSpecVersionAndFingerprint: true,
      recoveryConfirmationFirst: true,
      thenCollectSafetyEvidence: true,
      allRequiredSafetyObservedAtAtOrBeforeSafeEntryAt: true,
      entryPriceFromFirstFreshObservationAtOrAfterSafetyCompletion: true,
      neverBackfillRecoveryConfirmationPriceIfSafetyCompletedLater: true,
    },
  };
}

export function mutateCanonicalRecoveryV0Signal(
  mutate: (definition: CanonicalRecoveryV0Signal) => void,
): CanonicalRecoveryV0Signal {
  const definition = structuredClone(canonicalRecoveryV0Signal());
  mutate(definition);
  return definition;
}

export function mutateCanonicalRw0ShadowPaper(
  mutate: (definition: CanonicalRw0ShadowPaper) => void,
): CanonicalRw0ShadowPaper {
  const definition = structuredClone(canonicalRw0ShadowPaper());
  mutate(definition);
  return definition;
}

export function mutateCanonicalRw0Exit(
  mutate: (definition: CanonicalRw0Exit) => void,
): CanonicalRw0Exit {
  const definition = structuredClone(canonicalRw0Exit());
  mutate(definition);
  return definition;
}

export function mutateCanonicalRecoveryWatcherDefinition(
  mutate: (definition: CanonicalRecoveryWatcherDefinition) => void,
): CanonicalRecoveryWatcherDefinition {
  const definition = structuredClone(canonicalRecoveryWatcherDefinition());
  mutate(definition);
  return definition;
}
