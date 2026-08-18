import type { ExecutionSimulateReport } from '../execution/types.js';
import type { WalletSigningProof } from '../wallet/types.js';

export const LIVE_ATTEMPT_STATUSES = [
  'reserved',
  'signed',
  'abandoned_signed',
  'broadcast_submitting',
  'broadcast_submitted',
  'broadcast_outcome_unknown',
  'broadcast_rejected',
  'broadcast_pending',
  'confirmed',
  'finalized',
  'failed_on_chain',
  'expired_unconfirmed',
  'expired_after_submission',
  'stale_before_send',
  'cancelled_before_sign',
  'signer_mismatch',
  'preflight_failed',
  'candidate_changed_after_confirmation',
  'confirmation_integrity_error',
  'receipt_integrity_error',
  'confirmed_receipt_pending',
  'receipt_fee_anomaly',
  'rpc_signature_mismatch',
] as const;

export type LiveAttemptStatus = (typeof LIVE_ATTEMPT_STATUSES)[number];

export type LiveConfirmationLevel = 'processed' | 'confirmed' | 'finalized';

export type LiveSignatureStatus = {
  readonly slot: string;
  readonly err: unknown;
  readonly confirmationStatus: LiveConfirmationLevel | null;
};

export type LiveTokenBalance = {
  readonly mint: string;
  readonly owner: string | null;
  readonly amountRaw: string;
  readonly accountIndex: number | null;
};

export type LiveTransactionReceipt = {
  readonly slot: string;
  readonly err: unknown;
  readonly feeLamports: bigint | null;
  readonly transactionBase64: string | null;
  readonly firstSignature: string | null;
  readonly preTokenBalances: readonly LiveTokenBalance[];
  readonly postTokenBalances: readonly LiveTokenBalance[];
};

export type LiveSendTransactionConfig = {
  readonly encoding: 'base64';
  readonly skipPreflight: false;
  readonly preflightCommitment: 'confirmed';
  readonly maxRetries: 0;
};

export type LiveConfirmationRpc = {
  getBlockHeight(signal?: AbortSignal): Promise<bigint>;
  getSignatureStatuses(
    signatures: readonly string[],
    options?: { searchTransactionHistory?: boolean; signal?: AbortSignal },
  ): Promise<readonly (LiveSignatureStatus | null)[]>;
  getTransaction(
    signature: string,
    options?: { commitment?: 'confirmed' | 'finalized'; signal?: AbortSignal },
  ): Promise<LiveTransactionReceipt | null>;
};

export type LiveReadRpc = LiveConfirmationRpc & {
  getGenesisHash(signal?: AbortSignal): Promise<string>;
  getBalance(address: string, signal?: AbortSignal): Promise<bigint>;
};

export type LiveBroadcastRpc = {
  sendTransaction(wireTransactionBase64: string, signal?: AbortSignal): Promise<string>;
};

export type LiveRpc = LiveReadRpc & LiveBroadcastRpc;

export type LiveDailyUsage = {
  readonly utcDay: string;
  readonly attemptCount: number;
  readonly inputLamports: bigint;
};

export type LivePreviewReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly liveDefinitionFingerprint: string;
  readonly previewOnly: true;
  readonly noSign: true;
  readonly noSend: true;
  readonly network: string;
  readonly takerAddress: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountRaw: string;
  readonly quotedOutput: string;
  readonly minimumOutputThreshold: string;
  readonly executionCandidateFingerprint: string;
  readonly compiledMessageSha256: string;
  readonly calculatedPriorityComponentLamports: string | null;
  readonly rpcEstimatedTransactionFeeLamports: string | null;
  readonly currentSolBalanceLamports: string;
  readonly lastValidBlockHeight: string;
  readonly remainingBlockHeightHeadroom: string;
  readonly dailyAttemptUsage: number;
  readonly dailyInputUsageLamports: string;
  readonly executionStatus: ExecutionSimulateReport['status'];
  readonly wouldBroadcast: false;
  readonly message: string;
};

export type LiveStatusReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly liveDefinitionFingerprint: string;
  readonly checkpoint: string;
  readonly pair: 'WSOL → USDC ONLY';
  readonly maxInputLamportsPerAttempt: string;
  readonly maxDailyBroadcastInputLamports: string;
  readonly maxAttemptsPerUtcDay: number;
  readonly broadcastProvider: 'standard Solana RPC';
  readonly jito: 'disabled';
  readonly tradingEnabled: boolean;
  readonly liveBroadcastEnabled: boolean;
  readonly wallet: 'interactive only';
  readonly automaticTrading: 'unavailable';
  readonly dashboardLiveControls: 'unavailable';
};

export type LiveReceiptReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly liveDefinitionFingerprint: string;
  readonly attemptId: string;
  readonly status: LiveAttemptStatus;
  readonly takerAddress: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountRaw: string;
  readonly executionCandidateFingerprint: string;
  readonly compiledMessageSha256: string;
  readonly expectedSignature: string | null;
  readonly rpcReturnedSignature: string | null;
  readonly signedWireSha256: string | null;
  readonly confirmationStatus: LiveConfirmationLevel | null;
  readonly slot: string | null;
  readonly rpcEstimatedTransactionFeeLamports: string | null;
  readonly actualTransactionFeeLamports: string | null;
  readonly actualOutputRaw: string | null;
  readonly lastValidBlockHeight: string;
  readonly walletSigningProofFingerprint: string | null;
  readonly liveAttemptFingerprint: string;
  readonly liveReceiptFingerprint: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly sendCount: number;
  readonly message: string;
};

export type LiveHistoryEntry = {
  readonly attemptId: string;
  readonly createdAtMs: number;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountRaw: string;
  readonly executionCandidateFingerprint: string;
  readonly expectedSignature: string | null;
  readonly status: LiveAttemptStatus;
  readonly slot: string | null;
  readonly rpcEstimatedTransactionFeeLamports: string | null;
  readonly actualTransactionFeeLamports: string | null;
  readonly actualOutputRaw: string | null;
};

export type LiveAttemptRow = {
  readonly attemptId: string;
  readonly liveSpecVersion: string;
  readonly liveDefinitionFingerprint: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly takerAddress: string;
  readonly inputMint: string;
  readonly outputMint: string;
  readonly amountRaw: string;
  readonly executionDefinitionFingerprint: string;
  readonly executionIntentFingerprint: string;
  readonly jupiterBuildFingerprint: string;
  readonly executionCandidateFingerprint: string;
  readonly compiledMessageSha256: string;
  readonly walletDefinitionFingerprint: string | null;
  readonly walletSignerFingerprint: string | null;
  readonly walletSigningProofFingerprint: string | null;
  readonly status: LiveAttemptStatus;
  readonly expectedSignature: string | null;
  readonly rpcReturnedSignature: string | null;
  readonly signedWireSha256: string | null;
  readonly lastValidBlockHeight: string;
  readonly broadcastRiskAtMs: number | null;
  readonly submittedAtMs: number | null;
  readonly confirmedAtMs: number | null;
  readonly confirmationStatus: string | null;
  readonly slot: string | null;
  readonly rpcEstimatedTransactionFeeLamports: string | null;
  readonly actualTransactionFeeLamports: string | null;
  readonly actualOutputRaw: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly liveAttemptFingerprint: string | null;
  readonly liveReceiptFingerprint: string | null;
};

export type LiveSignedHandoff = {
  readonly expectedSignature: string;
  readonly signedWireSha256: string;
  readonly signedWireBase64: string;
  readonly signedWireBytes: Uint8Array;
  readonly proof: WalletSigningProof;
};

export type LiveClock = {
  nowMs(): number;
  sleep(ms: number): Promise<void>;
};

export type FrozenLiveCandidateEvidence = {
  readonly executionCandidateFingerprint: string;
  readonly amountRaw: string;
  readonly otherAmountThreshold: string;
  readonly compiledMessageSha256: string;
  readonly rpcEstimatedTransactionFeeLamports: string | null;
  readonly calculatedPriorityComponentLamports: string | null;
  readonly lastValidBlockHeight: string;
  readonly remainingHeadroom: string;
};
