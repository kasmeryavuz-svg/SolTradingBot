import {
  ANALYZED_WALLET_CAP,
  BASIS_POINTS_PER_UNIT,
  FIRST_OBSERVED_ACTIVITY_LIMIT,
  GET_MULTIPLE_ACCOUNTS_CHUNK,
  HELIUS_MAINNET_RPC_HOST,
  HELIUS_RPC_METHOD_GET_TRANSACTIONS_FOR_ADDRESS,
  HELIUS_TOKEN_ACCOUNTS_METADATA_FROM_SLOT,
  HISTORY_CENSOR_PROBE_LIMIT,
  HISTORY_CONCURRENCY,
  HISTORY_FULL_PAGE_LIMIT,
  HISTORY_MAX_INSPECTED,
  HISTORY_MAX_RECENT_PAGES,
  HISTORY_TX_CAP,
  HISTORY_WINDOW_MS,
  OBSERVED_AGE_CLASSES,
  OBSERVED_FRESH_MS,
  OBSERVED_YOUNG_MS,
  OWNER_KINDS,
  PROVIDER_MAX_ATTEMPTS,
  PROVIDER_RETRY_POLICY,
  PROVIDER_TIMEOUT_MS,
  REQUIRED_SCHEMA_VERSION,
  SOLANA_MAINNET_GENESIS_HASH,
  SPL_TOKEN_PROGRAM_ID,
  SYSTEM_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_DELTA_KINDS,
  TOP_TOKEN_ACCOUNT_LIMIT,
  WALLET_INTELLIGENCE_CHECKPOINT,
  WALLET_INTELLIGENCE_MIGRATION_NAME,
  WALLET_INTELLIGENCE_MIGRATION_VERSION,
  WALLET_INTELLIGENCE_SPEC_NAME,
  WALLET_INTELLIGENCE_SPEC_VERSION,
} from './constants.js';

export type CanonicalWalletIntelligenceDefinition = {
  walletIntelligenceSpecVersion: string;
  walletIntelligenceSpecName: string;
  checkpoint: string;
  researchEvidenceOnly: true;
  noSigning: true;
  noTransactionConstruction: true;
  noSend: true;
  noLiveStrategyConnection: true;
  noTradeRecommendation: true;
  noAutoBuy: true;
  noCopyTrade: true;
  noCompositeScore: true;
  noPnl: true;
  noIdentityAttribution: true;
  noFundingCluster: true;
  noMachineLearning: true;
  naming: {
    checkpoint15WalletSecurity: 'operator_controlled_signing_wallet';
    checkpoint18WalletIntelligence: 'public_onchain_address_evidence';
    publicAddressIsNotASecret: true;
    neverAccessOperatorPrivateKey: true;
    neverAccessW15Signer: true;
  };
  language: {
    tokenAccountsAreNotWallets: true;
    top20ObservedTokenAccounts: true;
    neverTop20WalletsAtHolderStage: true;
    walletCandidateNotGuaranteedHuman: true;
    observedAgeNotWalletCreation: true;
    firstObservedActivityNotWalletCreatedAt: true;
    firstObservedActivityNotGuaranteedFirstChainTransaction: true;
    bidirectionalNotGuaranteedSwap: true;
    positiveDeltaNotBuy: true;
    negativeDeltaNotSell: true;
    neverWhaleProfessionalInsiderOrSmartMoneyScore: true;
    rankingObservedAtHolderContextSlot: true;
    ownerResolutionObservedAtHolderResolutionContextSlot: true;
    ownerClassificationObservedAtOwnerClassificationContextSlot: true;
    notMathematicallyAtomicHistoricalRpcSnapshot: true;
  };
  network: {
    productionCommandsMainnetOnly: true;
    expectedMainnetGenesisHash: string;
    failClosedOnWrongNetwork: true;
    noSilentDevnetOrTestnetAnalysis: true;
  };
  provider: {
    interface: 'WalletIntelligenceProvider';
    productionImplementation: 'HeliusWalletIntelligenceProvider';
    rawFetchOnly: true;
    noHeliusSdk: true;
    noEnhancedTransactionsApi: true;
    noWalletApi: true;
    noWalletIdentityApi: true;
    noFundedByEndpoint: true;
    historyMethod: string;
    tokenAccountsFilter: 'balanceChanged';
    historyTransactionDetails: 'full';
    historyEncoding: 'jsonParsed';
    maxSupportedTransactionVersion: 0;
    historySortOrder: 'desc';
    historyStatus: 'succeeded';
    firstObservedTransactionDetails: 'signatures';
    firstObservedSortOrder: 'asc';
    firstObservedLimit: number;
    firstObservedHasNoThirtyDayLowerBound: true;
    firstObservedStillFencedByHolderContextSlot: true;
    timeoutMs: number;
    maxAttempts: number;
    retryPolicy: typeof PROVIDER_RETRY_POLICY;
    retryOnlyTransient4295xxTimeoutNetwork: true;
    baseHost: string;
    apiKeyFromEnvNotUrl: true;
    neverPersistApiKeyOrAuthenticatedUrl: true;
    heliusFullTransactionDetailsMaxLimitPerRequest: number;
    neverRequestFullLimitAbove100: true;
  };
  tokenPrograms: {
    splToken: string;
    token2022: string;
    rejectNonMintAccounts: true;
    rejectMalformedInputRewrite: true;
    canonicalBase58Pubkey: true;
    tokenAccountProgramOwnerMustMatchMintProgram: true;
  };
  limits: {
    noEnvironmentOverride: true;
    topTokenAccountLimit: number;
    analyzedWalletCap: number;
    historyWindowMs: number;
    historyTxCap: number;
    historyFullPageLimit: number;
    historyCensorProbeLimit: number;
    historyMaxInspected: number;
    historyMaxRecentPages: number;
    historyConcurrency: number;
    getMultipleAccountsChunk: number;
    worstCaseRecentHistoryAttemptsPerWallet: number;
    worstCaseFirstObservedAttemptsPerWallet: number;
    worstCaseHistoryRpcAttemptsPerAnalyzedWallet: number;
  };
  scanAnchor: {
    oneScanStartedAtMs: true;
    oneHolderContextSlotFromGetTokenLargestAccounts: true;
    historyMustFenceNewerThanHolderSnapshot: true;
    rejectSlotGreaterThanHolderContextSlot: true;
    neverSilentlyAcceptFutureHistory: true;
    blockTimeLteScanStartedAt: true;
    slotLteHolderContextSlot: true;
  };
  holderResolution: {
    method: 'getTokenLargestAccounts';
    commitment: 'finalized';
    resultsAreTokenAccounts: true;
    rankIsReturnedArrayPositionPlusOne: true;
    failIfRawAmountsAreNotDescending: true;
    doNotResortByUiAmount: true;
    trustOfficialRpcOrderAfterDescendingValidation: true;
    resolveTopTokenAccountsInOneGetMultipleAccounts: true;
    resolutionEncoding: 'jsonParsed';
    resolutionCommitment: 'finalized';
    resolutionMinContextSlotIsHolderContextSlot: true;
    captureHolderResolutionContextSlot: true;
    holderResolutionContextSlotMustBeGteHolderContextSlot: true;
    parsedTypeMustBeTokenAccount: true;
    parsedMintMustEqualRequestedMint: true;
    parsedRawAmountMustEqualLargestObservation: true;
    parsedDecimalsMustEqualLargestObservation: true;
    amountsAreRawIntegerStringsToBigInt: true;
    neverUseUiAmountForArithmetic: true;
    uiAmountDisagreementDoesNotDriveArithmetic: true;
    duplicateTokenAccountRejected: true;
    duplicateRankRejected: true;
    missingRankRejected: true;
    moreThanTwentyRowsRejected: true;
    malformedOrNegativeAmountRejected: true;
    zeroBalanceRowsRemainObservations: true;
    zeroBalanceOwnersAreNotAnalyzedHistoryTargets: true;
    notMathematicallyAtomicWithOwnerResolution: true;
  };
  ownerAggregation: {
    aggregateInsideObservedTop20Only: true;
    sameOwnerNotCountedTwice: true;
    observedTop20AggregateRawAmount: true;
    notNecessarilyCompleteOwnerBalance: true;
    shareName: 'observed_top20_balance_share_bps';
    shareIsNotSupplyShare: true;
    zeroObservedTotalShareIsZero: true;
    basisPointsPerUnit: number;
    integerBasisPointArithmetic: true;
    shareRounding: 'bigint_floor';
    ownerBpsSumNeedNotEqual10000: true;
    noHistoryPerformanceInShareNumerator: true;
  };
  ownerClassification: {
    systemProgramId: string;
    kinds: readonly [
      'SYSTEM_OWNED_NON_EXECUTABLE',
      'PROGRAM_OWNED_OR_EXECUTABLE',
      'ACCOUNT_MISSING',
      'UNKNOWN',
    ];
    systemOwnedNonExecutableIsWalletCandidate: true;
    notGuaranteedHuman: true;
    neverEoaOrProfitableWalletLabel: true;
    programOwnedMayIncludeVaultsPdasProgramAccounts: true;
    doNotGuessSpecificProgramRoleUnlessProvable: true;
    missingOwnerAccountIsAccountMissing: true;
    executableIsNotNormalWalletCandidate: true;
    uniqueOwnersResolvedInOneGetMultipleAccounts: true;
    classificationMinContextSlotIsHolderResolutionContextSlot: true;
    captureOwnerClassificationContextSlot: true;
    ownerClassificationContextSlotMustBeGteHolderResolutionContextSlot: true;
    laterFinalizedObservationNotHistoricalClassificationAtHolderContextSlot: true;
  };
  analyzedCohort: {
    eligibleOwnerKind: 'SYSTEM_OWNED_NON_EXECUTABLE';
    requirePositiveObservedTop20Aggregate: true;
    maxWallets: number;
    sort: readonly [
      'observedTop20AggregateRawAmount_desc',
      'bestTop20Rank_asc',
      'walletAddress_codepoint_asc',
    ];
    frozenOrdering: true;
    noSelectionByHistoricalPerformance: true;
    noSelectionByFutureInformation: true;
  };
  observedAge: {
    categories: readonly [
      'OBSERVED_FRESH_7D',
      'OBSERVED_YOUNG_30D',
      'OBSERVED_ESTABLISHED_30D_PLUS',
      'UNKNOWN',
    ];
    freshMs: number;
    youngMs: number;
    observedWordMandatory: true;
    missingBlockTimeIsUnknown: true;
    exactBoundaryInclusiveFreshAndYoung: true;
    firstObservedMayBeLaterThanTrueFirstActivity: true;
    tokenAccountsFilterMetadataFromSlot: number;
  };
  history: {
    windowMs: number;
    cap: number;
    fullPageLimit: number;
    censorProbeLimit: number;
    maxInspected: number;
    maxRecentPages: number;
    page1Limit100: true;
    page2OnlyIfPage1HasTokenAndRetainedBelowCap: true;
    page3ProbeLimit1OnlyIfPage2HasTokenAnd200Inspected: true;
    neverRequestFullLimitAbove100: true;
    noPaginationBeyond201stLogicalObservation: true;
    filterInvarianceAcrossPages: true;
    paginationTokenNotInvented: true;
    repeatedPaginationTokenFails: true;
    malformedPaginationTokenFails: true;
    paginationTokenNotFingerprintInput: true;
    duplicateIdenticalEvidenceDeduped: true;
    duplicateConflictingEvidenceFailsClosed: true;
    canonicalTxIdentity: 'signature';
    sortIdentity: readonly ['slot_desc', 'transactionIndex_desc', 'signature_codepoint_asc'];
    doNotTrustResponseArrayOrderAlone: true;
    failedTxCannotEnterSucceededHistory: true;
    localFenceEvenWhenServerFiltersSent: true;
    nullBlockTimeExcludedFrom30dBehavioralMetrics: true;
    nullBlockTimeCountsAsIncompleteEvidence: true;
    firstObservedNullBlockTimeKeepsSlotAgeUnknown: true;
    censoredCountsAreLowerBounds: true;
    neverSayExactlyCapTransactionsWhenCensored: true;
    historyTransactionsObservedAreRetainedUniqueValidObservations: true;
    partialWalletFailureFailsEntireScanAndPersistsNothing: true;
    paginationRequestsForOneWalletAreSequential: true;
    maxConcurrentHistoryPipelines: number;
  };
  tokenDeltas: {
    source: 'meta.preTokenBalances_and_postTokenBalances';
    aggregateWalletOwnedAccountsByMint: true;
    bigintRawArithmetic: true;
    missingBalanceArrayIsIncomplete: true;
    missingCounterpartPolicy: 'mark_entire_transaction_incomplete_no_zero_inference';
    completePairsOnly: true;
    identityRequiresAccountIndexMintOwnerProgramIdDecimals: true;
    unpairedPreOrPostIsIncomplete: true;
    doNotSynthesizeZeroBalance: true;
    doNotInferCreate: true;
    doNotInferClose: true;
    emptyPreWithWalletPostIsIncomplete: true;
    emptyPostWithWalletPreIsIncomplete: true;
    bothEmptyArraysDoNotFabricateActivity: true;
    incompleteTransactionAffectsDirectionalMetrics: false;
    incompleteTransactionAffectsUniqueMintMetrics: false;
    incompleteTransactionAffectsTargetMintNet: false;
    incompleteTransactionAffectsActiveDays: false;
    incompleteTransactionStillCountsAsObservedHistory: true;
    neverSilentCoerceMalformedProviderData: true;
    ownerMappedFromTokenBalanceOwnerNotAccountKeys: true;
    kinds: readonly [
      'positive_token_delta',
      'negative_token_delta',
      'bidirectional_token_change',
      'no_net_token_delta',
      'incomplete_token_delta',
    ];
    bidirectionalMeansDifferentMintsOppositeSigns: true;
    sameMintOppositeLegsNettingToZeroIsNotBidirectional: true;
    notASwapLabel: true;
    uniqueMintRequiresNonZeroNetDelta: true;
    duplicateSignatureDoesNotDoubleCount: true;
  };
  persistence: {
    schemaVersion: number;
    migrationName: string;
    migrationVersion: number;
    atomicScanInsert: true;
    immutableAfterInsert: true;
    uniqueScanFingerprint: true;
    noRawTransactionPersistence: true;
    noProviderJsonPersistence: true;
    noApiKeyPersistence: true;
    historyEvidenceDigestOnly: true;
    rawAmountsStoredAsText: true;
    targetMintNetRawDeltaStoredAsSignedDecimalText: true;
    persistAfterNetworkCompletesWithZeroNetwork: true;
    networkFailurePersistsZeroRows: true;
    dbFailureRollsBackAll: true;
    persistBothHolderAndResolutionAndClassificationSlots: true;
  };
  fingerprints: {
    bindSemanticEvidenceOnly: true;
    neverBindApiKey: true;
    neverBindProviderUrl: true;
    neverBindMachinePath: true;
    neverBindDbPath: true;
    neverBindPaginationToken: true;
    lowercaseHexSha256: true;
  };
  commands: {
    explicitOnly: true;
    noDiscoveryCollectorStrategyPaperLiveAutoRun: true;
    noDevHiddenHeliusCost: true;
    noCopyTradeBuySendFollowFrontRun: true;
  };
};

export type CanonicalWalletIntelligenceDefinitionOverrides = Partial<CanonicalWalletIntelligenceDefinition>;

export function canonicalWalletIntelligenceDefinition(
  overrides: CanonicalWalletIntelligenceDefinitionOverrides = {},
): CanonicalWalletIntelligenceDefinition {
  return {
    walletIntelligenceSpecVersion: overrides.walletIntelligenceSpecVersion ?? WALLET_INTELLIGENCE_SPEC_VERSION,
    walletIntelligenceSpecName: overrides.walletIntelligenceSpecName ?? WALLET_INTELLIGENCE_SPEC_NAME,
    checkpoint: overrides.checkpoint ?? WALLET_INTELLIGENCE_CHECKPOINT,
    researchEvidenceOnly: true,
    noSigning: true,
    noTransactionConstruction: true,
    noSend: true,
    noLiveStrategyConnection: true,
    noTradeRecommendation: true,
    noAutoBuy: true,
    noCopyTrade: true,
    noCompositeScore: true,
    noPnl: true,
    noIdentityAttribution: true,
    noFundingCluster: true,
    noMachineLearning: true,
    naming: {
      checkpoint15WalletSecurity: 'operator_controlled_signing_wallet',
      checkpoint18WalletIntelligence: 'public_onchain_address_evidence',
      publicAddressIsNotASecret: true,
      neverAccessOperatorPrivateKey: true,
      neverAccessW15Signer: true,
      ...overrides.naming,
    },
    language: {
      tokenAccountsAreNotWallets: true,
      top20ObservedTokenAccounts: true,
      neverTop20WalletsAtHolderStage: true,
      walletCandidateNotGuaranteedHuman: true,
      observedAgeNotWalletCreation: true,
      firstObservedActivityNotWalletCreatedAt: true,
      firstObservedActivityNotGuaranteedFirstChainTransaction: true,
      bidirectionalNotGuaranteedSwap: true,
      positiveDeltaNotBuy: true,
      negativeDeltaNotSell: true,
      neverWhaleProfessionalInsiderOrSmartMoneyScore: true,
      rankingObservedAtHolderContextSlot: true,
      ownerResolutionObservedAtHolderResolutionContextSlot: true,
      ownerClassificationObservedAtOwnerClassificationContextSlot: true,
      notMathematicallyAtomicHistoricalRpcSnapshot: true,
      ...overrides.language,
    },
    network: {
      productionCommandsMainnetOnly: true,
      expectedMainnetGenesisHash: overrides.network?.expectedMainnetGenesisHash ?? SOLANA_MAINNET_GENESIS_HASH,
      failClosedOnWrongNetwork: true,
      noSilentDevnetOrTestnetAnalysis: true,
      ...overrides.network,
    },
    provider: {
      interface: 'WalletIntelligenceProvider',
      productionImplementation: 'HeliusWalletIntelligenceProvider',
      rawFetchOnly: true,
      noHeliusSdk: true,
      noEnhancedTransactionsApi: true,
      noWalletApi: true,
      noWalletIdentityApi: true,
      noFundedByEndpoint: true,
      historyMethod: HELIUS_RPC_METHOD_GET_TRANSACTIONS_FOR_ADDRESS,
      tokenAccountsFilter: 'balanceChanged',
      historyTransactionDetails: 'full',
      historyEncoding: 'jsonParsed',
      maxSupportedTransactionVersion: 0,
      historySortOrder: 'desc',
      historyStatus: 'succeeded',
      firstObservedTransactionDetails: 'signatures',
      firstObservedSortOrder: 'asc',
      firstObservedLimit: FIRST_OBSERVED_ACTIVITY_LIMIT,
      firstObservedHasNoThirtyDayLowerBound: true,
      firstObservedStillFencedByHolderContextSlot: true,
      timeoutMs: PROVIDER_TIMEOUT_MS,
      maxAttempts: PROVIDER_MAX_ATTEMPTS,
      retryPolicy: PROVIDER_RETRY_POLICY,
      retryOnlyTransient4295xxTimeoutNetwork: true,
      baseHost: HELIUS_MAINNET_RPC_HOST,
      apiKeyFromEnvNotUrl: true,
      neverPersistApiKeyOrAuthenticatedUrl: true,
      heliusFullTransactionDetailsMaxLimitPerRequest: HISTORY_FULL_PAGE_LIMIT,
      neverRequestFullLimitAbove100: true,
      ...overrides.provider,
    },
    tokenPrograms: {
      splToken: SPL_TOKEN_PROGRAM_ID,
      token2022: TOKEN_2022_PROGRAM_ID,
      rejectNonMintAccounts: true,
      rejectMalformedInputRewrite: true,
      canonicalBase58Pubkey: true,
      tokenAccountProgramOwnerMustMatchMintProgram: true,
      ...overrides.tokenPrograms,
    },
    limits: {
      noEnvironmentOverride: true,
      topTokenAccountLimit: TOP_TOKEN_ACCOUNT_LIMIT,
      analyzedWalletCap: ANALYZED_WALLET_CAP,
      historyWindowMs: HISTORY_WINDOW_MS,
      historyTxCap: HISTORY_TX_CAP,
      historyFullPageLimit: HISTORY_FULL_PAGE_LIMIT,
      historyCensorProbeLimit: HISTORY_CENSOR_PROBE_LIMIT,
      historyMaxInspected: HISTORY_MAX_INSPECTED,
      historyMaxRecentPages: HISTORY_MAX_RECENT_PAGES,
      historyConcurrency: HISTORY_CONCURRENCY,
      getMultipleAccountsChunk: GET_MULTIPLE_ACCOUNTS_CHUNK,
      worstCaseRecentHistoryAttemptsPerWallet: HISTORY_MAX_RECENT_PAGES * PROVIDER_MAX_ATTEMPTS,
      worstCaseFirstObservedAttemptsPerWallet: PROVIDER_MAX_ATTEMPTS,
      worstCaseHistoryRpcAttemptsPerAnalyzedWallet:
        HISTORY_MAX_RECENT_PAGES * PROVIDER_MAX_ATTEMPTS + PROVIDER_MAX_ATTEMPTS,
      ...overrides.limits,
    },
    scanAnchor: {
      oneScanStartedAtMs: true,
      oneHolderContextSlotFromGetTokenLargestAccounts: true,
      historyMustFenceNewerThanHolderSnapshot: true,
      rejectSlotGreaterThanHolderContextSlot: true,
      neverSilentlyAcceptFutureHistory: true,
      blockTimeLteScanStartedAt: true,
      slotLteHolderContextSlot: true,
      ...overrides.scanAnchor,
    },
    holderResolution: {
      method: 'getTokenLargestAccounts',
      commitment: 'finalized',
      resultsAreTokenAccounts: true,
      rankIsReturnedArrayPositionPlusOne: true,
      failIfRawAmountsAreNotDescending: true,
      doNotResortByUiAmount: true,
      trustOfficialRpcOrderAfterDescendingValidation: true,
      resolveTopTokenAccountsInOneGetMultipleAccounts: true,
      resolutionEncoding: 'jsonParsed',
      resolutionCommitment: 'finalized',
      resolutionMinContextSlotIsHolderContextSlot: true,
      captureHolderResolutionContextSlot: true,
      holderResolutionContextSlotMustBeGteHolderContextSlot: true,
      parsedTypeMustBeTokenAccount: true,
      parsedMintMustEqualRequestedMint: true,
      parsedRawAmountMustEqualLargestObservation: true,
      parsedDecimalsMustEqualLargestObservation: true,
      amountsAreRawIntegerStringsToBigInt: true,
      neverUseUiAmountForArithmetic: true,
      uiAmountDisagreementDoesNotDriveArithmetic: true,
      duplicateTokenAccountRejected: true,
      duplicateRankRejected: true,
      missingRankRejected: true,
      moreThanTwentyRowsRejected: true,
      malformedOrNegativeAmountRejected: true,
      zeroBalanceRowsRemainObservations: true,
      zeroBalanceOwnersAreNotAnalyzedHistoryTargets: true,
      notMathematicallyAtomicWithOwnerResolution: true,
      ...overrides.holderResolution,
    },
    ownerAggregation: {
      aggregateInsideObservedTop20Only: true,
      sameOwnerNotCountedTwice: true,
      observedTop20AggregateRawAmount: true,
      notNecessarilyCompleteOwnerBalance: true,
      shareName: 'observed_top20_balance_share_bps',
      shareIsNotSupplyShare: true,
      zeroObservedTotalShareIsZero: true,
      basisPointsPerUnit: BASIS_POINTS_PER_UNIT,
      integerBasisPointArithmetic: true,
      shareRounding: 'bigint_floor',
      ownerBpsSumNeedNotEqual10000: true,
      noHistoryPerformanceInShareNumerator: true,
      ...overrides.ownerAggregation,
    },
    ownerClassification: {
      systemProgramId: SYSTEM_PROGRAM_ID,
      kinds: OWNER_KINDS,
      systemOwnedNonExecutableIsWalletCandidate: true,
      notGuaranteedHuman: true,
      neverEoaOrProfitableWalletLabel: true,
      programOwnedMayIncludeVaultsPdasProgramAccounts: true,
      doNotGuessSpecificProgramRoleUnlessProvable: true,
      missingOwnerAccountIsAccountMissing: true,
      executableIsNotNormalWalletCandidate: true,
      uniqueOwnersResolvedInOneGetMultipleAccounts: true,
      classificationMinContextSlotIsHolderResolutionContextSlot: true,
      captureOwnerClassificationContextSlot: true,
      ownerClassificationContextSlotMustBeGteHolderResolutionContextSlot: true,
      laterFinalizedObservationNotHistoricalClassificationAtHolderContextSlot: true,
      ...overrides.ownerClassification,
    },
    analyzedCohort: {
      eligibleOwnerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
      requirePositiveObservedTop20Aggregate: true,
      maxWallets: ANALYZED_WALLET_CAP,
      sort: [
        'observedTop20AggregateRawAmount_desc',
        'bestTop20Rank_asc',
        'walletAddress_codepoint_asc',
      ],
      frozenOrdering: true,
      noSelectionByHistoricalPerformance: true,
      noSelectionByFutureInformation: true,
      ...overrides.analyzedCohort,
    },
    observedAge: {
      categories: OBSERVED_AGE_CLASSES,
      freshMs: OBSERVED_FRESH_MS,
      youngMs: OBSERVED_YOUNG_MS,
      observedWordMandatory: true,
      missingBlockTimeIsUnknown: true,
      exactBoundaryInclusiveFreshAndYoung: true,
      firstObservedMayBeLaterThanTrueFirstActivity: true,
      tokenAccountsFilterMetadataFromSlot: HELIUS_TOKEN_ACCOUNTS_METADATA_FROM_SLOT,
      ...overrides.observedAge,
    },
    history: {
      windowMs: HISTORY_WINDOW_MS,
      cap: HISTORY_TX_CAP,
      fullPageLimit: HISTORY_FULL_PAGE_LIMIT,
      censorProbeLimit: HISTORY_CENSOR_PROBE_LIMIT,
      maxInspected: HISTORY_MAX_INSPECTED,
      maxRecentPages: HISTORY_MAX_RECENT_PAGES,
      page1Limit100: true,
      page2OnlyIfPage1HasTokenAndRetainedBelowCap: true,
      page3ProbeLimit1OnlyIfPage2HasTokenAnd200Inspected: true,
      neverRequestFullLimitAbove100: true,
      noPaginationBeyond201stLogicalObservation: true,
      filterInvarianceAcrossPages: true,
      paginationTokenNotInvented: true,
      repeatedPaginationTokenFails: true,
      malformedPaginationTokenFails: true,
      paginationTokenNotFingerprintInput: true,
      duplicateIdenticalEvidenceDeduped: true,
      duplicateConflictingEvidenceFailsClosed: true,
      canonicalTxIdentity: 'signature',
      sortIdentity: ['slot_desc', 'transactionIndex_desc', 'signature_codepoint_asc'],
      doNotTrustResponseArrayOrderAlone: true,
      failedTxCannotEnterSucceededHistory: true,
      localFenceEvenWhenServerFiltersSent: true,
      nullBlockTimeExcludedFrom30dBehavioralMetrics: true,
      nullBlockTimeCountsAsIncompleteEvidence: true,
      firstObservedNullBlockTimeKeepsSlotAgeUnknown: true,
      censoredCountsAreLowerBounds: true,
      neverSayExactlyCapTransactionsWhenCensored: true,
      historyTransactionsObservedAreRetainedUniqueValidObservations: true,
      partialWalletFailureFailsEntireScanAndPersistsNothing: true,
      paginationRequestsForOneWalletAreSequential: true,
      maxConcurrentHistoryPipelines: HISTORY_CONCURRENCY,
      ...overrides.history,
    },
    tokenDeltas: {
      source: 'meta.preTokenBalances_and_postTokenBalances',
      aggregateWalletOwnedAccountsByMint: true,
      bigintRawArithmetic: true,
      missingBalanceArrayIsIncomplete: true,
      missingCounterpartPolicy: 'mark_entire_transaction_incomplete_no_zero_inference',
      completePairsOnly: true,
      identityRequiresAccountIndexMintOwnerProgramIdDecimals: true,
      unpairedPreOrPostIsIncomplete: true,
      doNotSynthesizeZeroBalance: true,
      doNotInferCreate: true,
      doNotInferClose: true,
      emptyPreWithWalletPostIsIncomplete: true,
      emptyPostWithWalletPreIsIncomplete: true,
      bothEmptyArraysDoNotFabricateActivity: true,
      incompleteTransactionAffectsDirectionalMetrics: false,
      incompleteTransactionAffectsUniqueMintMetrics: false,
      incompleteTransactionAffectsTargetMintNet: false,
      incompleteTransactionAffectsActiveDays: false,
      incompleteTransactionStillCountsAsObservedHistory: true,
      neverSilentCoerceMalformedProviderData: true,
      ownerMappedFromTokenBalanceOwnerNotAccountKeys: true,
      kinds: TOKEN_DELTA_KINDS,
      bidirectionalMeansDifferentMintsOppositeSigns: true,
      sameMintOppositeLegsNettingToZeroIsNotBidirectional: true,
      notASwapLabel: true,
      uniqueMintRequiresNonZeroNetDelta: true,
      duplicateSignatureDoesNotDoubleCount: true,
      ...overrides.tokenDeltas,
    },
    persistence: {
      schemaVersion: REQUIRED_SCHEMA_VERSION,
      migrationName: WALLET_INTELLIGENCE_MIGRATION_NAME,
      migrationVersion: WALLET_INTELLIGENCE_MIGRATION_VERSION,
      atomicScanInsert: true,
      immutableAfterInsert: true,
      uniqueScanFingerprint: true,
      noRawTransactionPersistence: true,
      noProviderJsonPersistence: true,
      noApiKeyPersistence: true,
      historyEvidenceDigestOnly: true,
      rawAmountsStoredAsText: true,
      targetMintNetRawDeltaStoredAsSignedDecimalText: true,
      persistAfterNetworkCompletesWithZeroNetwork: true,
      networkFailurePersistsZeroRows: true,
      dbFailureRollsBackAll: true,
      persistBothHolderAndResolutionAndClassificationSlots: true,
      ...overrides.persistence,
    },
    fingerprints: {
      bindSemanticEvidenceOnly: true,
      neverBindApiKey: true,
      neverBindProviderUrl: true,
      neverBindMachinePath: true,
      neverBindDbPath: true,
      neverBindPaginationToken: true,
      lowercaseHexSha256: true,
      ...overrides.fingerprints,
    },
    commands: {
      explicitOnly: true,
      noDiscoveryCollectorStrategyPaperLiveAutoRun: true,
      noDevHiddenHeliusCost: true,
      noCopyTradeBuySendFollowFrontRun: true,
      ...overrides.commands,
    },
  };
}

export function mutateCanonicalWalletIntelligenceDefinition(
  mutate: (definition: CanonicalWalletIntelligenceDefinition) => void,
): CanonicalWalletIntelligenceDefinition {
  const definition = structuredClone(canonicalWalletIntelligenceDefinition());
  mutate(definition);
  return definition;
}
