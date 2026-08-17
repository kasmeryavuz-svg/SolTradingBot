/**
 * Read-only historical loader for Checkpoint 08.
 *
 * Checkpoint 08 reconstructs the persisted historical risk facts required to
 * reproduce c06_v1 risk-derived features. It does not reconstruct a full
 * TokenRiskReport. Migration 002 never stored parser-level extension fields
 * such as rawName, classified, or older/newer transfer-fee values. Those
 * missing facts are not invented. Findings come from stored risk_findings
 * rows; today's Checkpoint 05 evaluator is not rerun over old extension data.
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
import { STRATEGY_NAME } from '../strategy/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import {
  REQUIRED_BACKTEST_FEATURE_SET_VERSION,
  REQUIRED_BACKTEST_STRATEGY_VERSION,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
import type { BacktestHistoricalDataSource } from './data-source.js';
import { BacktestError, type BacktestDataset, type StoredStrategyDefinitionSnapshot } from './types.js';

export class SqliteBacktestDataSource implements BacktestHistoricalDataSource {
  private closed = false;

  constructor(private readonly database: DatabaseSync) {}

  loadDataset(tokenMint?: string): BacktestDataset {
    this.assertOpen();
    return {
      marketSnapshots: this.loadMarketSnapshots(tokenMint),
      riskReports: this.loadRiskFeatureInputs(tokenMint),
    };
  }

  getStoredStrategyDefinition(strategyVersion: string): StoredStrategyDefinitionSnapshot | null {
    this.assertOpen();
    const row = this.database
      .prepare(
        `SELECT strategy_version, strategy_name, feature_set_version, definition_fingerprint
         FROM strategy_definitions
         WHERE strategy_version = ?`,
      )
      .get(strategyVersion);
    if (row === undefined) {
      return null;
    }

    return {
      strategyVersion: asString(row['strategy_version']),
      strategyName: asString(row['strategy_name']),
      featureSetVersion: asString(row['feature_set_version']),
      definitionFingerprint: asString(row['definition_fingerprint']),
    };
  }

  verifyCompatibleSchema(): void {
    this.assertOpen();
    let version: number;
    try {
      version = currentSchemaVersion(this.database);
    } catch (error: unknown) {
      throw new BacktestError(
        'Database schema is not compatible with Checkpoint 08. Run npm run db:init outside the backtest command if initialization is needed.',
        { cause: error },
      );
    }

    if (version !== REQUIRED_SCHEMA_VERSION) {
      throw new BacktestError(
        `Database schema version is ${String(version)}, but Checkpoint 08 requires schema ${String(REQUIRED_SCHEMA_VERSION)}. Run npm run db:init outside the backtest command if initialization is needed.`,
      );
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
        throw new BacktestError('Historical database integrity check failed.');
      }
      return integrity;
    } catch (error: unknown) {
      if (error instanceof BacktestError) {
        throw error;
      }
      throw new BacktestError('Historical database integrity check failed.', { cause: error });
    }
  }

  verifyStoredStrategyDefinition(): void {
    const stored = this.getStoredStrategyDefinition(REQUIRED_BACKTEST_STRATEGY_VERSION);
    if (stored === null) {
      return;
    }

    if (
      stored.strategyName !== STRATEGY_NAME ||
      stored.featureSetVersion !== REQUIRED_BACKTEST_FEATURE_SET_VERSION ||
      stored.definitionFingerprint !== STRATEGY_DEFINITION_FINGERPRINT
    ) {
      throw new BacktestError(
        'Stored s07_v1 strategy definition does not match the frozen Checkpoint 07 code definition. The backtest command will not change it.',
      );
    }
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.database.close();
    this.closed = true;
  }

  private loadMarketSnapshots(tokenMint?: string): MarketSnapshot[] {
    const sql =
      tokenMint === undefined
        ? `SELECT t.mint AS token_mint, m.token_name, m.token_symbol, m.dex_id, m.pair_address,
                  m.quote_token_mint, m.quote_token_symbol, m.price_usd, m.liquidity_usd,
                  m.volume_5m_usd, m.volume_1h_usd, m.volume_24h_usd, m.buys_5m, m.sells_5m,
                  m.buys_1h, m.sells_1h, m.price_change_5m_pct, m.price_change_1h_pct,
                  m.price_change_24h_pct, m.market_cap_usd, m.fdv_usd, m.pair_created_at, m.collected_at
           FROM market_snapshots m
           JOIN tokens t ON t.id = m.token_id
           ORDER BY t.mint ASC, m.collected_at ASC, m.pair_address ASC`
        : `SELECT t.mint AS token_mint, m.token_name, m.token_symbol, m.dex_id, m.pair_address,
                  m.quote_token_mint, m.quote_token_symbol, m.price_usd, m.liquidity_usd,
                  m.volume_5m_usd, m.volume_1h_usd, m.volume_24h_usd, m.buys_5m, m.sells_5m,
                  m.buys_1h, m.sells_1h, m.price_change_5m_pct, m.price_change_1h_pct,
                  m.price_change_24h_pct, m.market_cap_usd, m.fdv_usd, m.pair_created_at, m.collected_at
           FROM market_snapshots m
           JOIN tokens t ON t.id = m.token_id
           WHERE t.mint = ?
           ORDER BY t.mint ASC, m.collected_at ASC, m.pair_address ASC`;
    const rows =
      tokenMint === undefined ? this.database.prepare(sql).all() : this.database.prepare(sql).all(tokenMint);
    return rows.map((row) => mapSnapshotRow(row, asString(row['token_mint'])));
  }

  private loadRiskFeatureInputs(tokenMint?: string): RiskFeatureInput[] {
    const sql =
      tokenMint === undefined
        ? `SELECT s.id, t.mint AS token_mint, s.scanned_at, s.token_program, s.data_completeness,
                  s.top1_bps, s.top5_bps, s.top10_bps, s.top20_bps, s.largest_accounts_count
           FROM risk_scans s
           JOIN tokens t ON t.id = s.token_id
           ORDER BY t.mint ASC, s.scanned_at ASC, s.id ASC`
        : `SELECT s.id, t.mint AS token_mint, s.scanned_at, s.token_program, s.data_completeness,
                  s.top1_bps, s.top5_bps, s.top10_bps, s.top20_bps, s.largest_accounts_count
           FROM risk_scans s
           JOIN tokens t ON t.id = s.token_id
           WHERE t.mint = ?
           ORDER BY t.mint ASC, s.scanned_at ASC, s.id ASC`;
    const rows =
      tokenMint === undefined ? this.database.prepare(sql).all() : this.database.prepare(sql).all(tokenMint);
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
      throw new BacktestError('Historical data source is closed.');
    }
  }
}

export function openSqliteBacktestDataSource(config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>): SqliteBacktestDataSource {
  return new SqliteBacktestDataSource(openReadOnlyHistoricalDatabase(config));
}

export function openReadOnlyHistoricalDatabase(config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>): DatabaseSync {
  const location = resolveDatabasePath(config.path);
  if (location === MEMORY_DATABASE_PATH) {
    throw new BacktestError('Backtest requires an existing on-disk database file.');
  }
  if (!existsSync(location)) {
    throw new BacktestError(
      `Database file does not exist at ${location}. Run npm run db:init outside the backtest command if initialization is needed. The backtest command does not add a missing database file.`,
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
    throw new BacktestError('Could not open the historical database as read-only.', { cause: error });
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
