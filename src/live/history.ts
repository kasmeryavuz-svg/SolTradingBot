import { LIVE_HISTORY_LIMIT } from './constants.js';
import type { LiveAttemptStore } from './persistence.js';
import type { LiveHistoryEntry } from './types.js';

export function executeLiveHistory(store: LiveAttemptStore, limit = LIVE_HISTORY_LIMIT): LiveHistoryEntry[] {
  return store.listRecent(limit).map((row) => ({
    attemptId: row.attemptId,
    createdAtMs: row.createdAtMs,
    inputMint: row.inputMint,
    outputMint: row.outputMint,
    amountRaw: row.amountRaw,
    executionCandidateFingerprint: row.executionCandidateFingerprint,
    expectedSignature: row.expectedSignature,
    status: row.status,
    slot: row.slot,
    rpcEstimatedTransactionFeeLamports: row.rpcEstimatedTransactionFeeLamports,
    actualTransactionFeeLamports: row.actualTransactionFeeLamports,
    actualOutputRaw: row.actualOutputRaw,
  }));
}
