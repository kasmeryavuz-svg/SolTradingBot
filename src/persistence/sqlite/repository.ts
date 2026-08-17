import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { DatabaseConfig } from '../../config/types.js';
import type { DiscoveryCandidate, DiscoveryRunResult, DiscoverySource } from '../../discovery/types.js';
import type { MarketSnapshot } from '../../market-data/types.js';
import type {
  HighestFindingSeverity,
  RiskCheckName,
  RiskCheckResult,
  RiskFinding,
  RiskFindingCategory,
  RiskFindingSeverity,
  RiskConfidence,
  TokenExtensionObservation,
  TokenProgramKind,
  TokenRiskReport,
} from '../../risk/types.js';
import { clampHistoryLimit } from '../limits.js';
import type { PersistenceRepository } from '../repository.js';
import type {
  PersistenceIntegrity,
  PersistenceStats,
  RecordedRiskScan,
  RecordedRun,
  StoredObservation,
  StoredRiskScanSummary,
  StoredSourceResult,
  StoredToken,
  TokenHistory,
  TokenRiskHistory,
} from '../types.js';
import { PersistenceError } from '../types.js';
import {
  assertPersistableCandidate,
  assertPersistableRiskReport,
  assertPersistableSnapshot,
} from '../validate.js';
import { openSqliteDatabase, readPragmaValue } from './database.js';
import { applyMigrations, currentSchemaVersion } from './migrations.js';
import { interpretIntegrityPragmas } from './integrity.js';
import {
  asNumber,
  asNullableNumber,
  asNullableString,
  asString,
  mapObservationRow,
  mapSnapshotRow,
  mapSourceResultRow,
  mapTokenRow,
} from './row-mappers.js';

type Statements = {
  getToken: StatementSync;
  insertToken: StatementSync;
  updateTokenTimes: StatementSync;
  insertRun: StatementSync;
  insertSourceResult: StatementSync;
  insertObservation: StatementSync;
  insertObservationSource: StatementSync;
  insertLink: StatementSync;
  insertSnapshot: StatementSync;
  countTokens: StatementSync;
  countRuns: StatementSync;
  countObservations: StatementSync;
  countSnapshots: StatementSync;
  observationBounds: StatementSync;
  recentObservations: StatementSync;
  observationSources: StatementSync;
  sourceResultsForRun: StatementSync;
  marketHistory: StatementSync;
  snapshotOwnership: StatementSync;
  countSourceResults: StatementSync;
  countObservationSources: StatementSync;
  countLinks: StatementSync;
  countMigrations: StatementSync;
  insertRiskScan: StatementSync;
  insertRiskCheck: StatementSync;
  insertRiskExtension: StatementSync;
  insertRiskAccount: StatementSync;
  insertRiskFinding: StatementSync;
  countRiskScans: StatementSync;
  countRiskChecks: StatementSync;
  countRiskExtensions: StatementSync;
  countRiskAccounts: StatementSync;
  countRiskFindings: StatementSync;
  riskHistory: StatementSync;
  riskChecks: StatementSync;
  riskExtensions: StatementSync;
  riskFindings: StatementSync;
};

export class SqlitePersistenceRepository implements PersistenceRepository {
  private readonly database: DatabaseSync;
  private statements: Statements | null = null;

  constructor(options: { path: string; busyTimeoutMs: number }) {
    this.database = openSqliteDatabase(options);
  }

  initialize(): void {
    try {
      applyMigrations(this.database);
      this.statements = prepareStatements(this.database);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Migration failed. The local database was rolled back.', {
        cause: error,
      });
    }
  }

  recordDiscoveryRun(result: DiscoveryRunResult): RecordedRun {
    return this.transact(() => this.persistDiscoveryRun(result));
  }

  recordDiscoveryRunAndAbort(result: DiscoveryRunResult): void {
    this.transact(() => {
      this.persistDiscoveryRun(result);
      throw new PersistenceError('Test-forced write failure.');
    });
  }

  recordRiskReport(report: TokenRiskReport): RecordedRiskScan {
    return this.transact(() => this.persistRiskReport(report));
  }

  recordRiskReportAndAbort(report: TokenRiskReport): void {
    this.transact(() => {
      this.persistRiskReport(report);
      throw new PersistenceError('Test-forced write failure.');
    });
  }

  recordRiskReportAndAbortAfterChild(report: TokenRiskReport): void {
    this.transact(() => {
      assertPersistableRiskReport(report);
      const statements = this.requireStatements();
      const token = this.upsertToken(report.tokenMint, report.scannedAt, report.scannedAt);
      const inserted = statements.insertRiskScan.run(
        token.id,
        report.scannedAt,
        report.commitment,
        report.tokenProgram,
        report.programOwner,
        report.mintContextSlot,
        report.supplyContextSlot,
        report.largestAccountsContextSlot,
        report.decimals,
        report.supplyRaw,
        report.mintAuthority,
        report.freezeAuthority,
        report.concentration?.top1Bps ?? null,
        report.concentration?.top5Bps ?? null,
        report.concentration?.top10Bps ?? null,
        report.concentration?.top20Bps ?? null,
        report.largestTokenAccounts.length,
        report.dataCompleteness,
        report.highestFindingSeverity,
      );
      const scanId = Number(inserted.lastInsertRowid);
      const check = report.checks[0];
      if (check === undefined) {
        throw new PersistenceError('Risk report is missing checks.');
      }

      statements.insertRiskCheck.run(
        scanId,
        check.check,
        check.ok ? 1 : 0,
        check.contextSlot,
        check.error,
      );
      throw new PersistenceError('Test-forced write failure after child insert.');
    });
  }

  recordMarketSnapshots(snapshots: readonly MarketSnapshot[]): number {
    return this.transact(() => {
      let written = 0;
      for (const snapshot of snapshots) {
        assertPersistableSnapshot(snapshot);
        const token = this.upsertToken(snapshot.tokenMint, snapshot.collectedAt, snapshot.collectedAt);
        written += this.insertSnapshot(token.id, null, snapshot);
      }
      return written;
    });
  }

  getTableCounts(): {
    tokens: number;
    discoveryRuns: number;
    discoverySourceResults: number;
    discoveryObservations: number;
    discoveryObservationSources: number;
    discoveryLinks: number;
    marketSnapshots: number;
    riskScans: number;
    riskScanChecks: number;
    riskScanExtensions: number;
    riskTopTokenAccounts: number;
    riskFindings: number;
    schemaMigrations: number;
  } {
    const statements = this.requireStatements();
    return {
      tokens: asNumber(statements.countTokens.get()?.['count']),
      discoveryRuns: asNumber(statements.countRuns.get()?.['count']),
      discoverySourceResults: asNumber(statements.countSourceResults.get()?.['count']),
      discoveryObservations: asNumber(statements.countObservations.get()?.['count']),
      discoveryObservationSources: asNumber(statements.countObservationSources.get()?.['count']),
      discoveryLinks: asNumber(statements.countLinks.get()?.['count']),
      marketSnapshots: asNumber(statements.countSnapshots.get()?.['count']),
      riskScans: asNumber(statements.countRiskScans.get()?.['count']),
      riskScanChecks: asNumber(statements.countRiskChecks.get()?.['count']),
      riskScanExtensions: asNumber(statements.countRiskExtensions.get()?.['count']),
      riskTopTokenAccounts: asNumber(statements.countRiskAccounts.get()?.['count']),
      riskFindings: asNumber(statements.countRiskFindings.get()?.['count']),
      schemaMigrations: asNumber(statements.countMigrations.get()?.['count']),
    };
  }

  getSnapshotOwnership(tokenMint: string): { collectedAt: string; discoveryObservationId: number | null }[] {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return [];
    }

    return this.requireStatements()
      .snapshotOwnership.all(token.id)
      .map((row) => ({
        collectedAt: asString(row['collected_at']),
        discoveryObservationId: asNullableNumber(row['discovery_observation_id']),
      }));
  }

  getStats(): PersistenceStats {
    const statements = this.requireStatements();
    const bounds = statements.observationBounds.get();

    return {
      schemaVersion: currentSchemaVersion(this.database),
      foreignKeysEnabled: readPragmaValue(this.database, 'foreign_keys') === '1',
      journalMode: readPragmaValue(this.database, 'journal_mode'),
      integrity: this.verifyIntegrity(),
      tokenCount: asNumber(statements.countTokens.get()?.['count']),
      discoveryRunCount: asNumber(statements.countRuns.get()?.['count']),
      discoveryObservationCount: asNumber(statements.countObservations.get()?.['count']),
      marketSnapshotCount: asNumber(statements.countSnapshots.get()?.['count']),
      riskScanCount: asNumber(statements.countRiskScans.get()?.['count']),
      earliestObservationAt: asNullableString(bounds?.['earliest']),
      latestObservationAt: asNullableString(bounds?.['latest']),
    };
  }

  getToken(tokenMint: string): StoredToken | null {
    const row = this.requireStatements().getToken.get(tokenMint);
    return row === undefined ? null : mapTokenRow(row);
  }

  getRecentDiscoveryObservations(limit: number): StoredObservation[] {
    const statements = this.requireStatements();
    const rows = statements.recentObservations.all(clampHistoryLimit(limit));
    return rows.map((row) =>
      mapObservationRow(row, this.readObservationSources(asNumber(row['id']))),
    );
  }

  getSourceResultsForRun(runId: number): StoredSourceResult[] {
    return this.requireStatements()
      .sourceResultsForRun.all(runId)
      .map((row) => mapSourceResultRow(row));
  }

  getRiskHistory(tokenMint: string, limit: number): TokenRiskHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const statements = this.requireStatements();
    const scans = statements.riskHistory.all(token.id, clampHistoryLimit(limit)).map((row) => {
      const scanId = asNumber(row['id']);
      return {
        id: scanId,
        scannedAt: asString(row['scanned_at']),
        tokenProgram: asString(row['token_program']) as TokenProgramKind,
        mintAuthority: asNullableString(row['mint_authority']),
        freezeAuthority: asNullableString(row['freeze_authority']),
        supplyRaw: asNullableString(row['supply_raw']),
        top1Bps: asNullableNumber(row['top1_bps']),
        top5Bps: asNullableNumber(row['top5_bps']),
        highestFindingSeverity: asString(row['highest_finding_severity']) as HighestFindingSeverity,
        findingCodes: this.readRiskFindings(scanId).map((finding) => finding.code),
        checks: this.readRiskChecks(scanId),
        extensions: this.readRiskExtensions(scanId),
        findings: this.readRiskFindings(scanId),
      } satisfies StoredRiskScanSummary;
    });

    return { token, scans };
  }

  getMarketHistory(tokenMint: string, limit: number): TokenHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const rows = this.requireStatements().marketHistory.all(token.id, clampHistoryLimit(limit));
    return {
      token,
      snapshots: rows.map((row) => mapSnapshotRow(row, token.mint)),
    };
  }

  verifyIntegrity(): PersistenceIntegrity {
    try {
      const check = this.database.prepare('PRAGMA quick_check').get();
      const foreignKeys = this.database.prepare('PRAGMA foreign_key_check').all();
      const quickCheck = check === undefined ? '' : String(Object.values(check)[0] ?? '');
      return interpretIntegrityPragmas(quickCheck, foreignKeys.length);
    } catch (error: unknown) {
      throw new PersistenceError('Integrity check failed.', { cause: error });
    }
  }

  close(): void {
    this.database.close();
  }

  private persistRiskReport(report: TokenRiskReport): RecordedRiskScan {
    assertPersistableRiskReport(report);
    const statements = this.requireStatements();
    const token = this.upsertToken(report.tokenMint, report.scannedAt, report.scannedAt);
    const inserted = statements.insertRiskScan.run(
      token.id,
      report.scannedAt,
      report.commitment,
      report.tokenProgram,
      report.programOwner,
      report.mintContextSlot,
      report.supplyContextSlot,
      report.largestAccountsContextSlot,
      report.decimals,
      report.supplyRaw,
      report.mintAuthority,
      report.freezeAuthority,
      report.concentration?.top1Bps ?? null,
      report.concentration?.top5Bps ?? null,
      report.concentration?.top10Bps ?? null,
      report.concentration?.top20Bps ?? null,
      report.largestTokenAccounts.length,
      report.dataCompleteness,
      report.highestFindingSeverity,
    );
    const scanId = Number(inserted.lastInsertRowid);

    for (const check of report.checks) {
      statements.insertRiskCheck.run(
        scanId,
        check.check,
        check.ok ? 1 : 0,
        check.contextSlot,
        check.error,
      );
    }

    for (const [ordinal, extension] of report.extensions.entries()) {
      statements.insertRiskExtension.run(
        scanId,
        ordinal,
        extension.name,
        extension.authority,
        extension.programId,
        extension.state,
        extension.transferFeeBasisPoints,
        extension.maximumFeeRaw,
        extension.parsed ? 1 : 0,
      );
    }

    for (const account of report.largestTokenAccounts) {
      statements.insertRiskAccount.run(
        scanId,
        account.rank,
        account.tokenAccount,
        account.amountRaw,
        account.shareBps,
      );
    }

    for (const finding of report.findings) {
      statements.insertRiskFinding.run(
        scanId,
        finding.code,
        finding.category,
        finding.severity,
        finding.confidence,
        finding.title,
        finding.description,
      );
    }

    return {
      scanId,
      tokenMint: report.tokenMint,
      scannedAt: report.scannedAt,
      tokenInserted: token.inserted,
    };
  }

  private persistDiscoveryRun(result: DiscoveryRunResult): RecordedRun {
    const recordedAt = new Date().toISOString();
    const statements = this.requireStatements();
    const run = statements.insertRun.run(result.observedAt, recordedAt, result.candidates.length);
    const runId = Number(run.lastInsertRowid);

    for (const source of result.sourceResults) {
      statements.insertSourceResult.run(
        runId,
        source.source,
        source.ok ? 1 : 0,
        source.recordCount,
        source.error,
      );
    }

    let tokensInserted = 0;
    let tokensUpdated = 0;
    let observationsWritten = 0;
    let snapshotsWritten = 0;

    for (const candidate of result.candidates) {
      assertPersistableCandidate(candidate);
      const token = this.upsertToken(candidate.tokenMint, candidate.observedAt, recordedAt);
      if (token.inserted) {
        tokensInserted += 1;
      } else {
        tokensUpdated += 1;
      }

      const observationId = this.insertObservation(runId, token.id, candidate);
      observationsWritten += 1;
      snapshotsWritten += this.insertAttachedSnapshot(token.id, observationId, candidate);
    }

    return {
      runId,
      observedAt: result.observedAt,
      recordedAt,
      candidateCount: result.candidates.length,
      tokensInserted,
      tokensUpdated,
      observationsWritten,
      snapshotsWritten,
    };
  }

  private upsertToken(
    mint: string,
    observedAt: string,
    createdAt: string,
  ): { id: number; inserted: boolean } {
    const statements = this.requireStatements();
    const existing = statements.getToken.get(mint);
    if (existing === undefined) {
      const inserted = statements.insertToken.run('solana', mint, observedAt, observedAt, createdAt);
      return { id: Number(inserted.lastInsertRowid), inserted: true };
    }

    const firstObservedAt = minIso(asString(existing['first_observed_at']), observedAt);
    const lastObservedAt = maxIso(asString(existing['last_observed_at']), observedAt);
    statements.updateTokenTimes.run(firstObservedAt, lastObservedAt, asNumber(existing['id']));
    return { id: asNumber(existing['id']), inserted: false };
  }

  private insertObservation(
    runId: number,
    tokenId: number,
    candidate: DiscoveryCandidate,
  ): number {
    const statements = this.requireStatements();
    const inserted = statements.insertObservation.run(
      runId,
      tokenId,
      candidate.observedAt,
      candidate.dexScreenerUrl,
      candidate.description,
      candidate.profileUpdatedAt,
      candidate.boostAmount,
      candidate.boostTotalAmount,
      candidate.marketDataStatus,
    );
    const observationId = Number(inserted.lastInsertRowid);

    for (const source of uniqueSources(candidate.sources)) {
      statements.insertObservationSource.run(observationId, source);
    }

    for (const [ordinal, link] of candidate.links.entries()) {
      statements.insertLink.run(observationId, ordinal, link.type, link.label, link.url);
    }

    return observationId;
  }

  private insertAttachedSnapshot(
    tokenId: number,
    observationId: number,
    candidate: DiscoveryCandidate,
  ): number {
    if (candidate.marketDataStatus !== 'available' || candidate.marketSnapshot === null) {
      return 0;
    }

    return this.insertSnapshot(tokenId, observationId, candidate.marketSnapshot);
  }

  private insertSnapshot(
    tokenId: number,
    observationId: number | null,
    snapshot: MarketSnapshot,
  ): number {
    assertPersistableSnapshot(snapshot);
    const result = this.requireStatements().insertSnapshot.run(
      tokenId,
      observationId,
      snapshot.chain,
      snapshot.tokenName,
      snapshot.tokenSymbol,
      snapshot.dexId,
      snapshot.pairAddress,
      snapshot.quoteTokenMint,
      snapshot.quoteTokenSymbol,
      snapshot.priceUsd,
      snapshot.liquidityUsd,
      snapshot.volume5mUsd,
      snapshot.volume1hUsd,
      snapshot.volume24hUsd,
      snapshot.buys5m,
      snapshot.sells5m,
      snapshot.buys1h,
      snapshot.sells1h,
      snapshot.priceChange5mPct,
      snapshot.priceChange1hPct,
      snapshot.priceChange24hPct,
      snapshot.marketCapUsd,
      snapshot.fdvUsd,
      snapshot.pairCreatedAt,
      snapshot.collectedAt,
    );

    return Number(result.changes) > 0 ? 1 : 0;
  }

  private readRiskChecks(scanId: number): RiskCheckResult[] {
    return this.requireStatements()
      .riskChecks.all(scanId)
      .map((row) => ({
        check: asString(row['check_name']) as RiskCheckName,
        ok: asNumber(row['ok']) === 1,
        contextSlot: asNullableNumber(row['context_slot']),
        error: asNullableString(row['error']),
      }));
  }

  private readRiskExtensions(scanId: number): TokenExtensionObservation[] {
    return this.requireStatements()
      .riskExtensions.all(scanId)
      .map((row) => ({
        name: asString(row['extension_name']),
        rawName: asString(row['extension_name']),
        authority: asNullableString(row['authority']),
        programId: asNullableString(row['program_id']),
        state: asNullableString(row['state']),
        transferFeeBasisPoints: asNullableNumber(row['transfer_fee_basis_points']),
        maximumFeeRaw: asNullableString(row['maximum_fee_raw']),
        olderTransferFeeBasisPoints: null,
        newerTransferFeeBasisPoints: null,
        olderMaximumFeeRaw: null,
        newerMaximumFeeRaw: null,
        parsed: asNumber(row['parsed']) === 1,
        classified: true,
      }));
  }

  private readRiskFindings(scanId: number): RiskFinding[] {
    return this.requireStatements()
      .riskFindings.all(scanId)
      .map((row) => ({
        code: asString(row['code']),
        category: asString(row['category']) as RiskFindingCategory,
        severity: asString(row['severity']) as RiskFindingSeverity,
        confidence: asString(row['confidence']) as RiskConfidence,
        title: asString(row['title']),
        description: asString(row['description']),
      }));
  }

  private readObservationSources(observationId: number): DiscoverySource[] {
    return this.requireStatements()
      .observationSources.all(observationId)
      .map((row) => asString(row['source']) as DiscoverySource);
  }

  private transact<T>(fn: () => T): T {
    this.requireStatements();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.database.exec('COMMIT');
      return value;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // The failed transaction is already closed.
      }
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Database transaction failed.', { cause: error });
    }
  }

  private requireStatements(): Statements {
    if (this.statements === null) {
      throw new PersistenceError('Database is not initialized.');
    }
    return this.statements;
  }
}

export function createSqlitePersistenceRepository(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): SqlitePersistenceRepository {
  return new SqlitePersistenceRepository(config);
}

function prepareStatements(database: DatabaseSync): Statements {
  return {
    getToken: database.prepare(
      'SELECT id, chain, mint, first_observed_at, last_observed_at, created_at FROM tokens WHERE mint = ?',
    ),
    insertToken: database.prepare(
      'INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
    updateTokenTimes: database.prepare(
      'UPDATE tokens SET first_observed_at = ?, last_observed_at = ? WHERE id = ?',
    ),
    insertRun: database.prepare(
      'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, ?)',
    ),
    insertSourceResult: database.prepare(
      'INSERT INTO discovery_source_results (run_id, source, ok, record_count, error) VALUES (?, ?, ?, ?, ?)',
    ),
    insertObservation: database.prepare(
      `INSERT INTO discovery_observations (
        run_id, token_id, observed_at, dex_screener_url, description, profile_updated_at,
        boost_amount, boost_total_amount, market_data_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertObservationSource: database.prepare(
      'INSERT INTO discovery_observation_sources (observation_id, source) VALUES (?, ?)',
    ),
    insertLink: database.prepare(
      'INSERT INTO discovery_links (observation_id, ordinal, type, label, url) VALUES (?, ?, ?, ?, ?)',
    ),
    insertSnapshot: database.prepare(
      `INSERT INTO market_snapshots (
        token_id, discovery_observation_id, chain, token_name, token_symbol, dex_id, pair_address,
        quote_token_mint, quote_token_symbol, price_usd, liquidity_usd, volume_5m_usd, volume_1h_usd,
        volume_24h_usd, buys_5m, sells_5m, buys_1h, sells_1h, price_change_5m_pct, price_change_1h_pct,
        price_change_24h_pct, market_cap_usd, fdv_usd, pair_created_at, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token_id, pair_address, collected_at) DO NOTHING`,
    ),
    countTokens: database.prepare('SELECT COUNT(*) AS count FROM tokens'),
    countRuns: database.prepare('SELECT COUNT(*) AS count FROM discovery_runs'),
    countObservations: database.prepare('SELECT COUNT(*) AS count FROM discovery_observations'),
    countSnapshots: database.prepare('SELECT COUNT(*) AS count FROM market_snapshots'),
    snapshotOwnership: database.prepare(
      `SELECT collected_at, discovery_observation_id
       FROM market_snapshots
       WHERE token_id = ?
       ORDER BY collected_at ASC, id ASC`,
    ),
    countSourceResults: database.prepare('SELECT COUNT(*) AS count FROM discovery_source_results'),
    countObservationSources: database.prepare(
      'SELECT COUNT(*) AS count FROM discovery_observation_sources',
    ),
    countLinks: database.prepare('SELECT COUNT(*) AS count FROM discovery_links'),
    countMigrations: database.prepare('SELECT COUNT(*) AS count FROM schema_migrations'),
    insertRiskScan: database.prepare(
      `INSERT INTO risk_scans (
        token_id, scanned_at, commitment, token_program, program_owner, mint_context_slot,
        supply_context_slot, largest_accounts_context_slot, decimals, supply_raw, mint_authority,
        freeze_authority, top1_bps, top5_bps, top10_bps, top20_bps, largest_accounts_count,
        data_completeness, highest_finding_severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertRiskCheck: database.prepare(
      'INSERT INTO risk_scan_checks (scan_id, check_name, ok, context_slot, error) VALUES (?, ?, ?, ?, ?)',
    ),
    insertRiskExtension: database.prepare(
      `INSERT INTO risk_scan_extensions (
        scan_id, ordinal, extension_name, authority, program_id, state,
        transfer_fee_basis_points, maximum_fee_raw, parsed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertRiskAccount: database.prepare(
      `INSERT INTO risk_top_token_accounts (scan_id, rank, token_account, amount_raw, share_bps)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    insertRiskFinding: database.prepare(
      `INSERT INTO risk_findings (scan_id, code, category, severity, confidence, title, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    countRiskScans: database.prepare('SELECT COUNT(*) AS count FROM risk_scans'),
    countRiskChecks: database.prepare('SELECT COUNT(*) AS count FROM risk_scan_checks'),
    countRiskExtensions: database.prepare('SELECT COUNT(*) AS count FROM risk_scan_extensions'),
    countRiskAccounts: database.prepare('SELECT COUNT(*) AS count FROM risk_top_token_accounts'),
    countRiskFindings: database.prepare('SELECT COUNT(*) AS count FROM risk_findings'),
    riskHistory: database.prepare(
      `SELECT id, scanned_at, token_program, mint_authority, freeze_authority, supply_raw,
              top1_bps, top5_bps, highest_finding_severity
       FROM risk_scans
       WHERE token_id = ?
       ORDER BY scanned_at DESC, id DESC
       LIMIT ?`,
    ),
    riskChecks: database.prepare(
      `SELECT check_name, ok, context_slot, error
       FROM risk_scan_checks
       WHERE scan_id = ?
       ORDER BY CASE check_name
         WHEN 'mint_account' THEN 0
         WHEN 'supply' THEN 1
         ELSE 2
       END`,
    ),
    riskExtensions: database.prepare(
      `SELECT extension_name, authority, program_id, state, transfer_fee_basis_points,
              maximum_fee_raw, parsed
       FROM risk_scan_extensions
       WHERE scan_id = ?
       ORDER BY ordinal ASC`,
    ),
    riskFindings: database.prepare(
      `SELECT code, category, severity, confidence, title, description
       FROM risk_findings
       WHERE scan_id = ?
       ORDER BY code ASC`,
    ),
    observationBounds: database.prepare(
      'SELECT MIN(first_observed_at) AS earliest, MAX(last_observed_at) AS latest FROM tokens',
    ),
    recentObservations: database.prepare(
      `SELECT o.id, o.run_id, t.mint, o.observed_at, o.dex_screener_url, o.description,
              o.profile_updated_at, o.boost_amount, o.boost_total_amount, o.market_data_status
       FROM discovery_observations o
       JOIN tokens t ON t.id = o.token_id
       ORDER BY o.observed_at DESC, o.id DESC
       LIMIT ?`,
    ),
    observationSources: database.prepare(
      `SELECT source FROM discovery_observation_sources
       WHERE observation_id = ?
       ORDER BY CASE source WHEN 'dexscreener_profile' THEN 0 ELSE 1 END`,
    ),
    sourceResultsForRun: database.prepare(
      `SELECT source, ok, record_count, error
       FROM discovery_source_results
       WHERE run_id = ?
       ORDER BY CASE source WHEN 'dexscreener_profile' THEN 0 ELSE 1 END`,
    ),
    marketHistory: database.prepare(
      `SELECT token_name, token_symbol, dex_id, pair_address, quote_token_mint, quote_token_symbol,
              price_usd, liquidity_usd, volume_5m_usd, volume_1h_usd, volume_24h_usd,
              buys_5m, sells_5m, buys_1h, sells_1h, price_change_5m_pct, price_change_1h_pct,
              price_change_24h_pct, market_cap_usd, fdv_usd, pair_created_at, collected_at
       FROM market_snapshots
       WHERE token_id = ?
       ORDER BY collected_at DESC, id DESC
       LIMIT ?`,
    ),
  };
}

function uniqueSources(sources: readonly DiscoverySource[]): DiscoverySource[] {
  const seen = new Set<DiscoverySource>();
  const unique: DiscoverySource[] = [];
  for (const source of sources) {
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    unique.push(source);
  }
  return unique;
}

function minIso(left: string, right: string): string {
  return left < right ? left : right;
}

function maxIso(left: string, right: string): string {
  return left > right ? left : right;
}
