import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { aggregateOwners } from './holders.js';
import { REQUIRED_SCHEMA_VERSION, WALLET_INTELLIGENCE_SPEC_VERSION } from './constants.js';
import { WalletIntelligenceError } from './errors.js';
import { formatWalletIntelligenceError } from './sanitize.js';
import type {
  HolderObservation,
  PersistHooks,
  StoredWalletIntelligenceScan,
  WalletIntelligenceScanResult,
  WalletProfile,
} from './types.js';

export function persistWalletIntelligenceScan(
  database: DatabaseSync,
  scan: WalletIntelligenceScanResult,
  options: { createdAtMs?: number; hooks?: PersistHooks } = {},
): StoredWalletIntelligenceScan {
  assertSchema9(database);
  const createdAtMs = options.createdAtMs ?? scan.scanStartedAtMs;
  const hooks = options.hooks ?? {};
  database.exec('BEGIN IMMEDIATE');
  try {
    const scanId = insertScan(database, scan, createdAtMs);
    hooks.afterScanInsert?.(scanId);
    scan.holders.forEach((holder, index) => {
      insertHolder(database, scanId, holder);
      hooks.afterHolderInsert?.(index, scanId);
    });
    scan.profiles.forEach((profile, index) => {
      insertProfile(database, scanId, profile);
      hooks.afterProfileInsert?.(index, scanId);
    });
    database.exec('COMMIT');
    return { ...scan, id: scanId, createdAtMs };
  } catch (error: unknown) {
    try {
      database.exec('ROLLBACK');
    } catch {
      // The failed transaction is already closed or was never opened.
    }
    if (error instanceof WalletIntelligenceError) {
      throw error;
    }
    if (isDuplicateScanConstraint(error)) {
      throw new WalletIntelligenceError(
        'A wallet-intelligence scan with this fingerprint already exists. Duplicate evidence was not inserted.',
        { code: 'duplicate_scan' },
      );
    }
    throw new WalletIntelligenceError(
      `Wallet intelligence scan persistence failed. The local database was rolled back. (${formatWalletIntelligenceError(error)})`,
      { code: 'persistence_failed' },
    );
  }
}

export function loadLatestWalletIntelligenceScan(
  database: DatabaseSync,
  tokenMint: string,
): StoredWalletIntelligenceScan | null {
  assertSchema9(database);
  const row = database
    .prepare(
      `SELECT * FROM wallet_intelligence_scans
       WHERE token_mint = ?
       ORDER BY created_at_ms DESC, id DESC
       LIMIT 1`,
    )
    .get(tokenMint);
  if (row === undefined) {
    return null;
  }
  return hydrateScan(database, row);
}

export function loadWalletIntelligenceScanHistory(
  database: DatabaseSync,
  tokenMint: string,
): StoredWalletIntelligenceScan[] {
  assertSchema9(database);
  const rows = database
    .prepare(
      `SELECT * FROM wallet_intelligence_scans
       WHERE token_mint = ?
       ORDER BY created_at_ms ASC, id ASC`,
    )
    .all(tokenMint);
  return rows.map((row) => hydrateScan(database, row));
}

export function countWalletIntelligenceRows(database: DatabaseSync): {
  scans: number;
  holders: number;
  profiles: number;
} {
  return {
    scans: asNumber(database.prepare('SELECT COUNT(*) AS count FROM wallet_intelligence_scans').get()?.['count']),
    holders: asNumber(
      database.prepare('SELECT COUNT(*) AS count FROM wallet_intelligence_holder_observations').get()?.['count'],
    ),
    profiles: asNumber(
      database.prepare('SELECT COUNT(*) AS count FROM wallet_intelligence_wallet_profiles').get()?.['count'],
    ),
  };
}

function assertSchema9(database: DatabaseSync): void {
  const row = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
  const version = row === undefined || row['version'] === null ? 0 : Number(row['version']);
  if (version !== REQUIRED_SCHEMA_VERSION) {
    throw new WalletIntelligenceError(
      `Wallet intelligence requires schema ${String(REQUIRED_SCHEMA_VERSION)}. Found ${String(version)}. Run npm run db:init.`,
      { code: 'schema_mismatch' },
    );
  }
}

function insertScan(database: DatabaseSync, scan: WalletIntelligenceScanResult, createdAtMs: number): number {
  const result = database
    .prepare(
      `INSERT INTO wallet_intelligence_scans (
        spec_version, spec_fingerprint, token_mint, token_program, mint_decimals, scan_started_at_ms,
        holder_context_slot, holder_resolution_context_slot, owner_classification_context_slot,
        top_token_accounts_observed, unique_owners_observed, system_wallet_candidates_observed,
        program_or_executable_owners_observed, unknown_owners_observed, analyzed_wallet_count,
        history_window_start_ms, history_window_end_ms, history_tx_cap, history_censored_wallet_count,
        observed_fresh_7d_count, observed_young_30d_count, observed_established_30d_plus_count,
        observed_age_unknown_count, observed_fresh_7d_fraction_bps, observed_young_30d_fraction_bps,
        program_or_executable_observed_top20_balance_bps, unknown_observed_top20_balance_bps,
        median_observed_history_tx_count_30d, median_active_days_observed_30d, median_unique_mints_touched_30d,
        scan_fingerprint, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      scan.specVersion,
      scan.specFingerprint,
      scan.tokenMint,
      scan.tokenProgram,
      scan.mintDecimals,
      scan.scanStartedAtMs,
      scan.holderContextSlot,
      scan.holderResolutionContextSlot,
      scan.ownerClassificationContextSlot,
      scan.cohort.topTokenAccountsObserved,
      scan.cohort.uniqueOwnersObserved,
      scan.cohort.systemWalletCandidatesObserved,
      scan.cohort.programOrExecutableOwnersObserved,
      scan.cohort.unknownOwnersObserved,
      scan.cohort.analyzedWalletCount,
      scan.historyWindowStartMs,
      scan.historyWindowEndMs,
      scan.historyTxCap,
      scan.cohort.historyCensoredWalletCount,
      scan.cohort.observedFresh7dCount,
      scan.cohort.observedYoung30dCount,
      scan.cohort.observedEstablished30dPlusCount,
      scan.cohort.observedAgeUnknownCount,
      scan.cohort.observedFresh7dFractionBps,
      scan.cohort.observedYoung30dFractionBps,
      scan.cohort.programOrExecutableObservedTop20BalanceBps,
      scan.cohort.unknownObservedTop20BalanceBps,
      scan.cohort.medianObservedHistoryTxCount30d,
      scan.cohort.medianActiveDaysObserved30d,
      scan.cohort.medianUniqueMintsTouched30d,
      scan.scanFingerprint,
      createdAtMs,
    );
  return Number(result.lastInsertRowid);
}

function insertHolder(database: DatabaseSync, scanId: number, holder: HolderObservation): void {
  database
    .prepare(
      `INSERT INTO wallet_intelligence_holder_observations (
        scan_id, rank, token_account, amount_raw, decimals, owner_address, owner_kind,
        owner_account_program, owner_executable
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      scanId,
      holder.rank,
      holder.tokenAccount,
      holder.amountRaw,
      holder.decimals,
      holder.ownerAddress,
      holder.ownerKind,
      holder.ownerAccountProgram,
      holder.ownerExecutable === null ? null : holder.ownerExecutable ? 1 : 0,
    );
}

function insertProfile(database: DatabaseSync, scanId: number, profile: WalletProfile): void {
  database
    .prepare(
      `INSERT INTO wallet_intelligence_wallet_profiles (
        scan_id, wallet_address, observed_top20_aggregate_raw_amount, observed_top20_balance_share_bps,
        top20_token_account_count_owned, best_top20_rank, owner_kind, first_observed_activity_slot,
        first_observed_activity_at_ms, observed_age_class, history_window_start_ms, history_window_end_ms,
        history_transactions_observed, history_censored, active_days_observed_30d,
        unique_mints_with_balance_change_30d, unique_mints_touched_30d_json,
        positive_token_delta_tx_count_30d, negative_token_delta_tx_count_30d,
        bidirectional_token_delta_tx_count_30d, target_mint_positive_delta_tx_count_30d,
        target_mint_negative_delta_tx_count_30d, target_mint_net_raw_delta_30d,
        incomplete_delta_tx_count_30d, history_evidence_sha256, profile_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      scanId,
      profile.walletAddress,
      profile.observedTop20AggregateRawAmount,
      profile.observedTop20BalanceShareBps,
      profile.top20TokenAccountCountOwned,
      profile.bestTop20Rank,
      profile.ownerKind,
      profile.firstObservedActivitySlot,
      profile.firstObservedActivityAtMs,
      profile.observedAgeClass,
      profile.historyWindowStartMs,
      profile.historyWindowEndMs,
      profile.historyTransactionsObserved,
      profile.historyCensored ? 1 : 0,
      profile.activeDaysObserved30d,
      profile.uniqueMintsWithBalanceChange30d,
      JSON.stringify(profile.uniqueMintsTouched30d),
      profile.positiveTokenDeltaTxCount30d,
      profile.negativeTokenDeltaTxCount30d,
      profile.bidirectionalTokenDeltaTxCount30d,
      profile.targetMintPositiveDeltaTxCount30d,
      profile.targetMintNegativeDeltaTxCount30d,
      profile.targetMintNetRawDelta30d,
      profile.incompleteDeltaTxCount30d,
      profile.historyEvidenceSha256,
      profile.profileFingerprint,
    );
}

function hydrateScan(database: DatabaseSync, row: Record<string, SQLOutputValue>): StoredWalletIntelligenceScan {
  const id = asNumber(row['id']);
  const holders = database
    .prepare(
      `SELECT * FROM wallet_intelligence_holder_observations WHERE scan_id = ? ORDER BY rank ASC`,
    )
    .all(id)
    .map(mapHolder);
  const profiles = database
    .prepare(
      `SELECT * FROM wallet_intelligence_wallet_profiles WHERE scan_id = ? ORDER BY best_top20_rank ASC, wallet_address ASC`,
    )
    .all(id)
    .map(mapProfile);
  return {
    id,
    specVersion: WALLET_INTELLIGENCE_SPEC_VERSION,
    specName: 'public_onchain_holder_cohort_intelligence',
    specFingerprint: asString(row['spec_fingerprint']),
    tokenMint: asString(row['token_mint']),
    tokenProgram: asString(row['token_program']) as StoredWalletIntelligenceScan['tokenProgram'],
    mintDecimals: asNumber(row['mint_decimals']),
    scanStartedAtMs: asNumber(row['scan_started_at_ms']),
    holderContextSlot: asNumber(row['holder_context_slot']),
    holderResolutionContextSlot: asNumber(row['holder_resolution_context_slot']),
    ownerClassificationContextSlot: asNumber(row['owner_classification_context_slot']),
    historyWindowStartMs: asNumber(row['history_window_start_ms']),
    historyWindowEndMs: asNumber(row['history_window_end_ms']),
    historyTxCap: asNumber(row['history_tx_cap']),
    holders,
    owners: aggregateOwners(holders),
    profiles,
    cohort: {
      topTokenAccountsObserved: asNumber(row['top_token_accounts_observed']),
      uniqueOwnersObserved: asNumber(row['unique_owners_observed']),
      systemWalletCandidatesObserved: asNumber(row['system_wallet_candidates_observed']),
      programOrExecutableOwnersObserved: asNumber(row['program_or_executable_owners_observed']),
      unknownOwnersObserved: asNumber(row['unknown_owners_observed']),
      analyzedWalletCount: asNumber(row['analyzed_wallet_count']),
      historyCensoredWalletCount: asNumber(row['history_censored_wallet_count']),
      observedFresh7dCount: asNumber(row['observed_fresh_7d_count']),
      observedYoung30dCount: asNumber(row['observed_young_30d_count']),
      observedEstablished30dPlusCount: asNumber(row['observed_established_30d_plus_count']),
      observedAgeUnknownCount: asNumber(row['observed_age_unknown_count']),
      observedFresh7dFractionBps: asNumber(row['observed_fresh_7d_fraction_bps']),
      observedYoung30dFractionBps: asNumber(row['observed_young_30d_fraction_bps']),
      programOrExecutableObservedTop20BalanceBps: asNumber(row['program_or_executable_observed_top20_balance_bps']),
      unknownObservedTop20BalanceBps: asNumber(row['unknown_observed_top20_balance_bps']),
      medianObservedHistoryTxCount30d: asNullableNumber(row['median_observed_history_tx_count_30d']),
      medianActiveDaysObserved30d: asNullableNumber(row['median_active_days_observed_30d']),
      medianUniqueMintsTouched30d: asNullableNumber(row['median_unique_mints_touched_30d']),
    },
    scanFingerprint: asString(row['scan_fingerprint']),
    createdAtMs: asNumber(row['created_at_ms']),
  };
}

function mapHolder(row: Record<string, SQLOutputValue>): HolderObservation {
  return {
    rank: asNumber(row['rank']),
    tokenAccount: asString(row['token_account']),
    amountRaw: asString(row['amount_raw']),
    decimals: asNumber(row['decimals']),
    ownerAddress: asNullableString(row['owner_address']),
    ownerKind: asString(row['owner_kind']) as HolderObservation['ownerKind'],
    ownerAccountProgram: asNullableString(row['owner_account_program']),
    ownerExecutable: asNullableBoolean(row['owner_executable']),
  };
}

function mapProfile(row: Record<string, SQLOutputValue>): WalletProfile {
  return {
    walletAddress: asString(row['wallet_address']),
    observedTop20AggregateRawAmount: asString(row['observed_top20_aggregate_raw_amount']),
    observedTop20BalanceShareBps: asNumber(row['observed_top20_balance_share_bps']),
    top20TokenAccountCountOwned: asNumber(row['top20_token_account_count_owned']),
    bestTop20Rank: asNumber(row['best_top20_rank']),
    ownerKind: 'SYSTEM_OWNED_NON_EXECUTABLE',
    firstObservedActivitySlot: asNullableNumber(row['first_observed_activity_slot']),
    firstObservedActivityAtMs: asNullableNumber(row['first_observed_activity_at_ms']),
    observedAgeClass: asString(row['observed_age_class']) as WalletProfile['observedAgeClass'],
    historyWindowStartMs: asNumber(row['history_window_start_ms']),
    historyWindowEndMs: asNumber(row['history_window_end_ms']),
    historyTransactionsObserved: asNumber(row['history_transactions_observed']),
    historyCensored: asNumber(row['history_censored']) === 1,
    activeDaysObserved30d: asNumber(row['active_days_observed_30d']),
    uniqueMintsWithBalanceChange30d: asNumber(row['unique_mints_with_balance_change_30d']),
    uniqueMintsTouched30d: JSON.parse(asString(row['unique_mints_touched_30d_json'])) as string[],
    positiveTokenDeltaTxCount30d: asNumber(row['positive_token_delta_tx_count_30d']),
    negativeTokenDeltaTxCount30d: asNumber(row['negative_token_delta_tx_count_30d']),
    bidirectionalTokenDeltaTxCount30d: asNumber(row['bidirectional_token_delta_tx_count_30d']),
    targetMintPositiveDeltaTxCount30d: asNumber(row['target_mint_positive_delta_tx_count_30d']),
    targetMintNegativeDeltaTxCount30d: asNumber(row['target_mint_negative_delta_tx_count_30d']),
    targetMintNetRawDelta30d: asString(row['target_mint_net_raw_delta_30d']),
    incompleteDeltaTxCount30d: asNumber(row['incomplete_delta_tx_count_30d']),
    historyEvidenceSha256: asString(row['history_evidence_sha256']),
    profileFingerprint: asString(row['profile_fingerprint']),
  };
}

function isDuplicateScanConstraint(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error);
  return /UNIQUE constraint failed: wallet_intelligence_scans\.scan_fingerprint/i.test(text);
}

function asNumber(value: SQLOutputValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  throw new WalletIntelligenceError('Database returned an unexpected number.', { code: 'persistence_failed' });
}

function asNullableNumber(value: SQLOutputValue | undefined): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

function asString(value: SQLOutputValue | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new WalletIntelligenceError('Database returned unexpected text.', { code: 'persistence_failed' });
}

function asNullableString(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asNullableBoolean(value: SQLOutputValue | undefined): boolean | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asNumber(value) === 1;
}
