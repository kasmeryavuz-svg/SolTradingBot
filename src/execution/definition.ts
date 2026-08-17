import {
  COMPUTE_UNIT_HARD_MAX,
  COMPUTE_UNIT_MARGIN_DENOMINATOR,
  COMPUTE_UNIT_MARGIN_NUMERATOR,
  EXECUTION_BLOCKHASH_SLOTS_TO_EXPIRY,
  EXECUTION_CHECKPOINT,
  EXECUTION_COMPUTE_UNIT_PRICE_PERCENTILE,
  EXECUTION_FOR_JITO_BUNDLE,
  EXECUTION_MAX_ACCOUNTS,
  EXECUTION_PLATFORM_FEE_BPS,
  EXECUTION_ROUTE_PLAN_TOTAL_BPS,
  EXECUTION_SLIPPAGE_BPS,
  EXECUTION_SPEC_NAME,
  EXECUTION_SPEC_VERSION,
  EXECUTION_SWAP_MODE,
  EXECUTION_TIP_AMOUNT_LAMPORTS,
  JUPITER_BUILD_PATH,
  JUPITER_HTTP_METHOD,
  JUPITER_MAX_RESPONSE_BYTES,
  JUPITER_PROVIDER_HOST,
  JUPITER_PROVIDER_PROTOCOL,
  JUPITER_REDIRECT_POLICY,
  JUPITER_SWAP_API_VERSION,
  MAX_PRIORITY_FEE_LAMPORTS,
  SOLANA_MAINNET_GENESIS_HASH,
  SOLANA_PACKET_DATA_SIZE,
} from './constants.js';
import {
  DEFAULT_EXECUTION_PROVIDER_TIMEOUT_MS,
  EXECUTION_PROVIDER_TIMEOUT_MS_MAX,
  EXECUTION_PROVIDER_TIMEOUT_MS_MIN,
} from '../config/defaults.js';

export type CanonicalExecutionDefinition = {
  executionSpecVersion: string;
  executionSpecName: string;
  checkpoint: string;
  swapMode: 'ExactIn';
  provider: {
    name: 'jupiter_swap_api_v2_build';
    protocol: 'https';
    hostname: 'api.jup.ag';
    path: '/swap/v2/build';
    apiVersion: 'v2';
    method: 'GET';
    redirect: 'error';
    baseUrlEnvironmentOverride: false;
    managedExecute: false;
    submit: false;
    ultraLegacy: false;
    legacyQuoteV1: false;
    legacySwapV1: false;
    legacySwapInstructionsV1: false;
    orderEndpoint: false;
  };
  requestContract: {
    slippageBps: number;
    maxAccounts: number;
    blockhashSlotsToExpiry: number;
    computeUnitPricePercentile: 'high';
    forJitoBundle: false;
    modeFast: false;
    platformFeeBps: number;
    feeAccount: false;
    payerOverride: false;
    tipAmountLamports: number;
    destinationTokenAccountOverride: false;
    nativeDestinationAccountOverride: false;
    dexesRestrict: false;
    excludeDexes: false;
    rtse: false;
  };
  networkPolicy: {
    realProviderExecution: 'mainnet-beta_only';
    publicTakerOnly: true;
    noPrivateKeys: true;
    noSigning: true;
    noSolanaSendTransaction: true;
    noJitoSend: true;
    noJitoClient: true;
    simulateRequiresMainnetGenesisHash: true;
    expectedMainnetGenesisHash: '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d';
    genesisSource: 'docs.anza.xyz/clusters/available';
    rpcUrlNotInFingerprint: true;
  };
  computePolicy: {
    firstSimulationLimit: number;
    safetyMarginNumerator: string;
    safetyMarginDenominator: string;
    hardMax: number;
    firstSimulationIncludesProviderCuPrice: false;
    finalCandidateIncludesProviderCuPrice: true;
    finalSimulationRequiredForPassed: true;
    firstSimulationReplaceRecentBlockhash: true;
    finalSimulationReplaceRecentBlockhash: false;
    finalSimulationSigVerify: false;
    finalSimulationUsesProviderBlockhash: true;
    preFinalExpiryRecheck: true;
    zeroConsumedUnitsInvalid: true;
    finalLimitMustExceedConsumedUnlessBlocked: true;
    unknownComputeBudgetVariant: 'provider_contract_changed';
    requestHeapFrame: 'provider_contract_changed';
    setLoadedAccountsDataSizeLimit: 'provider_contract_changed';
  };
  feePolicy: {
    maxPriorityFeeLamports: string;
    noAutomaticCapRaise: true;
    noSilentCuPriceLower: true;
    rpcFeeIsMessageChargeNotAddedToPriority: true;
    nullRpcFeeIsUnavailableNotZero: true;
    feeEstimateUsesFinalMessage: true;
  };
  validationPolicy: {
    providerResponse: true;
    routePlan: true;
    routePlanTotalFirstLevelBps: number;
    percentDeprecatedAsPrimary: true;
    instruction: true;
    signerMeta: 'taker_only';
    compiledRequiredSignerCount: 1;
    compiledRequiredSignerIsTaker: true;
    noSignerViaAddressLookupTable: true;
    lookupTablesFromProviderOnly: true;
    noIndependentLookupTableFetch: true;
    lookupTableKeysCanonicalSorted: true;
    emptyLookupTableRejected: true;
    computeBudget: true;
    tipInstructionMustBeAbsent: true;
    errorSanitization: true;
    secretSanitization: true;
    streamingBodyCap: true;
    jsonContentTypeRequiredOn2xx: true;
    missingContentTypeOn2xx: 'reject';
    canonicalBase64: true;
    blockhashExact32Bytes: true;
    routeHopBpsMax: 10000;
    terminalOutputMintRequired: true;
    compiledMessageHashBound: true;
    serializedTransactionMaxBytes: 1232;
  };
  identities: {
    noRandomIds: true;
    noDatabaseRowIds: true;
    noDateNow: true;
    noApiKey: true;
    noRpcCredentials: true;
  };
  persistence: {
    schemaVersion: 7;
    migration008: false;
    persistCandidates: false;
  };
  statusStateMachine: readonly [
    'build_validated',
    'simulation_passed',
    'simulation_failed',
    'blocked_compute_limit',
    'blocked_priority_fee_cap',
    'expired_blockhash',
    'unsupported_signer_requirement',
    'unsupported_network',
    'cluster_mismatch',
    'rpc_unavailable',
    'blocked_transaction_size',
    'provider_contract_changed',
    'provider_rate_limited',
    'provider_auth_failed',
    'provider_unavailable',
    'provider_invalid_response',
    'provider_no_route',
    'missing_public_config',
    'blocked',
    'expired',
    'unsupported',
  ];
  instructionOrder: readonly [
    'set_compute_unit_limit',
    'jupiter_compute_budget_set_compute_unit_price',
    'jupiter_setup_instructions',
    'jupiter_swap_instruction',
    'jupiter_cleanup_instruction_if_present',
    'jupiter_other_instructions',
  ];
  instructionOrderSource: 'official_jupiter_swap_v2_build_kit_example_and_common_instructions';
  httpPolicy: {
    maxResponseBytes: number;
    timeoutMsDefault: number;
    timeoutMsMin: number;
    timeoutMsMax: number;
    timeoutBoundInDefinition: true;
    retryLoop: false;
    oneInvocationOneBuildRequest: true;
  };
  dashboard: {
    frozenD13: true;
    noExecutionButtons: true;
  };
  strategyBridge: false;
  autoExecution: false;
};

export function canonicalExecutionDefinition(): CanonicalExecutionDefinition {
  return {
    executionSpecVersion: EXECUTION_SPEC_VERSION,
    executionSpecName: EXECUTION_SPEC_NAME,
    checkpoint: EXECUTION_CHECKPOINT,
    swapMode: EXECUTION_SWAP_MODE,
    provider: {
      name: 'jupiter_swap_api_v2_build',
      protocol: JUPITER_PROVIDER_PROTOCOL,
      hostname: JUPITER_PROVIDER_HOST,
      path: JUPITER_BUILD_PATH,
      apiVersion: JUPITER_SWAP_API_VERSION,
      method: JUPITER_HTTP_METHOD,
      redirect: JUPITER_REDIRECT_POLICY,
      baseUrlEnvironmentOverride: false,
      managedExecute: false,
      submit: false,
      ultraLegacy: false,
      legacyQuoteV1: false,
      legacySwapV1: false,
      legacySwapInstructionsV1: false,
      orderEndpoint: false,
    },
    requestContract: {
      slippageBps: EXECUTION_SLIPPAGE_BPS,
      maxAccounts: EXECUTION_MAX_ACCOUNTS,
      blockhashSlotsToExpiry: EXECUTION_BLOCKHASH_SLOTS_TO_EXPIRY,
      computeUnitPricePercentile: EXECUTION_COMPUTE_UNIT_PRICE_PERCENTILE,
      forJitoBundle: EXECUTION_FOR_JITO_BUNDLE,
      modeFast: false,
      platformFeeBps: EXECUTION_PLATFORM_FEE_BPS,
      feeAccount: false,
      payerOverride: false,
      tipAmountLamports: EXECUTION_TIP_AMOUNT_LAMPORTS,
      destinationTokenAccountOverride: false,
      nativeDestinationAccountOverride: false,
      dexesRestrict: false,
      excludeDexes: false,
      rtse: false,
    },
    networkPolicy: {
      realProviderExecution: 'mainnet-beta_only',
      publicTakerOnly: true,
      noPrivateKeys: true,
      noSigning: true,
      noSolanaSendTransaction: true,
      noJitoSend: true,
      noJitoClient: true,
      simulateRequiresMainnetGenesisHash: true,
      expectedMainnetGenesisHash: SOLANA_MAINNET_GENESIS_HASH,
      genesisSource: 'docs.anza.xyz/clusters/available',
      rpcUrlNotInFingerprint: true,
    },
    computePolicy: {
      firstSimulationLimit: COMPUTE_UNIT_HARD_MAX,
      safetyMarginNumerator: COMPUTE_UNIT_MARGIN_NUMERATOR.toString(),
      safetyMarginDenominator: COMPUTE_UNIT_MARGIN_DENOMINATOR.toString(),
      hardMax: COMPUTE_UNIT_HARD_MAX,
      firstSimulationIncludesProviderCuPrice: false,
      finalCandidateIncludesProviderCuPrice: true,
      finalSimulationRequiredForPassed: true,
      firstSimulationReplaceRecentBlockhash: true,
      finalSimulationReplaceRecentBlockhash: false,
      finalSimulationSigVerify: false,
      finalSimulationUsesProviderBlockhash: true,
      preFinalExpiryRecheck: true,
      zeroConsumedUnitsInvalid: true,
      finalLimitMustExceedConsumedUnlessBlocked: true,
      unknownComputeBudgetVariant: 'provider_contract_changed',
      requestHeapFrame: 'provider_contract_changed',
      setLoadedAccountsDataSizeLimit: 'provider_contract_changed',
    },
    feePolicy: {
      maxPriorityFeeLamports: MAX_PRIORITY_FEE_LAMPORTS.toString(),
      noAutomaticCapRaise: true,
      noSilentCuPriceLower: true,
      rpcFeeIsMessageChargeNotAddedToPriority: true,
      nullRpcFeeIsUnavailableNotZero: true,
      feeEstimateUsesFinalMessage: true,
    },
    validationPolicy: {
      providerResponse: true,
      routePlan: true,
      routePlanTotalFirstLevelBps: EXECUTION_ROUTE_PLAN_TOTAL_BPS,
      percentDeprecatedAsPrimary: true,
      instruction: true,
      signerMeta: 'taker_only',
      compiledRequiredSignerCount: 1,
      compiledRequiredSignerIsTaker: true,
      noSignerViaAddressLookupTable: true,
      lookupTablesFromProviderOnly: true,
      noIndependentLookupTableFetch: true,
      lookupTableKeysCanonicalSorted: true,
      emptyLookupTableRejected: true,
      computeBudget: true,
      tipInstructionMustBeAbsent: true,
      errorSanitization: true,
      secretSanitization: true,
      streamingBodyCap: true,
      jsonContentTypeRequiredOn2xx: true,
      missingContentTypeOn2xx: 'reject',
      canonicalBase64: true,
      blockhashExact32Bytes: true,
      routeHopBpsMax: 10000,
      terminalOutputMintRequired: true,
      compiledMessageHashBound: true,
      serializedTransactionMaxBytes: SOLANA_PACKET_DATA_SIZE,
    },
    identities: {
      noRandomIds: true,
      noDatabaseRowIds: true,
      noDateNow: true,
      noApiKey: true,
      noRpcCredentials: true,
    },
    persistence: {
      schemaVersion: 7,
      migration008: false,
      persistCandidates: false,
    },
    statusStateMachine: [
      'build_validated',
      'simulation_passed',
      'simulation_failed',
      'blocked_compute_limit',
      'blocked_priority_fee_cap',
      'expired_blockhash',
      'unsupported_signer_requirement',
      'unsupported_network',
      'cluster_mismatch',
      'rpc_unavailable',
      'blocked_transaction_size',
      'provider_contract_changed',
      'provider_rate_limited',
      'provider_auth_failed',
      'provider_unavailable',
      'provider_invalid_response',
      'provider_no_route',
      'missing_public_config',
      'blocked',
      'expired',
      'unsupported',
    ],
    instructionOrder: [
      'set_compute_unit_limit',
      'jupiter_compute_budget_set_compute_unit_price',
      'jupiter_setup_instructions',
      'jupiter_swap_instruction',
      'jupiter_cleanup_instruction_if_present',
      'jupiter_other_instructions',
    ],
    instructionOrderSource: 'official_jupiter_swap_v2_build_kit_example_and_common_instructions',
    httpPolicy: {
      maxResponseBytes: JUPITER_MAX_RESPONSE_BYTES,
      timeoutMsDefault: DEFAULT_EXECUTION_PROVIDER_TIMEOUT_MS,
      timeoutMsMin: EXECUTION_PROVIDER_TIMEOUT_MS_MIN,
      timeoutMsMax: EXECUTION_PROVIDER_TIMEOUT_MS_MAX,
      timeoutBoundInDefinition: true,
      retryLoop: false,
      oneInvocationOneBuildRequest: true,
    },
    dashboard: {
      frozenD13: true,
      noExecutionButtons: true,
    },
    strategyBridge: false,
    autoExecution: false,
  };
}

export function mutateCanonicalExecutionDefinition(
  mutate: (definition: CanonicalExecutionDefinition) => void,
): CanonicalExecutionDefinition {
  const definition = structuredClone(canonicalExecutionDefinition());
  mutate(definition);
  return definition;
}
