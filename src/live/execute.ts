import type { ExecutionIntent, ExecutionRpc, JupiterClient } from '../execution/types.js';
import { WalletError } from '../wallet/errors.js';
import type { SecretPrompt } from '../wallet/signer-scope.js';
import { LIVE_SEND_TIMEOUT_MS, LIVE_SPEC_NAME, LIVE_SPEC_VERSION } from './constants.js';
import { liveConfirmationPhrase, promptLiveConfirmation, type LiveTerminalAdapter } from './confirmation.js';
import { DEFAULT_LIVE_CLOCK, trackExpectedSignature } from './confirmation-tracker.js';
import { broadcastSignedTransactionOnce } from './broadcaster.js';
import { LiveError } from './errors.js';
import { LIVE_DEFINITION_FINGERPRINT, fingerprintLiveReceipt } from './identity.js';
import { assertHeadroomBeforeSend, assertLiveBalance } from './limits.js';
import type { LiveAttemptStore } from './persistence.js';
import { collectLivePreflight } from './preflight.js';
import { verifyConfirmedReceipt } from './receipt.js';
import { assertPublicValueHasNoWire } from './sanitize.js';
import { assertSignedWireIdentity } from './signature.js';
import { withExactLiveSignedTransaction } from './signing-bridge.js';
import type { FrozenLiveCandidateEvidence, LiveAttemptRow, LiveClock, LiveReceiptReport, LiveRpc } from './types.js';
import type { LivePreflightContext } from './preflight.js';
import { isBroadcastRiskStatus } from './state.js';

export type LiveExecuteDependencies = {
  intent: ExecutionIntent;
  jupiter: JupiterClient;
  executionRpc: ExecutionRpc;
  liveRpc: LiveRpc;
  store: LiveAttemptStore;
  promptSecret: SecretPrompt;
  promptConfirmation?: (phrase: string) => Promise<void>;
  terminal?: LiveTerminalAdapter;
  nowMs?: () => number;
  clock?: LiveClock;
  signal?: AbortSignal;
  onSecretPrompt?: () => void;
  onSign?: () => void;
  onSend?: () => void;
  afterRiskCommitted?: () => void;
  afterConfirmation?: (context: LivePreflightContext) => void;
};

export async function executeLiveBroadcast(input: LiveExecuteDependencies): Promise<LiveReceiptReport> {
  const nowMs = input.nowMs ?? Date.now;
  const clock = input.clock ?? DEFAULT_LIVE_CLOCK;
  const counts: { secret: number; sign: number; send: number } = { secret: 0, sign: 0, send: 0 };
  let sendGuard = 0;

  const context = await collectLivePreflight({
    intent: input.intent,
    jupiter: input.jupiter,
    executionRpc: input.executionRpc,
    liveRpc: input.liveRpc,
    store: input.store,
    nowMs: nowMs(),
    requireSimulationPassed: true,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  const frozen = freezeCandidateEvidence(context);
  const phrase = liveConfirmationPhrase(
    context.report.executionCandidateFingerprint,
    context.intent.amountRaw,
  );
  if (input.promptConfirmation !== undefined) {
    await input.promptConfirmation(phrase);
  } else {
    await promptLiveConfirmation(phrase, input.terminal);
  }

  if (counts.secret !== 0 || counts.sign !== 0 || counts.send !== 0) {
    throw new LiveError('Live confirmation completed after a secret or send side effect. Refusing.');
  }
  input.afterConfirmation?.(context);
  assertCandidateUnchangedAfterConfirmation(frozen, context);

  const reserved = input.store.reserve({
    attemptId: context.attemptId,
    liveSpecVersion: LIVE_SPEC_VERSION,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    createdAtMs: nowMs(),
    takerAddress: context.intent.takerPublicKey,
    inputMint: context.intent.inputMint,
    outputMint: context.intent.outputMint,
    amountRaw: context.intent.amountRaw,
    executionDefinitionFingerprint: context.report.executionDefinitionFingerprint,
    executionIntentFingerprint: context.report.executionIntentFingerprint,
    jupiterBuildFingerprint: context.report.jupiterBuildFingerprint,
    executionCandidateFingerprint: context.report.executionCandidateFingerprint,
    compiledMessageSha256: context.report.candidate.compiledMessageSha256,
    walletDefinitionFingerprint: null,
    walletSignerFingerprint: null,
    walletSigningProofFingerprint: null,
    status: 'reserved',
    expectedSignature: null,
    rpcReturnedSignature: null,
    signedWireSha256: null,
    lastValidBlockHeight: context.report.candidate.lastValidBlockHeight.toString(),
    broadcastRiskAtMs: null,
    submittedAtMs: null,
    confirmedAtMs: null,
    confirmationStatus: null,
    slot: null,
    rpcEstimatedTransactionFeeLamports:
      context.report.fees?.rpcEstimatedTransactionFeeLamports?.toString() ?? null,
    actualTransactionFeeLamports: null,
    actualOutputRaw: null,
    failureCode: null,
    failureMessage: null,
    liveAttemptFingerprint: context.liveAttemptFingerprint,
  });

  try {
    const balanceBeforeSecret = await input.liveRpc.getBalance(
      context.intent.takerPublicKey,
      input.signal,
    );
    const rpcFee = context.report.fees?.rpcEstimatedTransactionFeeLamports;
    if (rpcFee === null || rpcFee === undefined) {
      throw new LiveError('l16_v1 refuses to send when the RPC transaction-fee estimate is unavailable.', {
        code: 'rpc_fee_unavailable',
      });
    }
    assertLiveBalance({
      balanceLamports: balanceBeforeSecret,
      amountLamports: context.amountLamports,
      rpcFeeLamports: rpcFee,
    });
  } catch (error: unknown) {
    const mapped = mapPostReserveFailure(error);
    input.store.update(reserved.attemptId, {
      status: mapped.status,
      failureCode: mapped.code,
      failureMessage: mapped.message,
      updatedAtMs: nowMs(),
    });
    throw new LiveError(mapped.message, { code: mapped.code });
  }

  try {
    return await withExactLiveSignedTransaction({
      expectedTaker: context.intent.takerPublicKey,
      report: context.report,
      compiled: context.compiled,
      promptSecret: async () => {
        counts.secret += 1;
        input.onSecretPrompt?.();
        return input.promptSecret();
      },
      consume: async (handoff) => {
        counts.sign += 1;
        input.onSign?.();
        try {
          assertSignedWireIdentity({
            signedWireBytes: handoff.signedWireBytes,
            signedWireSha256: handoff.signedWireSha256,
            expectedSignature: handoff.expectedSignature,
          });
        } catch (error: unknown) {
          throw new LiveError(
            error instanceof Error ? error.message : 'Signed wire identity check failed.',
            { code: 'candidate_changed' },
          );
        }

        try {
          input.store.update(reserved.attemptId, {
            status: 'signed',
            expectedSignature: handoff.expectedSignature,
            signedWireSha256: handoff.signedWireSha256,
            walletDefinitionFingerprint: handoff.proof.walletDefinitionFingerprint,
            walletSignerFingerprint: handoff.proof.walletSignerFingerprint,
            walletSigningProofFingerprint: handoff.proof.walletSigningProofFingerprint,
            updatedAtMs: nowMs(),
          });
        } catch (error: unknown) {
          throw new LiveError('Failed to persist expected txid and signed-wire SHA-256 before send.', {
            code: 'persist_failed_before_send',
            cause: error instanceof Error ? error : undefined,
          });
        }

        let row: LiveAttemptRow;
        try {
          const heightBeforeSubmit = await input.liveRpc.getBlockHeight(input.signal);
          assertHeadroomBeforeSend(heightBeforeSubmit, context.report.candidate.lastValidBlockHeight);
        } catch (error: unknown) {
          row = input.store.update(reserved.attemptId, {
            status: 'stale_before_send',
            failureCode: error instanceof LiveError ? error.code : 'stale_live_candidate',
            failureMessage: error instanceof Error ? error.message : 'stale before send',
            updatedAtMs: nowMs(),
          });
          return publicReceipt(row, 0);
        }

        try {
          row = input.store.enterBroadcastSubmitting(reserved.attemptId, nowMs());
        } catch (error: unknown) {
          throw error instanceof LiveError
            ? error
            : new LiveError('Failed to commit broadcast_submitting before send.', {
                code: 'persist_failed_before_send',
                cause: error instanceof Error ? error : undefined,
              });
        }

        input.afterRiskCommitted?.();

        if (sendGuard !== 0) {
          throw new LiveError('l16_v1 refuses a second sendTransaction call.', { code: 'live_operation_failed' });
        }
        sendGuard = 1;

        const broadcast = await broadcastSignedTransactionOnce({
          rpc: input.liveRpc,
          wireTransactionBase64: handoff.signedWireBase64,
          expectedSignature: handoff.expectedSignature,
          signedWireSha256: handoff.signedWireSha256,
          sendTimeoutMs: LIVE_SEND_TIMEOUT_MS,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
          onSend: () => {
            counts.send += 1;
            input.onSend?.();
          },
        });

        const submittedAt = nowMs();
        if (broadcast.kind === 'rejected') {
          row = input.store.update(reserved.attemptId, {
            status: 'broadcast_rejected',
            submittedAtMs: submittedAt,
            failureCode: 'broadcast_rejected',
            failureMessage: broadcast.message,
            updatedAtMs: submittedAt,
          });
          return publicReceipt(row, counts.send);
        }
        if (broadcast.kind === 'malformed') {
          row = input.store.update(reserved.attemptId, {
            status: 'broadcast_outcome_unknown',
            submittedAtMs: submittedAt,
            failureCode: 'rpc_signature_malformed',
            failureMessage: 'RPC returned a malformed signature. Expected txid remains authoritative.',
            updatedAtMs: submittedAt,
          });
        } else if (broadcast.kind === 'mismatch') {
          row = input.store.update(reserved.attemptId, {
            status: 'rpc_signature_mismatch',
            rpcReturnedSignature: broadcast.returnedSignature,
            submittedAtMs: submittedAt,
            failureCode: 'rpc_signature_mismatch',
            failureMessage: 'RPC returned a signature that does not match the locally derived expected txid.',
            updatedAtMs: submittedAt,
          });
        } else if (broadcast.kind === 'unknown') {
          row = input.store.update(reserved.attemptId, {
            status: 'broadcast_outcome_unknown',
            submittedAtMs: submittedAt,
            failureCode: 'broadcast_outcome_unknown',
            failureMessage: broadcast.message,
            updatedAtMs: submittedAt,
          });
        } else {
          row = input.store.update(reserved.attemptId, {
            status: 'broadcast_submitted',
            rpcReturnedSignature: broadcast.returnedSignature,
            submittedAtMs: submittedAt,
            updatedAtMs: submittedAt,
          });
        }

        const tracked = await trackExpectedSignature({
          rpc: input.liveRpc,
          expectedSignature: handoff.expectedSignature,
          lastValidBlockHeight: context.report.candidate.lastValidBlockHeight,
          clock,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        });

        row = input.store.update(reserved.attemptId, {
          status: tracked.status,
          confirmationStatus: tracked.confirmationStatus,
          slot: tracked.slot,
          failureMessage: tracked.message,
          failureCode:
            tracked.status === 'confirmed' || tracked.status === 'finalized'
              ? row.failureCode
              : (row.failureCode ?? tracked.status),
          updatedAtMs: nowMs(),
        });

        if (tracked.status === 'confirmed' || tracked.status === 'finalized') {
          row = await persistReceiptAfterConfirmation({
            store: input.store,
            liveRpc: input.liveRpc,
            row,
            expectedSignature: handoff.expectedSignature,
            signedWireSha256: handoff.signedWireSha256,
            takerAddress: context.intent.takerPublicKey,
            minimumOutputRaw: context.report.quote.otherAmountThreshold,
            executionCandidateFingerprint: context.report.executionCandidateFingerprint,
            walletSigningProofFingerprint: handoff.proof.walletSigningProofFingerprint,
            confirmationStatus: tracked.confirmationStatus,
            statusErr: tracked.err,
            confirmedStatus: tracked.status,
            nowMs: nowMs(),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
          });
        }

        return publicReceipt(row, counts.send);
      },
    });
  } catch (error: unknown) {
    if (broadcastAlreadyHandedOff(counts.send) || sendGuard >= 1) {
      throw error;
    }
    const current = input.store.getById(reserved.attemptId);
    if (current !== null && isBroadcastRiskStatus(current.status)) {
      throw error;
    }
    if (current !== null && current.status === 'signed' && current.expectedSignature !== null) {
      throw error instanceof LiveError
        ? error
        : new LiveError(error instanceof Error ? error.message : 'Live attempt remained signed before send.', {
            code: 'persist_failed_before_send',
          });
    }
    const mapped = mapPostReserveFailure(error);
    input.store.update(reserved.attemptId, {
      status: mapped.status,
      failureCode: mapped.code,
      failureMessage: mapped.message,
      updatedAtMs: nowMs(),
    });
    throw new LiveError(mapped.message, { code: mapped.code });
  }
}

async function persistReceiptAfterConfirmation(input: {
  store: LiveAttemptStore;
  liveRpc: LiveRpc;
  row: LiveAttemptRow;
  expectedSignature: string;
  signedWireSha256: string;
  takerAddress: string;
  minimumOutputRaw: string;
  executionCandidateFingerprint: string;
  walletSigningProofFingerprint: string | null;
  confirmationStatus: string | null;
  statusErr: unknown;
  confirmedStatus: 'confirmed' | 'finalized';
  signal?: AbortSignal;
  nowMs: number;
}): Promise<LiveAttemptRow> {
  let receipt;
  try {
    receipt = await input.liveRpc.getTransaction(input.expectedSignature, {
      commitment: input.confirmedStatus === 'finalized' ? 'finalized' : 'confirmed',
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  } catch (error: unknown) {
    return input.store.update(input.row.attemptId, {
      status: 'confirmed_receipt_pending',
      confirmationStatus: input.confirmationStatus,
      failureCode: 'confirmed_receipt_pending',
      failureMessage:
        error instanceof Error
          ? error.message
          : 'getTransaction failed after a confirmed/finalized signature status. Reconcile later. Do not resend.',
      updatedAtMs: input.nowMs,
    });
  }
  if (receipt === null) {
    return input.store.update(input.row.attemptId, {
      status: 'confirmed_receipt_pending',
      confirmationStatus: input.confirmationStatus,
      failureCode: 'confirmed_receipt_pending',
      failureMessage:
        'getTransaction returned null after a confirmed/finalized signature status. Receipt is pending. Do not resend.',
      updatedAtMs: input.nowMs,
    });
  }
  try {
    const verified = verifyConfirmedReceipt({
      receipt,
      localSignedWireSha256: input.signedWireSha256,
      expectedSignature: input.expectedSignature,
      takerAddress: input.takerAddress,
      minimumOutputRaw: input.minimumOutputRaw,
      requireSuccess: true,
      statusErr: input.statusErr,
    });
    const nextStatus = verified.feeAnomaly ? 'receipt_fee_anomaly' : input.confirmedStatus;
    return input.store.update(input.row.attemptId, {
      status: nextStatus,
      confirmedAtMs: input.nowMs,
      slot: verified.slot,
      actualTransactionFeeLamports: verified.feeLamports?.toString() ?? null,
      actualOutputRaw: verified.actualOutputRaw,
      failureCode: verified.feeAnomaly ? 'receipt_fee_anomaly' : input.row.failureCode,
      failureMessage: verified.feeAnomaly
        ? 'Actual on-chain fee exceeded the l16 estimate cap. The transaction already happened.'
        : input.row.failureMessage,
      liveReceiptFingerprint: fingerprintLiveReceipt({
        liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
        executionCandidateFingerprint: input.executionCandidateFingerprint,
        walletSigningProofFingerprint: input.walletSigningProofFingerprint,
        expectedSignature: input.expectedSignature,
        rpcReturnedSignature: input.row.rpcReturnedSignature,
        signedWireSha256: input.signedWireSha256,
        confirmationStatus: input.confirmationStatus,
        slot: verified.slot,
        rpcEstimatedTransactionFeeLamports: input.row.rpcEstimatedTransactionFeeLamports,
        actualTransactionFeeLamports: verified.feeLamports?.toString() ?? null,
        actualOutputRaw: verified.actualOutputRaw,
        status: nextStatus,
      }),
      updatedAtMs: input.nowMs,
    });
  } catch (error: unknown) {
    const code =
      error instanceof LiveError &&
      (error.code === 'confirmation_integrity_error' ||
        error.code === 'receipt_integrity_error' ||
        error.code === 'receipt_fee_anomaly')
        ? error.code
        : 'receipt_integrity_error';
    return input.store.update(input.row.attemptId, {
      status: code,
      failureCode: code,
      failureMessage: error instanceof Error ? error.message : code,
      updatedAtMs: input.nowMs,
    });
  }
}

function freezeCandidateEvidence(context: LivePreflightContext): FrozenLiveCandidateEvidence {
  return {
    executionCandidateFingerprint: context.report.executionCandidateFingerprint,
    amountRaw: context.intent.amountRaw,
    otherAmountThreshold: context.report.quote.otherAmountThreshold,
    compiledMessageSha256: context.report.candidate.compiledMessageSha256,
    rpcEstimatedTransactionFeeLamports:
      context.report.fees?.rpcEstimatedTransactionFeeLamports?.toString() ?? null,
    calculatedPriorityComponentLamports:
      context.report.fees?.calculatedPriorityFeeComponentLamports.toString() ?? null,
    lastValidBlockHeight: context.report.candidate.lastValidBlockHeight.toString(),
    remainingHeadroom: context.remainingHeadroom.toString(),
  };
}

function assertCandidateUnchangedAfterConfirmation(
  frozen: FrozenLiveCandidateEvidence,
  context: LivePreflightContext,
): void {
  const current = freezeCandidateEvidence(context);
  if (JSON.stringify(current) !== JSON.stringify(frozen)) {
    throw new LiveError(
      'The confirmed e14 candidate evidence changed after LIVE SEND confirmation. candidate_changed_after_confirmation. No sign and no send.',
      { code: 'candidate_changed_after_confirmation' },
    );
  }
}

function broadcastAlreadyHandedOff(sendCount: number): boolean {
  return sendCount >= 1;
}

function publicReceipt(row: LiveAttemptRow, sendCount: number): LiveReceiptReport {
  const report: LiveReceiptReport = {
    specVersion: LIVE_SPEC_VERSION,
    specName: LIVE_SPEC_NAME,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    attemptId: row.attemptId,
    status: row.status,
    takerAddress: row.takerAddress,
    inputMint: row.inputMint,
    outputMint: row.outputMint,
    amountRaw: row.amountRaw,
    executionCandidateFingerprint: row.executionCandidateFingerprint,
    compiledMessageSha256: row.compiledMessageSha256,
    expectedSignature: row.expectedSignature,
    rpcReturnedSignature: row.rpcReturnedSignature,
    signedWireSha256: row.signedWireSha256,
    confirmationStatus:
      row.confirmationStatus === 'processed' ||
      row.confirmationStatus === 'confirmed' ||
      row.confirmationStatus === 'finalized'
        ? row.confirmationStatus
        : null,
    slot: row.slot,
    rpcEstimatedTransactionFeeLamports: row.rpcEstimatedTransactionFeeLamports,
    actualTransactionFeeLamports: row.actualTransactionFeeLamports,
    actualOutputRaw: row.actualOutputRaw,
    lastValidBlockHeight: row.lastValidBlockHeight,
    walletSigningProofFingerprint: row.walletSigningProofFingerprint,
    liveAttemptFingerprint: row.liveAttemptFingerprint ?? '',
    liveReceiptFingerprint: row.liveReceiptFingerprint,
    failureCode: row.failureCode,
    failureMessage: row.failureMessage,
    sendCount,
    message: publicMessage(row),
  };
  assertPublicValueHasNoWire(report);
  return report;
}

function publicMessage(row: LiveAttemptRow): string {
  if (row.status === 'confirmed' || row.status === 'finalized') {
    return 'Public live receipt only. RPC send success is not by itself confirmation. This is not PnL.';
  }
  return row.failureMessage ?? `Live attempt ended as ${row.status}. Do not automatically resend.`;
}

function mapPostReserveFailure(error: unknown): {
  status: LiveAttemptRow['status'];
  code: LiveError['code'];
  message: string;
} {
  if (error instanceof LiveError) {
    if (error.code === 'signer_mismatch') {
      return { status: 'signer_mismatch', code: error.code, message: error.message };
    }
    if (error.code === 'stale_live_candidate') {
      return { status: 'stale_before_send', code: error.code, message: error.message };
    }
    if (error.code === 'candidate_changed_after_confirmation') {
      return { status: 'candidate_changed_after_confirmation', code: error.code, message: error.message };
    }
    if (error.code === 'daily_limit_exceeded' || error.code === 'daily_attempt_cap' || error.code === 'daily_input_cap') {
      return { status: 'signed', code: error.code, message: error.message };
    }
    if (error.code === 'low_sol_balance' || error.code === 'rpc_fee_unavailable') {
      return { status: 'cancelled_before_sign', code: error.code, message: error.message };
    }
    if (error.code === 'persist_failed_before_send') {
      return { status: 'signed', code: error.code, message: error.message };
    }
    return { status: 'cancelled_before_sign', code: error.code, message: error.message };
  }
  if (error instanceof WalletError) {
    if (error.code === 'signer_address_mismatch') {
      return { status: 'signer_mismatch', code: 'signer_mismatch', message: error.message };
    }
    if (error.code === 'secret_input_cancelled' || error.code === 'interactive_tty_required') {
      return { status: 'cancelled_before_sign', code: 'confirmation_cancelled', message: error.message };
    }
    return { status: 'cancelled_before_sign', code: 'live_operation_failed', message: error.message };
  }
  return {
    status: 'cancelled_before_sign',
    code: 'live_operation_failed',
    message: error instanceof Error ? error.message : 'Live signing failed before send.',
  };
}
