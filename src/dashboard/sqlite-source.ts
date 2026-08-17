/**
 * Dedicated read-only SQLite access for the Checkpoint 13 dashboard.
 *
 * The handle is opened with readOnly: true and PRAGMA query_only = ON.
 * The dashboard never initializes, migrates, or creates the database file.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';
import type { DatabaseConfig } from '../config/types.js';
import { canonicalizeZero } from '../performance/numbers.js';
import { resolveDatabasePath } from '../persistence/path.js';
import { currentSchemaVersion } from '../persistence/sqlite/migrations.js';
import { asNullableNumber, asNullableString, asNumber, asString } from '../persistence/sqlite/row-mappers.js';
import {
  DASHBOARD_MARKET_LIMIT,
  REQUIRED_DASHBOARD_COLUMNS,
  REQUIRED_DASHBOARD_TABLES,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
import { DashboardError } from './errors.js';
import type {
  DashboardCoverageCounts,
  DashboardDatabaseData,
  DashboardMarketRow,
  DashboardOpenPaperPosition,
} from './types.js';
import { abbreviateIdentity } from './display.js';

export type DashboardSchemaInspection = {
  compatible: boolean;
  status: 'available' | 'incompatible';
  schemaVersion: number | null;
  reason: string | null;
};

export class SqliteDashboardDataSource {
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

  queryOnlyEnabled(): boolean {
    this.assertOpen();
    const row = this.database.prepare('PRAGMA query_only').get();
    const value = row === undefined ? undefined : Object.values(row)[0];
    return value === 1 || value === '1';
  }

  inspectSchema(): DashboardSchemaInspection {
    this.assertOpen();
    let version: number;
    try {
      version = currentSchemaVersion(this.database);
    } catch {
      return {
        compatible: false,
        status: 'incompatible',
        schemaVersion: null,
        reason: 'Database schema is incompatible.',
      };
    }

    if (version < REQUIRED_SCHEMA_VERSION) {
      return {
        compatible: false,
        status: 'incompatible',
        schemaVersion: version,
        reason: 'Database schema is incompatible.',
      };
    }

    for (const table of REQUIRED_DASHBOARD_TABLES) {
      const found = this.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (found === undefined) {
        return {
          compatible: false,
          status: 'incompatible',
          schemaVersion: version,
          reason: 'Database schema is incompatible.',
        };
      }

      const columns = this.database.prepare(`PRAGMA table_info(${table})`).all();
      const names = new Set(
        columns.map((column) => {
          const name = column['name'];
          if (typeof name !== 'string') {
            throw new DashboardError('Database returned an invalid column list.');
          }
          return name;
        }),
      );
      for (const required of REQUIRED_DASHBOARD_COLUMNS[table]) {
        if (!names.has(required)) {
          return {
            compatible: false,
            status: 'incompatible',
            schemaVersion: version,
            reason: 'Database schema is incompatible.',
          };
        }
      }
    }

    return {
      compatible: true,
      status: 'available',
      schemaVersion: version,
      reason: null,
    };
  }

  loadCoverage(): {
    counts: DashboardCoverageCounts;
    latestMarketCollectedAt: string | null;
    latestRiskScannedAt: string | null;
    latestStrategyEvaluatedAt: string | null;
    latestPaperEvaluatedAt: string | null;
    latestExitEvaluatedAt: string | null;
    tokensWithRisk: number;
  } {
    this.assertOpen();
    return {
      counts: {
        tokens: this.countTable('tokens'),
        marketSnapshots: this.countTable('market_snapshots'),
        riskScans: this.countTable('risk_scans'),
        featureVectors: this.countTable('feature_vectors'),
        strategyEvaluations: this.countTable('strategy_evaluations'),
        paperEvaluations: this.countTable('paper_evaluations'),
        positionEvaluations: this.countTable('position_evaluations'),
        paperPositions: this.countTable('paper_positions'),
        paperOpenPositions: this.countTable('paper_open_positions'),
        exitEvaluations: this.countTable('exit_evaluations'),
        paperPositionExits: this.countTable('paper_position_exits'),
      },
      latestMarketCollectedAt: this.maxText('market_snapshots', 'collected_at'),
      latestRiskScannedAt: this.maxText('risk_scans', 'scanned_at'),
      latestStrategyEvaluatedAt: this.maxText('strategy_evaluations', 'evaluated_at'),
      latestPaperEvaluatedAt: this.maxText('paper_evaluations', 'evaluated_at'),
      latestExitEvaluatedAt: this.maxText('exit_evaluations', 'evaluated_at'),
      tokensWithRisk: this.countDistinct('risk_scans', 'token_id'),
    };
  }

  loadRecentMarkets(limit: number = DASHBOARD_MARKET_LIMIT): DashboardMarketRow[] {
    this.assertOpen();
    return this.database
      .prepare(
        `SELECT t.mint AS token_mint, m.token_name, m.token_symbol, m.dex_id, m.pair_address,
                m.price_usd, m.liquidity_usd, m.volume_5m_usd, m.buys_5m, m.sells_5m,
                m.price_change_5m_pct, m.price_change_1h_pct, m.price_change_24h_pct, m.collected_at
         FROM market_snapshots m
         JOIN tokens t ON t.id = m.token_id
         ORDER BY m.collected_at DESC, t.mint ASC, m.pair_address ASC
         LIMIT ?`,
      )
      .all(limit)
      .map((row) => mapMarketRow(row));
  }

  loadOpenPaperPositions(): DashboardOpenPaperPosition[] {
    this.assertOpen();
    return this.database
      .prepare(
        `SELECT t.mint AS token_mint, p.pair_address, p.opened_at, p.entry_price_usd,
                p.entry_notional_usd, p.quantity_tokens, p.source_identity
         FROM paper_open_positions op
         JOIN paper_positions p ON p.id = op.position_id
         JOIN tokens t ON t.id = op.token_id
         ORDER BY p.opened_at ASC, t.mint ASC, p.pair_address ASC`,
      )
      .all()
      .map((row) => ({
        tokenMint: asString(row['token_mint']),
        pairAddress: asString(row['pair_address']),
        openedAt: asString(row['opened_at']),
        entryReferencePriceUsd: canonicalizeZero(asNumber(row['entry_price_usd'])),
        referenceNotionalUsd: canonicalizeZero(asNumber(row['entry_notional_usd'])),
        quantityTokens: canonicalizeZero(asNumber(row['quantity_tokens'])),
        positionSourceIdentityAbbreviated: abbreviateIdentity(asString(row['source_identity'])),
      }));
  }

  runDatabaseHealth(): { integrityCheck: string; foreignKeyViolations: number } {
    this.assertOpen();
    const integrityRow = this.database.prepare('PRAGMA integrity_check').get();
    const integrityCheck = String(Object.values(integrityRow ?? {})[0] ?? 'unknown');
    const foreignKeys = this.database.prepare('PRAGMA foreign_key_check').all();
    return {
      integrityCheck,
      foreignKeyViolations: foreignKeys.length,
    };
  }

  execForHostileTests(sql: string): void {
    this.assertOpen();
    this.database.exec(sql);
  }

  close(): void {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }

  private countTable(table: (typeof REQUIRED_DASHBOARD_TABLES)[number]): number {
    const row = this.database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get();
    return asNumber(row?.['count']);
  }

  private countDistinct(table: 'risk_scans', column: 'token_id'): number {
    const row = this.database.prepare(`SELECT COUNT(DISTINCT ${column}) AS count FROM ${table}`).get();
    return asNumber(row?.['count']);
  }

  private maxText(
    table: 'market_snapshots' | 'risk_scans' | 'strategy_evaluations' | 'paper_evaluations' | 'exit_evaluations',
    column: 'collected_at' | 'scanned_at' | 'evaluated_at',
  ): string | null {
    const row = this.database.prepare(`SELECT MAX(${column}) AS value FROM ${table}`).get();
    return asNullableString(row?.['value']);
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new DashboardError('Dashboard data source is closed.');
    }
  }
}

export function tryOpenSqliteDashboardDataSource(
  config: Pick<DatabaseConfig, 'enabled' | 'path' | 'busyTimeoutMs'>,
): { source: SqliteDashboardDataSource | null; reason: string | null } {
  if (!config.enabled) {
    return { source: null, reason: 'Database is disabled.' };
  }

  const location = resolveDatabasePath(config.path);
  if (location === MEMORY_DATABASE_PATH) {
    return { source: null, reason: 'Database file is not available.' };
  }
  if (!existsSync(location)) {
    return { source: null, reason: 'Database file is not available.' };
  }

  try {
    const database = new DatabaseSync(location, {
      readOnly: true,
      timeout: config.busyTimeoutMs,
      enableForeignKeyConstraints: true,
    });
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA query_only = ON');
    return { source: new SqliteDashboardDataSource(database), reason: null };
  } catch {
    return { source: null, reason: 'Database file is not available.' };
  }
}

export function openReadOnlyDashboardDatabase(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): SqliteDashboardDataSource {
  const opened = tryOpenSqliteDashboardDataSource({ ...config, enabled: true });
  if (opened.source === null) {
    throw new DashboardError(opened.reason ?? 'Database file is not available.');
  }
  return opened.source;
}

export function toDatabaseSectionData(input: {
  inspection: DashboardSchemaInspection;
  queryOnly: boolean;
  coverage: ReturnType<SqliteDashboardDataSource['loadCoverage']> | null;
}): DashboardDatabaseData {
  if (!input.inspection.compatible) {
    return {
      status: 'incompatible',
      schemaVersion: input.inspection.schemaVersion,
      queryOnly: input.queryOnly,
      health: 'not_checked',
      counts: null,
      latestMarketCollectedAt: null,
      latestRiskScannedAt: null,
      latestStrategyEvaluatedAt: null,
      latestPaperEvaluatedAt: null,
      latestExitEvaluatedAt: null,
    };
  }

  const coverage = input.coverage;
  if (coverage === null) {
    throw new DashboardError('Compatible dashboard database coverage was missing.');
  }

  return {
    status: 'available',
    schemaVersion: input.inspection.schemaVersion,
    queryOnly: input.queryOnly,
    health: 'not_checked',
    counts: coverage.counts,
    latestMarketCollectedAt: coverage.latestMarketCollectedAt,
    latestRiskScannedAt: coverage.latestRiskScannedAt,
    latestStrategyEvaluatedAt: coverage.latestStrategyEvaluatedAt,
    latestPaperEvaluatedAt: coverage.latestPaperEvaluatedAt,
    latestExitEvaluatedAt: coverage.latestExitEvaluatedAt,
  };
}

function mapMarketRow(row: Record<string, SQLOutputValue>): DashboardMarketRow {
  return {
    tokenSymbol: asNullableString(row['token_symbol']),
    tokenName: asNullableString(row['token_name']),
    tokenMint: asString(row['token_mint']),
    pairAddress: asString(row['pair_address']),
    dexName: asString(row['dex_id']),
    priceUsd: canonicalizeNullable(asNullableNumber(row['price_usd'])),
    liquidityUsd: canonicalizeNullable(asNullableNumber(row['liquidity_usd'])),
    volume5mUsd: canonicalizeNullable(asNullableNumber(row['volume_5m_usd'])),
    buys5m: canonicalizeNullable(asNullableNumber(row['buys_5m'])),
    sells5m: canonicalizeNullable(asNullableNumber(row['sells_5m'])),
    priceChange5mPct: canonicalizeNullable(asNullableNumber(row['price_change_5m_pct'])),
    priceChange1hPct: canonicalizeNullable(asNullableNumber(row['price_change_1h_pct'])),
    priceChange24hPct: canonicalizeNullable(asNullableNumber(row['price_change_24h_pct'])),
    collectedAt: asString(row['collected_at']),
  };
}

function canonicalizeNullable(value: number | null): number | null {
  return value === null ? null : canonicalizeZero(value);
}
