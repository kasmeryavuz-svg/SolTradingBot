import { LIVE_GET_TRANSACTION_COMMITMENT, LIVE_RECONCILE_SEARCH_TRANSACTION_HISTORY, LIVE_SPEC_NAME, LIVE_SPEC_VERSION } from './constants.js';
import { trackExpectedSignature } from './confirmation-tracker.js';
import { LiveError } from './errors.js';
import { LIVE_DEFINITION_FINGERPRINT, fingerprintLiveReceipt } from './identity.js';
import type { LiveAttemptStore } from './persistence.js';
import { verifyConfirmedReceipt } from './receipt.js';
import { deriveTakerUsdcOutputRaw } from './receipt.js';
import { assertPublicValueHasNoWire } from './sanitize.js';
import type { LiveAttemptRow, LiveClock, LiveConfirmationRpc, LiveReceiptReport } from './types.js';

export async function executeLiveReconcile(input: {
  store: LiveAttemptStore;
  liveRpc: LiveConfirmationRpc;
  clock?: LiveClock;
  nowMs?: () => number;
  signal?: AbortSignal;
}): Promise<LiveReceiptReport> {
  const nowMs = input.nowMs ?? Date.now;
  const row = input.store.getOldestUnresolved();
  if (row === null || row.expectedSignature === null) {
    throw new LiveError('No unresolved live attempt with a stored expected signature.', {
      code: 'nothing_to_reconcile',
    });
  }

  const tracked = await trackExpectedSignature({
    rpc: input.liveRpc,
    expectedSignature: row.expectedSignature,
    lastValidBlockHeight: BigInt(row.lastValidBlockHeight),
    searchTransactionHistory: LIVE_RECONCILE_SEARCH_TRANSACTION_HISTORY,
    ...(input.clock === undefined ? {} : { clock: input.clock }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });

  let next = input.store.update(row.attemptId, {
    status: tracked.status,
    confirmationStatus: tracked.confirmationStatus,
    slot: tracked.slot,
    failureMessage: tracked.message,
    failureCode:
      tracked.status === 'confirmed' || tracked.status === 'finalized' ? row.failureCode : tracked.status,
    updatedAtMs: nowMs(),
  });

  if (tracked.status === 'confirmed' || tracked.status === 'finalized') {
    next = await applyReconcileReceipt({
      store: input.store,
      rpc: input.liveRpc,
      row: next,
      trackedStatus: tracked.status,
      trackedErr: tracked.err,
      confirmationStatus: tracked.confirmationStatus,
      nowMs: nowMs(),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  }

  return publicReconcileReceipt(next);
}

async function applyReconcileReceipt(input: {
  store: LiveAttemptStore;
  rpc: LiveConfirmationRpc;
  row: LiveAttemptRow;
  trackedStatus: 'confirmed' | 'finalized';
  trackedErr: unknown;
  confirmationStatus: string | null;
  nowMs: number;
  signal?: AbortSignal;
}): Promise<LiveAttemptRow> {
  let receipt;
  try {
    receipt = await input.rpc.getTransaction(input.row.expectedSignature ?? '', {
      commitment: input.trackedStatus === 'finalized' ? 'finalized' : LIVE_GET_TRANSACTION_COMMITMENT,
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
          : 'getTransaction failed during reconcile. Chain confirmation is preserved. Do not resend.',
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

  if (input.row.signedWireSha256 !== null) {
    try {
      const verified = verifyConfirmedReceipt({
        receipt,
        localSignedWireSha256: input.row.signedWireSha256,
        expectedSignature: input.row.expectedSignature ?? '',
        takerAddress: input.row.takerAddress,
        minimumOutputRaw: input.row.actualOutputRaw ?? '0',
        requireSuccess: true,
        statusErr: input.trackedErr,
      });
      const nextStatus = verified.feeAnomaly ? 'receipt_fee_anomaly' : input.trackedStatus;
      return input.store.update(input.row.attemptId, {
        status: nextStatus,
        confirmedAtMs: input.nowMs,
        slot: verified.slot,
        actualTransactionFeeLamports: verified.feeLamports?.toString() ?? null,
        actualOutputRaw: verified.actualOutputRaw,
        failureCode: verified.feeAnomaly ? 'receipt_fee_anomaly' : input.row.failureCode,
        liveReceiptFingerprint: fingerprintLiveReceipt({
          liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
          executionCandidateFingerprint: input.row.executionCandidateFingerprint,
          walletSigningProofFingerprint: input.row.walletSigningProofFingerprint,
          expectedSignature: input.row.expectedSignature,
          rpcReturnedSignature: input.row.rpcReturnedSignature,
          signedWireSha256: input.row.signedWireSha256,
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
        (error.code === 'confirmation_integrity_error' || error.code === 'receipt_integrity_error')
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

  const actualOutputRaw = deriveTakerUsdcOutputRaw(
    receipt.preTokenBalances,
    receipt.postTokenBalances,
    input.row.takerAddress,
  );
  return input.store.update(input.row.attemptId, {
    status: input.trackedStatus,
    confirmedAtMs: input.nowMs,
    slot: receipt.slot,
    actualTransactionFeeLamports: receipt.feeLamports?.toString() ?? input.row.actualTransactionFeeLamports,
    actualOutputRaw,
    liveReceiptFingerprint: fingerprintLiveReceipt({
      liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
      executionCandidateFingerprint: input.row.executionCandidateFingerprint,
      walletSigningProofFingerprint: input.row.walletSigningProofFingerprint,
      expectedSignature: input.row.expectedSignature,
      rpcReturnedSignature: input.row.rpcReturnedSignature,
      signedWireSha256: input.row.signedWireSha256,
      confirmationStatus: input.confirmationStatus,
      slot: receipt.slot,
      rpcEstimatedTransactionFeeLamports: input.row.rpcEstimatedTransactionFeeLamports,
      actualTransactionFeeLamports: receipt.feeLamports?.toString() ?? null,
      actualOutputRaw,
      status: input.trackedStatus,
    }),
    updatedAtMs: input.nowMs,
  });
}

function publicReconcileReceipt(next: LiveAttemptRow): LiveReceiptReport {
  const report: LiveReceiptReport = {
    specVersion: LIVE_SPEC_VERSION,
    specName: LIVE_SPEC_NAME,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    attemptId: next.attemptId,
    status: next.status,
    takerAddress: next.takerAddress,
    inputMint: next.inputMint,
    outputMint: next.outputMint,
    amountRaw: next.amountRaw,
    executionCandidateFingerprint: next.executionCandidateFingerprint,
    compiledMessageSha256: next.compiledMessageSha256,
    expectedSignature: next.expectedSignature,
    rpcReturnedSignature: next.rpcReturnedSignature,
    signedWireSha256: next.signedWireSha256,
    confirmationStatus:
      next.confirmationStatus === 'processed' ||
      next.confirmationStatus === 'confirmed' ||
      next.confirmationStatus === 'finalized'
        ? next.confirmationStatus
        : null,
    slot: next.slot,
    rpcEstimatedTransactionFeeLamports: next.rpcEstimatedTransactionFeeLamports,
    actualTransactionFeeLamports: next.actualTransactionFeeLamports,
    actualOutputRaw: next.actualOutputRaw,
    lastValidBlockHeight: next.lastValidBlockHeight,
    walletSigningProofFingerprint: next.walletSigningProofFingerprint,
    liveAttemptFingerprint: next.liveAttemptFingerprint ?? '',
    liveReceiptFingerprint: next.liveReceiptFingerprint,
    failureCode: next.failureCode,
    failureMessage: next.failureMessage,
    sendCount: 0,
    message: next.failureMessage ?? `Reconciled public status: ${next.status}. No send was performed.`,
  };
  assertPublicValueHasNoWire(report);
  return report;
}
