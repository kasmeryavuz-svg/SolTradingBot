import { USDC_MINT, WRAPPED_SOL_MINT } from '../config/defaults.js';
import { SOLANA_MAINNET_GENESIS_HASH } from '../execution/constants.js';
import {
  LIVE_BALANCE_COMMITMENT,
  LIVE_BLOCK_HEIGHT_COMMITMENT,
  LIVE_BROADCASTER,
  LIVE_BROADCAST_RISK_STATUSES,
  LIVE_CHECKPOINT,
  LIVE_CONFIRMATION_POLL_INTERVAL_MS,
  LIVE_CONFIRMATION_TIMEOUT_MS,
  LIVE_GET_TRANSACTION_COMMITMENT,
  LIVE_GET_TRANSACTION_ENCODING,
  LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION,
  LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY,
  LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY,
  LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT,
  LIVE_MAX_PRIORITY_COMPONENT_LAMPORTS,
  LIVE_MAX_RETRIES,
  LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS,
  LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_CONFIRM,
  LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_SEND,
  LIVE_MIN_CONTEXT_SLOT_POLICY,
  LIVE_MIN_SOL_BALANCE_BEFORE_LAMPORTS,
  LIVE_PREFLIGHT_COMMITMENT,
  LIVE_RECONCILE_ORDER,
  LIVE_RECONCILE_SEARCH_TRANSACTION_HISTORY,
  LIVE_RPC_REQUEST_TIMEOUT_MS,
  LIVE_SEND_ENCODING,
  LIVE_SEND_TIMEOUT_MS,
  LIVE_SKIP_PREFLIGHT,
  LIVE_SPEC_NAME,
  LIVE_SPEC_VERSION,
  LIVE_TRACKER_SEARCH_TRANSACTION_HISTORY,
  LIVE_UNRESOLVED_STATUSES,
} from './constants.js';

export type CanonicalLiveDefinition = {
  liveSpecVersion: string;
  liveSpecName: string;
  checkpoint: string;
  interface: {
    manualCliOnly: true;
    strategyAutomation: false;
    watcher: false;
    daemon: false;
    cron: false;
    npmRunDevSend: false;
    npmRunDevPrompt: false;
    dashboardLiveActions: false;
  };
  pair: {
    kind: 'fixed_wsol_to_usdc';
    inputMint: string;
    outputMint: string;
    configurableOutputMint: false;
    arbitraryMemeToken: false;
  };
  caps: {
    maxInputLamportsPerAttempt: string;
    maxBroadcastInputLamportsPerUtcDay: string;
    maxBroadcastAttemptsPerUtcDay: number;
    minSolBalanceBeforeLamports: string;
    maxRpcTransactionFeeLamports: string;
    maxPriorityComponentLamports: string;
    environmentOverride: false;
  };
  network: {
    exactMainnetGenesisRequired: true;
    expectedMainnetGenesisHash: string;
    unsupportedNetworkRefused: true;
    balanceCommitment: 'confirmed';
    blockHeightCommitment: 'confirmed';
  };
  upstream: {
    e14SimulationPassedRequired: true;
    exactE14CandidateBinding: true;
    w15InteractiveSignerRequired: true;
    signerMustEqualTaker: true;
    hiddenTtySigner: true;
    noRebuildAfterConfirmation: true;
    confirmationToctouCheck: true;
  };
  authorization: {
    tradingEnabledRequired: true;
    liveBroadcastEnabledRequired: true;
    explicitOperatorConfirmation: true;
    confirmationBeforeSecret: true;
    reservationBeforeSecret: true;
    ttyRequired: true;
    yesFlag: false;
    autoConfirmEnv: false;
    pipedStdin: false;
  };
  broadcaster: {
    kind: 'standard_solana_rpc';
    oneConfiguredRpcOnly: true;
    encoding: 'base64';
    skipPreflight: false;
    preflightCommitment: 'confirmed';
    maxRetries: string;
    maxRetriesJsonType: 'number';
    minContextSlotPolicy: typeof LIVE_MIN_CONTEXT_SLOT_POLICY;
    applicationResend: false;
    oneSendTransactionCallMax: true;
    sendTimeoutMs: number;
    rpcRequestTimeoutMs: number;
    abortAfterInvokeIsUnknown: true;
    jito: false;
    sendBundle: false;
    jupiterExecute: false;
    jupiterSubmit: false;
  };
  blockhash: {
    headroomBeforeConfirm: string;
    headroomBeforeSend: string;
    finalHeadroomBeforeBroadcastSubmitting: true;
    expiredUsesE14StrictGreaterThanLastValid: true;
    staleRefusesWithoutRebuild: true;
  };
  identity: {
    expectedTxidDerivedBeforeSend: true;
    firstSignatureIsTxid: true;
    persistExpectedTxidAndSignedWireSha256BeforeSend: true;
    rpcReturnedSignatureMustMatchExpected: true;
    mismatchStillReconcilesExpected: true;
    malformedReturnedSignatureDoesNotRewriteExpected: true;
  };
  crashSafety: {
    durableStateImmediatelyBeforeSend: 'broadcast_submitting';
    persistThenCommitThenSend: true;
    crashBeforeRiskCommitMeansNotSent: true;
    crashAfterRiskCommitMeansMaybeSent: true;
    noAutomaticResend: true;
    signedIsNotMaybeSent: true;
  };
  ambiguousSend: {
    timeoutIsNotUnsent: true;
    abortAfterInvokeIsNotUnsent: true;
    connectionResetIsNotUnsent: true;
    http5xxIsNotUnsent: true;
    statusWhenAmbiguous: 'broadcast_outcome_unknown';
    automaticResend: false;
  };
  confirmationTracking: {
    method: 'getSignatureStatuses';
    websocket: false;
    pollIntervalMs: number;
    maxWallTimeMs: number;
    sequentialPollOnly: true;
    trackerSearchTransactionHistory: false;
    reconcileSearchTransactionHistory: true;
    processedIsCompletion: false;
    successRequiresErrNull: true;
    acceptedStatuses: readonly ['confirmed', 'finalized'];
    confirmationRpcHasNoSend: true;
  };
  receipt: {
    method: 'getTransaction';
    maxSupportedTransactionVersion: 0;
    encoding: 'base64';
    commitment: 'confirmed';
    compareConfirmedWireSha256: true;
    persistSignedWireSha256: true;
    reconcileComparesPersistedWireHash: true;
    actualOutputRawFromTokenBalances: true;
    actualOutputIsNotPnl: true;
    belowMinimumThresholdIsIntegrityError: true;
    confirmedNullReceiptIsPending: true;
    receiptRpcFailurePreservesConfirmation: true;
    estimatedFeeAndActualFeeAreSeparate: true;
    firstSignatureMustEqualExpectedTxid: true;
  };
  persistence: {
    schemaVersion: 8;
    migration: '008_live_execution_attempts';
    publicEvidenceOnly: true;
    uniqueExecutionCandidateFingerprint: true;
    noSecretColumns: true;
    noSignedWireColumns: true;
    noRawProviderResponse: true;
    noRpcUrl: true;
    noApiKey: true;
    reservationBeforeSecret: true;
    expectedSignatureBeforeSend: true;
    signedWireSha256BeforeSend: true;
    commitBeforeNetworkSend: true;
    noWriteTransactionHeldDuringSend: true;
  };
  dailyAccounting: {
    calendar: 'utc';
    integerUtcOnly: true;
    timestampBasis: 'broadcast_risk_at_ms';
    atomicTransitionAtBroadcastSubmitting: true;
    candidateReservationDoesNotConsumeRisk: true;
    countWhenBroadcastMayHaveOccurred: true;
    timeoutAfterSendCounts: true;
    reservedDoesNotCount: true;
    signedBeforeSendDoesNotCount: true;
    riskStatuses: typeof LIVE_BROADCAST_RISK_STATUSES;
  };
  reconcile: {
    order: typeof LIVE_RECONCILE_ORDER;
    oneOldestUnresolvedPerInvocation: true;
    signedNotEligible: true;
    broadcastSubmittingEligible: true;
    noSend: true;
    noSign: true;
    noSecret: true;
    noCliSignatureArgument: true;
    unresolvedStatuses: typeof LIVE_UNRESOLVED_STATUSES;
  };
  publicBarrel: {
    broadcastRaw: false;
    sendTransaction: false;
    liveRpc: false;
    signedWire: false;
    walletSigner: false;
    genericConfirmationCallback: false;
  };
};

export function canonicalLiveDefinition(): CanonicalLiveDefinition {
  return {
    liveSpecVersion: LIVE_SPEC_VERSION,
    liveSpecName: LIVE_SPEC_NAME,
    checkpoint: LIVE_CHECKPOINT,
    interface: {
      manualCliOnly: true,
      strategyAutomation: false,
      watcher: false,
      daemon: false,
      cron: false,
      npmRunDevSend: false,
      npmRunDevPrompt: false,
      dashboardLiveActions: false,
    },
    pair: {
      kind: 'fixed_wsol_to_usdc',
      inputMint: WRAPPED_SOL_MINT,
      outputMint: USDC_MINT,
      configurableOutputMint: false,
      arbitraryMemeToken: false,
    },
    caps: {
      maxInputLamportsPerAttempt: LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT.toString(),
      maxBroadcastInputLamportsPerUtcDay: LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY.toString(),
      maxBroadcastAttemptsPerUtcDay: LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY,
      minSolBalanceBeforeLamports: LIVE_MIN_SOL_BALANCE_BEFORE_LAMPORTS.toString(),
      maxRpcTransactionFeeLamports: LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS.toString(),
      maxPriorityComponentLamports: LIVE_MAX_PRIORITY_COMPONENT_LAMPORTS.toString(),
      environmentOverride: false,
    },
    network: {
      exactMainnetGenesisRequired: true,
      expectedMainnetGenesisHash: SOLANA_MAINNET_GENESIS_HASH,
      unsupportedNetworkRefused: true,
      balanceCommitment: LIVE_BALANCE_COMMITMENT,
      blockHeightCommitment: LIVE_BLOCK_HEIGHT_COMMITMENT,
    },
    upstream: {
      e14SimulationPassedRequired: true,
      exactE14CandidateBinding: true,
      w15InteractiveSignerRequired: true,
      signerMustEqualTaker: true,
      hiddenTtySigner: true,
      noRebuildAfterConfirmation: true,
      confirmationToctouCheck: true,
    },
    authorization: {
      tradingEnabledRequired: true,
      liveBroadcastEnabledRequired: true,
      explicitOperatorConfirmation: true,
      confirmationBeforeSecret: true,
      reservationBeforeSecret: true,
      ttyRequired: true,
      yesFlag: false,
      autoConfirmEnv: false,
      pipedStdin: false,
    },
    broadcaster: {
      kind: LIVE_BROADCASTER,
      oneConfiguredRpcOnly: true,
      encoding: LIVE_SEND_ENCODING,
      skipPreflight: LIVE_SKIP_PREFLIGHT,
      preflightCommitment: LIVE_PREFLIGHT_COMMITMENT,
      maxRetries: String(LIVE_MAX_RETRIES),
      maxRetriesJsonType: 'number',
      minContextSlotPolicy: LIVE_MIN_CONTEXT_SLOT_POLICY,
      applicationResend: false,
      oneSendTransactionCallMax: true,
      sendTimeoutMs: LIVE_SEND_TIMEOUT_MS,
      rpcRequestTimeoutMs: LIVE_RPC_REQUEST_TIMEOUT_MS,
      abortAfterInvokeIsUnknown: true,
      jito: false,
      sendBundle: false,
      jupiterExecute: false,
      jupiterSubmit: false,
    },
    blockhash: {
      headroomBeforeConfirm: LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_CONFIRM.toString(),
      headroomBeforeSend: LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_SEND.toString(),
      finalHeadroomBeforeBroadcastSubmitting: true,
      expiredUsesE14StrictGreaterThanLastValid: true,
      staleRefusesWithoutRebuild: true,
    },
    identity: {
      expectedTxidDerivedBeforeSend: true,
      firstSignatureIsTxid: true,
      persistExpectedTxidAndSignedWireSha256BeforeSend: true,
      rpcReturnedSignatureMustMatchExpected: true,
      mismatchStillReconcilesExpected: true,
      malformedReturnedSignatureDoesNotRewriteExpected: true,
    },
    crashSafety: {
      durableStateImmediatelyBeforeSend: 'broadcast_submitting',
      persistThenCommitThenSend: true,
      crashBeforeRiskCommitMeansNotSent: true,
      crashAfterRiskCommitMeansMaybeSent: true,
      noAutomaticResend: true,
      signedIsNotMaybeSent: true,
    },
    ambiguousSend: {
      timeoutIsNotUnsent: true,
      abortAfterInvokeIsNotUnsent: true,
      connectionResetIsNotUnsent: true,
      http5xxIsNotUnsent: true,
      statusWhenAmbiguous: 'broadcast_outcome_unknown',
      automaticResend: false,
    },
    confirmationTracking: {
      method: 'getSignatureStatuses',
      websocket: false,
      pollIntervalMs: LIVE_CONFIRMATION_POLL_INTERVAL_MS,
      maxWallTimeMs: LIVE_CONFIRMATION_TIMEOUT_MS,
      sequentialPollOnly: true,
      trackerSearchTransactionHistory: LIVE_TRACKER_SEARCH_TRANSACTION_HISTORY,
      reconcileSearchTransactionHistory: LIVE_RECONCILE_SEARCH_TRANSACTION_HISTORY,
      processedIsCompletion: false,
      successRequiresErrNull: true,
      acceptedStatuses: ['confirmed', 'finalized'],
      confirmationRpcHasNoSend: true,
    },
    receipt: {
      method: 'getTransaction',
      maxSupportedTransactionVersion: LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION,
      encoding: LIVE_GET_TRANSACTION_ENCODING,
      commitment: LIVE_GET_TRANSACTION_COMMITMENT,
      compareConfirmedWireSha256: true,
      persistSignedWireSha256: true,
      reconcileComparesPersistedWireHash: true,
      actualOutputRawFromTokenBalances: true,
      actualOutputIsNotPnl: true,
      belowMinimumThresholdIsIntegrityError: true,
      confirmedNullReceiptIsPending: true,
      receiptRpcFailurePreservesConfirmation: true,
      estimatedFeeAndActualFeeAreSeparate: true,
      firstSignatureMustEqualExpectedTxid: true,
    },
    persistence: {
      schemaVersion: 8,
      migration: '008_live_execution_attempts',
      publicEvidenceOnly: true,
      uniqueExecutionCandidateFingerprint: true,
      noSecretColumns: true,
      noSignedWireColumns: true,
      noRawProviderResponse: true,
      noRpcUrl: true,
      noApiKey: true,
      reservationBeforeSecret: true,
      expectedSignatureBeforeSend: true,
      signedWireSha256BeforeSend: true,
      commitBeforeNetworkSend: true,
      noWriteTransactionHeldDuringSend: true,
    },
    dailyAccounting: {
      calendar: 'utc',
      integerUtcOnly: true,
      timestampBasis: 'broadcast_risk_at_ms',
      atomicTransitionAtBroadcastSubmitting: true,
      candidateReservationDoesNotConsumeRisk: true,
      countWhenBroadcastMayHaveOccurred: true,
      timeoutAfterSendCounts: true,
      reservedDoesNotCount: true,
      signedBeforeSendDoesNotCount: true,
      riskStatuses: LIVE_BROADCAST_RISK_STATUSES,
    },
    reconcile: {
      order: LIVE_RECONCILE_ORDER,
      oneOldestUnresolvedPerInvocation: true,
      signedNotEligible: true,
      broadcastSubmittingEligible: true,
      noSend: true,
      noSign: true,
      noSecret: true,
      noCliSignatureArgument: true,
      unresolvedStatuses: LIVE_UNRESOLVED_STATUSES,
    },
    publicBarrel: {
      broadcastRaw: false,
      sendTransaction: false,
      liveRpc: false,
      signedWire: false,
      walletSigner: false,
      genericConfirmationCallback: false,
    },
  };
}

export function mutateCanonicalLiveDefinition(
  mutate: (definition: CanonicalLiveDefinition) => void,
): CanonicalLiveDefinition {
  const definition = structuredClone(canonicalLiveDefinition());
  mutate(definition);
  return definition;
}
