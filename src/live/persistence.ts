import type { DatabaseSync } from 'node:sqlite';
import { LIVE_BROADCAST_RISK_STATUSES, LIVE_UNRESOLVED_STATUSES } from './constants.js';
import { LiveError } from './errors.js';
import { assertDailyCaps, utcDayEndMs, utcDayKey, utcDayStartMs } from './limits.js';
import { isBroadcastRiskStatus } from './state.js';
import type { LiveAttemptRow, LiveAttemptStatus, LiveDailyUsage } from './types.js';

export type LiveAttemptInsert = Omit<LiveAttemptRow, 'updatedAtMs' | 'liveReceiptFingerprint'> & {
  broadcastRiskAtMs?: number | null;
  signedWireSha256?: string | null;
  rpcEstimatedTransactionFeeLamports?: string | null;
  actualTransactionFeeLamports?: string | null;
};

export type LiveAttemptStore = {
  reserve(row: LiveAttemptInsert): LiveAttemptRow;
  update(attemptId: string, patch: Partial<LiveAttemptRow>): LiveAttemptRow;
  enterBroadcastSubmitting(attemptId: string, nowMs: number): LiveAttemptRow;
  getByCandidate(executionCandidateFingerprint: string): LiveAttemptRow | null;
  getById(attemptId: string): LiveAttemptRow | null;
  getOldestUnresolved(): LiveAttemptRow | null;
  listRecent(limit: number): LiveAttemptRow[];
  dailyUsage(takerAddress: string, nowMs: number): LiveDailyUsage;
};

export function createLiveAttemptStore(database: DatabaseSync): LiveAttemptStore {
  const store: LiveAttemptStore = {
    reserve(row) {
      try {
        database
          .prepare(
            `INSERT INTO live_execution_attempts (
              attempt_id, live_spec_version, live_definition_fingerprint, created_at_ms, updated_at_ms,
              taker_address, input_mint, output_mint, amount_raw,
              execution_definition_fingerprint, execution_intent_fingerprint, jupiter_build_fingerprint,
              execution_candidate_fingerprint, compiled_message_sha256,
              wallet_definition_fingerprint, wallet_signer_fingerprint, wallet_signing_proof_fingerprint,
              status, expected_signature, rpc_returned_signature, signed_wire_sha256, last_valid_block_height,
              broadcast_risk_at_ms, submitted_at_ms, confirmed_at_ms, confirmation_status, slot,
              rpc_estimated_transaction_fee_lamports, actual_transaction_fee_lamports, actual_output_raw,
              failure_code, failure_message, live_attempt_fingerprint, live_receipt_fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            row.attemptId,
            row.liveSpecVersion,
            row.liveDefinitionFingerprint,
            row.createdAtMs,
            row.createdAtMs,
            row.takerAddress,
            row.inputMint,
            row.outputMint,
            row.amountRaw,
            row.executionDefinitionFingerprint,
            row.executionIntentFingerprint,
            row.jupiterBuildFingerprint,
            row.executionCandidateFingerprint,
            row.compiledMessageSha256,
            row.walletDefinitionFingerprint,
            row.walletSignerFingerprint,
            row.walletSigningProofFingerprint,
            row.status,
            row.expectedSignature,
            row.rpcReturnedSignature,
            row.signedWireSha256 ?? null,
            row.lastValidBlockHeight,
            row.broadcastRiskAtMs ?? null,
            row.submittedAtMs,
            row.confirmedAtMs,
            row.confirmationStatus,
            row.slot,
            row.rpcEstimatedTransactionFeeLamports ?? null,
            row.actualTransactionFeeLamports ?? null,
            row.actualOutputRaw,
            row.failureCode,
            row.failureMessage,
            row.liveAttemptFingerprint,
            null,
          );
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          throw new LiveError(
            'This exact e14 candidate already has a live-attempt reservation. duplicate_live_candidate. No sign and no send.',
            { code: 'duplicate_live_candidate' },
          );
        }
        throw error;
      }
      const stored = store.getById(row.attemptId);
      if (stored === null) {
        throw new LiveError('Live reservation could not be read back.');
      }
      return stored;
    },

    update(attemptId, patch) {
      const current = store.getById(attemptId);
      if (current === null) {
        throw new LiveError('Live attempt was not found.');
      }
      const next: LiveAttemptRow = {
        ...current,
        ...patch,
        attemptId,
        updatedAtMs: patch.updatedAtMs ?? current.updatedAtMs,
      };
      database
        .prepare(
          `UPDATE live_execution_attempts SET
            updated_at_ms = ?,
            wallet_definition_fingerprint = ?,
            wallet_signer_fingerprint = ?,
            wallet_signing_proof_fingerprint = ?,
            status = ?,
            expected_signature = ?,
            rpc_returned_signature = ?,
            signed_wire_sha256 = ?,
            broadcast_risk_at_ms = ?,
            submitted_at_ms = ?,
            confirmed_at_ms = ?,
            confirmation_status = ?,
            slot = ?,
            rpc_estimated_transaction_fee_lamports = ?,
            actual_transaction_fee_lamports = ?,
            actual_output_raw = ?,
            failure_code = ?,
            failure_message = ?,
            live_attempt_fingerprint = ?,
            live_receipt_fingerprint = ?
          WHERE attempt_id = ?`,
        )
        .run(
          next.updatedAtMs,
          next.walletDefinitionFingerprint,
          next.walletSignerFingerprint,
          next.walletSigningProofFingerprint,
          next.status,
          next.expectedSignature,
          next.rpcReturnedSignature,
          next.signedWireSha256,
          next.broadcastRiskAtMs,
          next.submittedAtMs,
          next.confirmedAtMs,
          next.confirmationStatus,
          next.slot,
          next.rpcEstimatedTransactionFeeLamports,
          next.actualTransactionFeeLamports,
          next.actualOutputRaw,
          next.failureCode,
          next.failureMessage,
          next.liveAttemptFingerprint,
          next.liveReceiptFingerprint,
          attemptId,
        );
      const stored = store.getById(attemptId);
      if (stored === null) {
        throw new LiveError('Live attempt update could not be read back.');
      }
      return stored;
    },

    enterBroadcastSubmitting(attemptId, nowMs) {
      database.exec('BEGIN IMMEDIATE');
      try {
        const current = store.getById(attemptId);
        if (current === null) {
          throw new LiveError('Live attempt was not found.', { code: 'persist_failed_before_send' });
        }
        if (current.status !== 'signed') {
          throw new LiveError(
            'l16_v1 will not enter broadcast_submitting unless the attempt is still signed and unsent.',
            { code: 'persist_failed_before_send' },
          );
        }
        if (current.expectedSignature === null || current.signedWireSha256 === null) {
          throw new LiveError(
            'l16_v1 refuses send when expected txid or signed-wire SHA-256 was not durably stored.',
            { code: 'persist_failed_before_send' },
          );
        }
        const usage = readDailyUsage(database, current.takerAddress, nowMs);
        try {
          assertDailyCaps(usage, BigInt(current.amountRaw));
        } catch (error: unknown) {
          if (error instanceof LiveError) {
            throw new LiveError(error.message, { code: 'daily_limit_exceeded', cause: error });
          }
          throw error;
        }
        database
          .prepare(
            `UPDATE live_execution_attempts SET
              status = ?,
              broadcast_risk_at_ms = ?,
              updated_at_ms = ?
            WHERE attempt_id = ? AND status = 'signed'`,
          )
          .run('broadcast_submitting', nowMs, nowMs, attemptId);
        database.exec('COMMIT');
      } catch (error: unknown) {
        try {
          database.exec('ROLLBACK');
        } catch {
          // The write transaction is already closed or was never opened.
        }
        throw error;
      }
      const stored = store.getById(attemptId);
      if (stored === null || stored.status !== 'broadcast_submitting' || stored.broadcastRiskAtMs === null) {
        throw new LiveError('broadcast_submitting could not be read back after commit.', {
          code: 'persist_failed_before_send',
        });
      }
      return stored;
    },

    getByCandidate(executionCandidateFingerprint) {
      const row = database
        .prepare('SELECT * FROM live_execution_attempts WHERE execution_candidate_fingerprint = ?')
        .get(executionCandidateFingerprint);
      return row === undefined ? null : mapRow(row);
    },

    getById(attemptId) {
      const row = database.prepare('SELECT * FROM live_execution_attempts WHERE attempt_id = ?').get(attemptId);
      return row === undefined ? null : mapRow(row);
    },

    getOldestUnresolved() {
      const placeholders = LIVE_UNRESOLVED_STATUSES.map(() => '?').join(', ');
      const row = database
        .prepare(
          `SELECT * FROM live_execution_attempts
           WHERE expected_signature IS NOT NULL AND status IN (${placeholders})
           ORDER BY created_at_ms ASC, attempt_id ASC
           LIMIT 1`,
        )
        .get(...LIVE_UNRESOLVED_STATUSES);
      return row === undefined ? null : mapRow(row);
    },

    listRecent(limit) {
      return database
        .prepare(
          `SELECT * FROM live_execution_attempts
           ORDER BY created_at_ms DESC, attempt_id DESC
           LIMIT ?`,
        )
        .all(limit)
        .map(mapRow);
    },

    dailyUsage(takerAddress, nowMs) {
      return readDailyUsage(database, takerAddress, nowMs);
    },
  };
  return store;
}

function readDailyUsage(database: DatabaseSync, takerAddress: string, nowMs: number): LiveDailyUsage {
  const start = utcDayStartMs(nowMs);
  const end = utcDayEndMs(nowMs);
  const placeholders = LIVE_BROADCAST_RISK_STATUSES.map(() => '?').join(', ');
  const rows = database
    .prepare(
      `SELECT amount_raw FROM live_execution_attempts
       WHERE taker_address = ?
         AND broadcast_risk_at_ms IS NOT NULL
         AND broadcast_risk_at_ms >= ?
         AND broadcast_risk_at_ms < ?
         AND status IN (${placeholders})`,
    )
    .all(takerAddress, start, end, ...LIVE_BROADCAST_RISK_STATUSES);
  let inputLamports = 0n;
  for (const row of rows) {
    const amount = String(row['amount_raw'] ?? '0');
    inputLamports += BigInt(amount);
  }
  return {
    utcDay: utcDayKey(nowMs),
    attemptCount: rows.length,
    inputLamports,
  };
}

function mapRow(row: Record<string, unknown>): LiveAttemptRow {
  return {
    attemptId: String(row['attempt_id']),
    liveSpecVersion: String(row['live_spec_version']),
    liveDefinitionFingerprint: String(row['live_definition_fingerprint']),
    createdAtMs: Number(row['created_at_ms']),
    updatedAtMs: Number(row['updated_at_ms']),
    takerAddress: String(row['taker_address']),
    inputMint: String(row['input_mint']),
    outputMint: String(row['output_mint']),
    amountRaw: String(row['amount_raw']),
    executionDefinitionFingerprint: String(row['execution_definition_fingerprint']),
    executionIntentFingerprint: String(row['execution_intent_fingerprint']),
    jupiterBuildFingerprint: String(row['jupiter_build_fingerprint']),
    executionCandidateFingerprint: String(row['execution_candidate_fingerprint']),
    compiledMessageSha256: String(row['compiled_message_sha256']),
    walletDefinitionFingerprint: asNullableString(row['wallet_definition_fingerprint']),
    walletSignerFingerprint: asNullableString(row['wallet_signer_fingerprint']),
    walletSigningProofFingerprint: asNullableString(row['wallet_signing_proof_fingerprint']),
    status: row['status'] as LiveAttemptStatus,
    expectedSignature: asNullableString(row['expected_signature']),
    rpcReturnedSignature: asNullableString(row['rpc_returned_signature']),
    signedWireSha256: asNullableString(row['signed_wire_sha256']),
    lastValidBlockHeight: String(row['last_valid_block_height']),
    broadcastRiskAtMs: asNullableNumber(row['broadcast_risk_at_ms']),
    submittedAtMs: asNullableNumber(row['submitted_at_ms']),
    confirmedAtMs: asNullableNumber(row['confirmed_at_ms']),
    confirmationStatus: asNullableString(row['confirmation_status']),
    slot: asNullableString(row['slot']),
    rpcEstimatedTransactionFeeLamports: asNullableString(row['rpc_estimated_transaction_fee_lamports']),
    actualTransactionFeeLamports: asNullableString(row['actual_transaction_fee_lamports']),
    actualOutputRaw: asNullableString(row['actual_output_raw']),
    failureCode: asNullableString(row['failure_code']),
    failureMessage: asNullableString(row['failure_message']),
    liveAttemptFingerprint: asNullableString(row['live_attempt_fingerprint']),
    liveReceiptFingerprint: asNullableString(row['live_receipt_fingerprint']),
  };
}

function asNullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return value.toString();
  }
  throw new LiveError('Unexpected live-attempt column type.');
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string' && /^-?\d+$/.test(value)) {
    return Number(value);
  }
  throw new LiveError('Unexpected live-attempt numeric column type.');
}

function isUniqueViolation(error: unknown): boolean {
  const message = error instanceof Error ? error.message : 'constraint error';
  return /UNIQUE|unique constraint/i.test(message);
}

export { isBroadcastRiskStatus };
