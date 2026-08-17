/**
 * Read-only historical loader for Phase 12.5 research.
 *
 * Research commands never call persistence record* methods. The file is opened
 * read-only with PRAGMA query_only = ON. Schema versions below 7 are rejected
 * because runtime-exit snapshot exclusion needs exit_evaluations.
 *
 * Snapshots referenced by exit_evaluations.market_snapshot_id are excluded
 * from the research universe before any candidate runs. That is a provenance
 * / leakage control, not a performance filter.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';
import type { DatabaseConfig } from '../config/types.js';
import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { resolveDatabasePath } from '../persistence/path.js';
import { interpretIntegrityPragmas } from '../persistence/sqlite/integrity.js';
import { currentSchemaVersion } from '../persistence/sqlite/migrations.js';
import { asNullableNumber, asNumber, asString, mapSnapshotRow } from '../persistence/sqlite/row-mappers.js';
import type { PersistenceIntegrity } from '../persistence/types.js';
import type {
  DataCompleteness,
  RiskConfidence,
  RiskFinding,
  RiskFindingCategory,
  RiskFindingSeverity,
  TokenAccountConcentration,
  TokenProgramKind,
} from '../risk/types.js';
import { compareLexical } from '../backtest/timeline.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import { REQUIRED_COLUMNS, REQUIRED_SCHEMA_VERSION, REQUIRED_TABLES } from './constants.js';
import {
  fingerprintResearchDataset,
  RESEARCH_DEFINITION_FINGERPRINT,
  researchMarketObservationIdentity,
  researchMarketTimeIdentity,
  researchRiskEvidenceIdentity,
} from './identity.js';
import { sortResearchMarketEvents } from './timeline.js';
import { ResearchError, type ResearchDataset } from './types.js';

const MARKET_SNAPSHOT_SQL = `
SELECT m.id, t.mint AS token_mint, m.token_name, m.token_symbol, m.dex_id, m.pair_address,
       m.quote_token_mint, m.quote_token_symbol, m.price_usd, m.liquidity_usd,
       m.volume_5m_usd, m.volume_1h_usd, m.volume_24h_usd, m.buys_5m, m.sells_5m,
       m.buys_1h, m.sells_1h, m.price_change_5m_pct, m.price_change_1h_pct,
       m.price_change_24h_pct, m.market_cap_usd, m.fdv_usd, m.pair_created_at, m.collected_at
FROM market_snapshots m
JOIN tokens t ON t.id = m.token_id
`;

export class SqliteResearchDataSource {
  private closed = false;
  private readSnapshotDepth = 0;

  constructor(private readonly database: DatabaseSync) {}

  withReadSnapshot<T>(fn: () => T): T {
    this.assertOpen();
    const outer = this.readSnapshotDepth === 0;
    if (outer) {
      this.database.exec('BEGIN DEFERRED');
    }
    this.readSnapshotDepth += 1;
    try {
      const result = fn();
      this.readSnapshotDepth -= 1;
      if (outer) {
        this.database.exec('COMMIT');
      }
      return result;
    } catch (error: unknown) {
      this.readSnapshotDepth -= 1;
      if (outer) {
        try {
          this.database.exec('ROLLBACK');
        } catch {
          // The read snapshot is already aborted or the handle is unusable.
        }
      }
      throw error;
    }
  }

  loadResearchDataset(): ResearchDataset {
    this.assertOpen();
    return this.withReadSnapshot(() => {
      const loaded = this.loadMarketSnapshotsWithIds();
      const excludedIds = this.loadRuntimeExitReferencedSnapshotIds();
      const excluded = loaded.filter((item) => excludedIds.has(item.id));
      const included = loaded.filter((item) => !excludedIds.has(item.id)).map((item) => item.snapshot);
      const marketSnapshots = sortResearchMarketEvents(included);
      const riskReports = this.loadRiskFeatureInputs();
      const orderedRisk = [...riskReports].sort((left, right) => {
        const token = compareLexical(left.tokenMint, right.tokenMint);
        if (token !== 0) {
          return token;
        }
        const scanned = compareLexical(left.scannedAt, right.scannedAt);
        if (scanned !== 0) {
          return scanned;
        }
        return compareLexical(researchRiskEvidenceIdentity(left), researchRiskEvidenceIdentity(right));
      });

      const includedMarketObservationIdentities = marketSnapshots.map(researchMarketObservationIdentity);
      const includedMarketIdentities = marketSnapshots.map(researchMarketTimeIdentity);
      const excludedRuntimeExitMarketIdentities = excluded
        .map((item) => researchMarketObservationIdentity(item.snapshot))
        .sort(compareLexical);
      const riskEvidenceIdentities = orderedRisk.map(researchRiskEvidenceIdentity);
      const uniqueTokens = new Set(marketSnapshots.map((snapshot) => snapshot.tokenMint));
      const uniquePairs = new Set(
        marketSnapshots.map((snapshot) => `${snapshot.tokenMint}:${snapshot.pairAddress}`),
      );
      const firstSnapshotAt = marketSnapshots[0]?.collectedAt ?? null;
      const lastSnapshotAt = marketSnapshots[marketSnapshots.length - 1]?.collectedAt ?? null;
      const datasetSpanMs =
        firstSnapshotAt === null || lastSnapshotAt === null
          ? null
          : requireUtcTimestamp(lastSnapshotAt, 'lastSnapshotAt') -
            requireUtcTimestamp(firstSnapshotAt, 'firstSnapshotAt');

      return {
        researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
        researchDatasetFingerprint: fingerprintResearchDataset({
          researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
          includedMarketObservationIdentities,
          riskEvidenceIdentities,
          excludedRuntimeExitMarketIdentities,
          runtimeExitReferencedSnapshotCountExcluded: excludedIds.size,
        }),
        rawMarketSnapshotCount: loaded.length,
        runtimeExitReferencedSnapshotCountExcluded: excludedIds.size,
        researchMarketSnapshotCount: marketSnapshots.length,
        uniqueTokenCount: uniqueTokens.size,
        uniquePairCount: uniquePairs.size,
        firstSnapshotAt,
        lastSnapshotAt,
        datasetSpanMs,
        riskScanCount: orderedRisk.length,
        uniqueTokensWithRiskScan: new Set(orderedRisk.map((report) => report.tokenMint)).size,
        snapshotsWithFinitePriceCount: marketSnapshots.filter(
          (snapshot) => typeof snapshot.priceUsd === 'number' && Number.isFinite(snapshot.priceUsd),
        ).length,
        snapshotsWithNullPriceCount: marketSnapshots.filter((snapshot) => snapshot.priceUsd === null).length,
        includedMarketIdentities,
        includedMarketObservationIdentities,
        riskEvidenceIdentities,
        excludedRuntimeExitMarketIdentities,
        marketSnapshots,
        riskReports: orderedRisk,
      };
    });
  }

  verifyCompatibleSchema(): void {
    this.assertOpen();
    let version: number;
    try {
      version = currentSchemaVersion(this.database);
    } catch (error: unknown) {
      throw new ResearchError(
        'Database schema is not compatible with Phase 12.5. Research requires schema 7 or later so exit_evaluations can be used for provenance exclusion.',
        { cause: error },
      );
    }

    if (version < REQUIRED_SCHEMA_VERSION) {
      throw new ResearchError(
        `Database schema version is ${String(version)}, but Phase 12.5 requires schema ${String(REQUIRED_SCHEMA_VERSION)} or later. Runtime-exit snapshot exclusion cannot run on earlier schemas.`,
      );
    }

    for (const table of REQUIRED_TABLES) {
      const found = this.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (found === undefined) {
        throw new ResearchError(
          `Database schema ${String(version)} is missing required table ${table} for r125_v1 research.`,
        );
      }

      const columns = this.database.prepare(`PRAGMA table_info(${table})`).all();
      const names = new Set(
        columns.map((column) => {
          const name = column['name'];
          if (typeof name !== 'string') {
            throw new ResearchError(
              `Database schema ${String(version)} returned an invalid column list for ${table}.`,
            );
          }
          return name;
        }),
      );
      for (const required of REQUIRED_COLUMNS[table]) {
        if (!names.has(required)) {
          throw new ResearchError(
            `Database schema ${String(version)} is missing required column ${table}.${required} for r125_v1 research.`,
          );
        }
      }
    }
  }

  verifyIntegrity(): PersistenceIntegrity {
    this.assertOpen();
    try {
      const quickCheck = String(
        Object.values(this.database.prepare('PRAGMA quick_check').get() ?? {})[0] ?? '',
      );
      const foreignKeys = this.database.prepare('PRAGMA foreign_key_check').all();
      const integrity = interpretIntegrityPragmas(quickCheck, foreignKeys.length);
      if (!integrity.ok) {
        throw new ResearchError('Historical database integrity check failed.');
      }
      return integrity;
    } catch (error: unknown) {
      if (error instanceof ResearchError) {
        throw error;
      }
      throw new ResearchError('Historical database integrity check failed.', { cause: error });
    }
  }

  queryOnlyEnabled(): boolean {
    this.assertOpen();
    const row = this.database.prepare('PRAGMA query_only').get();
    return String(Object.values(row ?? {})[0] ?? '') === '1';
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.database.close();
    this.closed = true;
  }

  private loadMarketSnapshotsWithIds(): { id: number; snapshot: MarketSnapshot }[] {
    return this.database.prepare(MARKET_SNAPSHOT_SQL).all().map((row) => ({
      id: asNumber(row['id']),
      snapshot: mapSnapshotRow(row, asString(row['token_mint'])),
    }));
  }

  private loadRuntimeExitReferencedSnapshotIds(): Set<number> {
    const rows = this.database
      .prepare(
        `SELECT DISTINCT market_snapshot_id AS id
         FROM exit_evaluations
         WHERE market_snapshot_id IS NOT NULL`,
      )
      .all();
    const ids = new Set<number>();
    for (const row of rows) {
      ids.add(asNumber(row['id']));
    }
    return ids;
  }

  private loadRiskFeatureInputs(): RiskFeatureInput[] {
    const rows = this.database
      .prepare(
        `SELECT s.id, t.mint AS token_mint, s.scanned_at, s.token_program, s.data_completeness,
                s.top1_bps, s.top5_bps, s.top10_bps, s.top20_bps, s.largest_accounts_count
         FROM risk_scans s
         JOIN tokens t ON t.id = s.token_id`,
      )
      .all();
    return rows.map((row) => this.mapRiskFeatureInput(row));
  }

  private mapRiskFeatureInput(row: Record<string, SQLOutputValue>): RiskFeatureInput {
    return {
      tokenMint: asString(row['token_mint']),
      scannedAt: asString(row['scanned_at']),
      tokenProgram: asString(row['token_program']) as TokenProgramKind,
      dataCompleteness: asString(row['data_completeness']) as DataCompleteness,
      findings: this.loadRiskFindings(asNumber(row['id'])),
      concentration: concentrationFromRow(row),
    };
  }

  private loadRiskFindings(scanId: number): RiskFinding[] {
    return this.database
      .prepare(
        `SELECT code, category, severity, confidence, title, description
         FROM risk_findings
         WHERE scan_id = ?
         ORDER BY code ASC`,
      )
      .all(scanId)
      .map((row) => ({
        code: asString(row['code']),
        category: asString(row['category']) as RiskFindingCategory,
        severity: asString(row['severity']) as RiskFindingSeverity,
        confidence: asString(row['confidence']) as RiskConfidence,
        title: asString(row['title']),
        description: asString(row['description']),
      }));
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new ResearchError('Research data source is closed.');
    }
  }
}

export function openSqliteResearchDataSource(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): SqliteResearchDataSource {
  return new SqliteResearchDataSource(openReadOnlyResearchDatabase(config));
}

export function openReadOnlyResearchDatabase(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): DatabaseSync {
  const location = resolveDatabasePath(config.path);
  if (location === MEMORY_DATABASE_PATH) {
    throw new ResearchError('Research requires an existing on-disk database file.');
  }
  if (!existsSync(location)) {
    throw new ResearchError(
      `Database file does not exist at ${location}. Run npm run db:init outside the research command if initialization is needed. Research commands do not add a missing database file.`,
    );
  }

  try {
    const database = new DatabaseSync(location, {
      readOnly: true,
      timeout: config.busyTimeoutMs,
      enableForeignKeyConstraints: true,
    });
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA query_only = ON');
    return database;
  } catch (error: unknown) {
    throw new ResearchError('Could not open the historical database as read-only.', { cause: error });
  }
}

function concentrationFromRow(row: Record<string, SQLOutputValue>): TokenAccountConcentration | null {
  const top1Bps = asNullableNumber(row['top1_bps']);
  const top5Bps = asNullableNumber(row['top5_bps']);
  const top10Bps = asNullableNumber(row['top10_bps']);
  const top20Bps = asNullableNumber(row['top20_bps']);
  if (top1Bps === null || top5Bps === null || top10Bps === null || top20Bps === null) {
    return null;
  }

  return {
    top1Bps,
    top5Bps,
    top10Bps,
    top20Bps,
    observedAccountsCount: asNumber(row['largest_accounts_count']),
  };
}
