/**
 * Read-only completed paper-trade loader for Checkpoint 12.
 *
 * Analytics never call persistence record* methods. The file is opened
 * read-only with PRAGMA query_only = ON. Schema versions below 7 are rejected
 * because immutable exit evidence does not exist.
 *
 * Completed lifecycle candidates are selected from paper_position_exits with
 * LEFT JOIN of required upstream rows. Missing joins fail after load. The
 * query does not restrict by frozen fingerprint, spec version, or exit action.
 */
import { existsSync } from 'node:fs';
import { DatabaseSync, type SQLOutputValue } from 'node:sqlite';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';
import type { DatabaseConfig } from '../config/types.js';
import { resolveDatabasePath } from '../persistence/path.js';
import { interpretIntegrityPragmas } from '../persistence/sqlite/integrity.js';
import { currentSchemaVersion } from '../persistence/sqlite/migrations.js';
import type { PersistenceIntegrity } from '../persistence/types.js';
import { REQUIRED_COLUMNS, REQUIRED_SCHEMA_VERSION, REQUIRED_TABLES } from './constants.js';
import { PerformanceError, type CompletedPaperTradeEvidence } from './types.js';

const COMPLETED_TRADE_SQL = `
SELECT
  t.mint AS token_mint,
  t.id AS token_id,
  p.id AS position_id,
  p.token_id AS position_token_id,
  p.pair_address AS position_pair_address,
  p.opened_at,
  p.entry_market_collected_at,
  p.entry_price_usd,
  p.entry_notional_usd,
  p.quantity_tokens AS position_quantity_tokens,
  p.position_spec_version,
  p.position_definition_fingerprint,
  p.source_identity AS position_source_identity,
  p.opening_paper_source_identity,
  p.opening_paper_evaluation_id,
  pe.paper_evaluation_id AS position_evaluation_paper_evaluation_id,
  pe.token_id AS position_evaluation_token_id,
  pe.position_action AS position_evaluation_action,
  pe.source_identity AS position_evaluation_source_identity,
  pe.position_source_identity AS position_evaluation_position_source_identity,
  pe.paper_action AS position_evaluation_paper_action,
  pe.prior_open_position_id,
  pe.prior_open_position_source_identity,
  pe.entry_price_usd AS position_evaluation_entry_price_usd,
  pe.entry_notional_usd AS position_evaluation_entry_notional_usd,
  pe.quantity_tokens AS position_evaluation_quantity_tokens,
  pe.position_spec_version AS position_evaluation_spec_version,
  pe.position_definition_fingerprint AS position_evaluation_definition_fingerprint,
  paper.token_id AS opening_paper_token_id,
  paper.paper_spec_version,
  paper.paper_definition_fingerprint,
  paper.strategy_definition_fingerprint AS opening_paper_strategy_definition_fingerprint,
  paper.feature_set_version AS opening_paper_feature_set_version,
  paper.pair_address AS opening_paper_pair_address,
  paper.source_identity AS opening_paper_evaluation_source_identity,
  paper.paper_action AS opening_paper_action,
  paper.strategy_decision AS opening_paper_strategy_decision,
  paper.simulated_entry_price_usd AS opening_paper_simulated_entry_price_usd,
  paper.reference_price_usd AS opening_paper_reference_price_usd,
  paper.evaluated_at AS opening_paper_evaluated_at,
  paper.as_of AS opening_paper_as_of,
  paper.market_collected_at AS opening_paper_market_collected_at,
  se.token_id AS strategy_token_id,
  se.strategy_version,
  se.strategy_definition_fingerprint,
  se.feature_set_version AS strategy_feature_set_version,
  se.source_identity AS strategy_source_identity,
  se.decision AS strategy_decision,
  se.evaluated_at AS strategy_evaluated_at,
  se.as_of AS strategy_as_of,
  x.id AS exit_evidence_id,
  x.token_id AS exit_token_id,
  x.exit_spec_version AS exit_evidence_spec_version,
  x.exit_definition_fingerprint AS exit_evidence_definition_fingerprint,
  x.position_definition_fingerprint AS exit_evidence_position_definition_fingerprint,
  x.pair_address AS exit_pair_address,
  x.exited_at,
  x.exit_market_collected_at,
  x.exit_price_usd,
  x.quantity_tokens AS exit_quantity_tokens,
  x.closing_position_source_identity,
  x.source_identity AS exit_evidence_source_identity,
  ee.id AS exit_evaluation_id,
  ee.token_id AS exit_evaluation_token_id,
  ee.position_id AS exit_evaluation_position_id,
  ee.market_snapshot_id AS exit_market_snapshot_id,
  ee.exit_spec_version AS exit_evaluation_spec_version,
  ee.exit_definition_fingerprint AS exit_evaluation_definition_fingerprint,
  ee.position_definition_fingerprint AS exit_evaluation_position_definition_fingerprint,
  ee.position_source_identity AS exit_evaluation_position_source_identity,
  ee.pair_address AS exit_evaluation_pair_address,
  ee.exit_action,
  ee.exit_reason,
  ee.simulated_exit_price_usd,
  ee.closed_quantity_tokens,
  ee.observed_price_usd AS exit_evaluation_observed_price_usd,
  ee.entry_price_usd AS exit_evaluation_entry_price_usd,
  ee.stop_trigger_price_usd AS exit_evaluation_stop_trigger_price_usd,
  ee.take_profit_trigger_price_usd AS exit_evaluation_take_profit_trigger_price_usd,
  ee.holding_age_ms AS exit_evaluation_holding_age_ms,
  ee.max_holding_ms AS exit_evaluation_max_holding_ms,
  ee.market_collected_at AS exit_evaluation_market_collected_at,
  ee.evaluated_at AS exit_evaluation_evaluated_at,
  ee.as_of AS exit_evaluation_as_of,
  ee.source_identity AS exit_evaluation_source_identity,
  ms.pair_address AS exit_market_snapshot_pair_address,
  ms.price_usd AS exit_market_snapshot_price_usd,
  ms.collected_at AS exit_market_snapshot_collected_at,
  CASE WHEN current_open.position_id IS NULL THEN 0 ELSE 1 END AS currently_open,
  open_by_position.token_id AS open_pointer_token_id
FROM paper_position_exits x
LEFT JOIN paper_positions p ON p.id = x.position_id AND p.token_id = x.token_id
LEFT JOIN tokens t ON t.id = x.token_id
LEFT JOIN exit_evaluations ee ON ee.id = x.exit_evaluation_id AND ee.token_id = x.token_id
LEFT JOIN position_evaluations pe ON pe.id = p.position_evaluation_id AND pe.token_id = p.token_id
LEFT JOIN paper_evaluations paper
  ON paper.id = p.opening_paper_evaluation_id AND paper.token_id = p.token_id
LEFT JOIN strategy_evaluations se
  ON se.id = paper.strategy_evaluation_id AND se.token_id = paper.token_id
LEFT JOIN market_snapshots ms
  ON ms.id = ee.market_snapshot_id AND ms.token_id = ee.token_id
LEFT JOIN paper_open_positions current_open
  ON current_open.position_id = p.id AND current_open.token_id = p.token_id
LEFT JOIN paper_open_positions open_by_position
  ON open_by_position.position_id = p.id
`;

export class SqlitePerformanceDataSource {
  private closed = false;
  private readSnapshotDepth = 0;

  constructor(private readonly database: DatabaseSync) {}

  withReadSnapshot<T>(fn: () => T): T {
    this.assertOpen();
    const outer = this.readSnapshotDepth === 0;
    if (outer) {
      this.database.exec('BEGIN');
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

  loadCompletedTradeEvidence(): CompletedPaperTradeEvidence[] {
    this.assertOpen();
    return this.withReadSnapshot(() => {
      const exitCount = asInteger(
        this.database.prepare('SELECT COUNT(*) AS count FROM paper_position_exits').get()?.['count'],
        'paper_position_exits count',
      );
      const rows = this.database.prepare(COMPLETED_TRADE_SQL).all();
      if (rows.length !== exitCount) {
        throw new PerformanceError(
          'Completed paper trade loader did not return every paper_position_exits row. Analytics will not skip evidence.',
        );
      }

      return rows.map((row) => this.mapEvidence(row));
    });
  }

  verifyCompatibleSchema(): void {
    this.assertOpen();
    let version: number;
    try {
      version = currentSchemaVersion(this.database);
    } catch (error: unknown) {
      throw new PerformanceError(
        'Database schema is not compatible with Checkpoint 12. Immutable exit evidence requires schema 7 or later.',
        { cause: error },
      );
    }

    if (version < REQUIRED_SCHEMA_VERSION) {
      throw new PerformanceError(
        `Database schema version is ${String(version)}, but Checkpoint 12 requires schema ${String(REQUIRED_SCHEMA_VERSION)} or later. Immutable exit evidence does not exist on earlier schemas.`,
      );
    }

    for (const table of REQUIRED_TABLES) {
      const found = this.database
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
        .get(table);
      if (found === undefined) {
        throw new PerformanceError(
          `Database schema ${String(version)} is missing required table ${table} for a12_v1 analytics.`,
        );
      }

      const columns = this.database.prepare(`PRAGMA table_info(${table})`).all();
      const names = new Set(
        columns.map((column) => {
          const name = column['name'];
          if (typeof name !== 'string') {
            throw new PerformanceError(
              `Database schema ${String(version)} returned an invalid column list for ${table}.`,
            );
          }
          return name;
        }),
      );
      for (const required of REQUIRED_COLUMNS[table]) {
        if (!names.has(required)) {
          throw new PerformanceError(
            `Database schema ${String(version)} is missing required column ${table}.${required} for a12_v1 analytics.`,
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
        throw new PerformanceError('Historical database integrity check failed.');
      }
      return integrity;
    } catch (error: unknown) {
      if (error instanceof PerformanceError) {
        throw error;
      }
      throw new PerformanceError('Historical database integrity check failed.', { cause: error });
    }
  }

  queryOnlyEnabled(): boolean {
    this.assertOpen();
    const row = this.database.prepare('PRAGMA query_only').get();
    return String(Object.values(row ?? {})[0] ?? '') === '1';
  }

  execForTests(sql: string): void {
    this.assertOpen();
    this.database.exec(sql);
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.database.close();
    this.closed = true;
  }

  private mapEvidence(row: Record<string, SQLOutputValue>): CompletedPaperTradeEvidence {
    requireJoined(
      row,
      'position_id',
      'A paper_position_exits row is missing its paper_positions row.',
    );
    requireJoined(row, 'token_mint', 'A paper_position_exits row is missing its tokens row.');
    requireJoined(
      row,
      'exit_evaluation_id',
      'A paper_position_exits row is missing its closing exit_evaluations row.',
    );
    requireJoined(
      row,
      'position_evaluation_action',
      'A completed paper position is missing its opening position_evaluations row.',
    );
    requireJoined(
      row,
      'opening_paper_evaluation_source_identity',
      'A completed paper position is missing its opening paper_evaluations row.',
    );
    requireJoined(
      row,
      'strategy_definition_fingerprint',
      'A completed paper position is missing its opening strategy_evaluations row.',
    );
    requireJoined(
      row,
      'exit_market_snapshot_collected_at',
      'A completed paper trade exit evaluation is missing its market snapshot.',
    );

    return {
      tokenMint: asText(row['token_mint'], 'token mint'),
      positionPairAddress: asText(row['position_pair_address'], 'position pair'),
      exitPairAddress: asText(row['exit_pair_address'], 'exit pair'),
      exitEvaluationPairAddress: asText(
        row['exit_evaluation_pair_address'],
        'exit evaluation pair',
      ),
      openingPaperPairAddress: asText(row['opening_paper_pair_address'], 'opening paper pair'),
      positionId: asInteger(row['position_id'], 'position id'),
      exitEvaluationPositionId: asInteger(
        row['exit_evaluation_position_id'],
        'exit evaluation position id',
      ),
      positionTokenId: asInteger(row['position_token_id'], 'position token id'),
      exitTokenId: asInteger(row['exit_token_id'], 'exit token id'),
      exitEvaluationTokenId: asInteger(row['exit_evaluation_token_id'], 'exit evaluation token id'),
      openingPaperTokenId: asInteger(row['opening_paper_token_id'], 'opening paper token id'),
      strategyTokenId: asInteger(row['strategy_token_id'], 'strategy token id'),
      positionEvaluationTokenId: asInteger(
        row['position_evaluation_token_id'],
        'position evaluation token id',
      ),
      currentlyOpen: asInteger(row['currently_open'], 'currently open') !== 0,
      openPointerTokenId: asNullableInteger(row['open_pointer_token_id'], 'open pointer token id'),
      openedAt: asText(row['opened_at'], 'openedAt'),
      entryMarketCollectedAt: asText(row['entry_market_collected_at'], 'entryMarketCollectedAt'),
      entryPriceUsd: asFinite(row['entry_price_usd'], 'entryPriceUsd'),
      entryNotionalUsd: asFinite(row['entry_notional_usd'], 'entryNotionalUsd'),
      positionQuantityTokens: asFinite(row['position_quantity_tokens'], 'quantityTokens'),
      positionSpecVersion: asText(row['position_spec_version'], 'position spec version'),
      positionDefinitionFingerprint: asText(
        row['position_definition_fingerprint'],
        'position definition fingerprint',
      ),
      positionSourceIdentity: asText(row['position_source_identity'], 'position source identity'),
      openingPaperSourceIdentity: asText(
        row['opening_paper_source_identity'],
        'opening paper source identity',
      ),
      openingPaperEvaluationSourceIdentity: asText(
        row['opening_paper_evaluation_source_identity'],
        'opening paper evaluation source identity',
      ),
      openingPaperSpecVersion: asText(row['paper_spec_version'], 'paper spec version'),
      openingPaperDefinitionFingerprint: asText(
        row['paper_definition_fingerprint'],
        'paper definition fingerprint',
      ),
      openingPaperStrategyDefinitionFingerprint: asText(
        row['opening_paper_strategy_definition_fingerprint'],
        'paper strategy definition fingerprint',
      ),
      openingPaperFeatureSetVersion: asText(
        row['opening_paper_feature_set_version'],
        'paper feature set',
      ),
      openingPaperAction: asText(row['opening_paper_action'], 'opening paper action'),
      openingPaperStrategyDecision: asText(
        row['opening_paper_strategy_decision'],
        'opening paper strategy decision',
      ),
      openingPaperSimulatedEntryPriceUsd: asNullableFinite(
        row['opening_paper_simulated_entry_price_usd'],
        'opening paper simulated entry price',
      ),
      openingPaperReferencePriceUsd: asNullableFinite(
        row['opening_paper_reference_price_usd'],
        'opening paper reference price',
      ),
      openingPaperEvaluatedAt: asText(row['opening_paper_evaluated_at'], 'opening paper evaluatedAt'),
      openingPaperAsOf: asText(row['opening_paper_as_of'], 'opening paper asOf'),
      openingPaperMarketCollectedAt: asText(
        row['opening_paper_market_collected_at'],
        'opening paper marketCollectedAt',
      ),
      openingPaperEvaluationId: asInteger(
        row['opening_paper_evaluation_id'],
        'opening paper evaluation id',
      ),
      positionEvaluationPaperEvaluationId: asInteger(
        row['position_evaluation_paper_evaluation_id'],
        'position evaluation paper evaluation id',
      ),
      positionEvaluationSourceIdentity: asText(
        row['position_evaluation_source_identity'],
        'position evaluation source identity',
      ),
      positionEvaluationPositionSourceIdentity: asNullableText(
        row['position_evaluation_position_source_identity'],
        'position evaluation position source identity',
      ),
      positionEvaluationAction: asText(
        row['position_evaluation_action'],
        'position evaluation action',
      ),
      positionEvaluationPaperAction: asText(
        row['position_evaluation_paper_action'],
        'position evaluation paper action',
      ),
      positionEvaluationPriorOpenPositionId: asNullableInteger(
        row['prior_open_position_id'],
        'position evaluation prior open position id',
      ),
      positionEvaluationPriorOpenPositionSourceIdentity: asNullableText(
        row['prior_open_position_source_identity'],
        'position evaluation prior open position source identity',
      ),
      positionEvaluationEntryPriceUsd: asNullableFinite(
        row['position_evaluation_entry_price_usd'],
        'position evaluation entry price',
      ),
      positionEvaluationEntryNotionalUsd: asNullableFinite(
        row['position_evaluation_entry_notional_usd'],
        'position evaluation entry notional',
      ),
      positionEvaluationQuantityTokens: asNullableFinite(
        row['position_evaluation_quantity_tokens'],
        'position evaluation quantity',
      ),
      positionEvaluationSpecVersion: asText(
        row['position_evaluation_spec_version'],
        'position evaluation spec version',
      ),
      positionEvaluationDefinitionFingerprint: asText(
        row['position_evaluation_definition_fingerprint'],
        'position evaluation definition fingerprint',
      ),
      strategyVersion: asText(row['strategy_version'], 'strategy version'),
      strategyDefinitionFingerprint: asText(
        row['strategy_definition_fingerprint'],
        'strategy definition fingerprint',
      ),
      strategyFeatureSetVersion: asText(
        row['strategy_feature_set_version'],
        'strategy feature set',
      ),
      strategySourceIdentity: asText(row['strategy_source_identity'], 'strategy source identity'),
      strategyDecision: asText(row['strategy_decision'], 'strategy decision'),
      strategyEvaluatedAt: asText(row['strategy_evaluated_at'], 'strategy evaluatedAt'),
      strategyAsOf: asText(row['strategy_as_of'], 'strategy asOf'),
      exitEvidenceId: asInteger(row['exit_evidence_id'], 'exit evidence id'),
      exitEvaluationId: asInteger(row['exit_evaluation_id'], 'exit evaluation id'),
      exitEvidenceSpecVersion: asText(
        row['exit_evidence_spec_version'],
        'exit evidence spec version',
      ),
      exitEvidenceDefinitionFingerprint: asText(
        row['exit_evidence_definition_fingerprint'],
        'exit evidence definition fingerprint',
      ),
      exitEvidencePositionDefinitionFingerprint: asText(
        row['exit_evidence_position_definition_fingerprint'],
        'exit evidence position fingerprint',
      ),
      exitEvaluationSpecVersion: asText(
        row['exit_evaluation_spec_version'],
        'exit evaluation spec version',
      ),
      exitEvaluationDefinitionFingerprint: asText(
        row['exit_evaluation_definition_fingerprint'],
        'exit evaluation definition fingerprint',
      ),
      exitEvaluationPositionDefinitionFingerprint: asText(
        row['exit_evaluation_position_definition_fingerprint'],
        'exit evaluation position fingerprint',
      ),
      exitEvaluationPositionSourceIdentity: asText(
        row['exit_evaluation_position_source_identity'],
        'exit evaluation position source identity',
      ),
      exitAction: asText(row['exit_action'], 'exit action'),
      exitReason: asText(row['exit_reason'], 'exit reason'),
      exitedAt: asText(row['exited_at'], 'exitedAt'),
      exitMarketCollectedAt: asText(row['exit_market_collected_at'], 'exitMarketCollectedAt'),
      exitEvaluationMarketCollectedAt: asText(
        row['exit_evaluation_market_collected_at'],
        'exit evaluation marketCollectedAt',
      ),
      exitEvaluationEvaluatedAt: asText(
        row['exit_evaluation_evaluated_at'],
        'exit evaluation evaluatedAt',
      ),
      exitEvaluationAsOf: asText(row['exit_evaluation_as_of'], 'exit evaluation asOf'),
      exitPriceUsd: asFinite(row['exit_price_usd'], 'exitPriceUsd'),
      exitQuantityTokens: asFinite(row['exit_quantity_tokens'], 'exitQuantityTokens'),
      exitEvaluationSimulatedExitPriceUsd: asNullableFinite(
        row['simulated_exit_price_usd'],
        'simulatedExitPriceUsd',
      ),
      exitEvaluationClosedQuantityTokens: asNullableFinite(
        row['closed_quantity_tokens'],
        'closedQuantityTokens',
      ),
      exitEvaluationObservedPriceUsd: asNullableFinite(
        row['exit_evaluation_observed_price_usd'],
        'observedPriceUsd',
      ),
      exitEvaluationEntryPriceUsd: asFinite(
        row['exit_evaluation_entry_price_usd'],
        'exit evaluation entryPriceUsd',
      ),
      exitEvaluationStopTriggerPriceUsd: asFinite(
        row['exit_evaluation_stop_trigger_price_usd'],
        'stopTriggerPriceUsd',
      ),
      exitEvaluationTakeProfitTriggerPriceUsd: asFinite(
        row['exit_evaluation_take_profit_trigger_price_usd'],
        'takeProfitTriggerPriceUsd',
      ),
      exitEvaluationHoldingAgeMs: asInteger(
        row['exit_evaluation_holding_age_ms'],
        'holdingAgeMs',
      ),
      exitEvaluationMaxHoldingMs: asInteger(
        row['exit_evaluation_max_holding_ms'],
        'maxHoldingMs',
      ),
      exitMarketSnapshotId: asInteger(row['exit_market_snapshot_id'], 'exit market snapshot id'),
      exitMarketSnapshotPairAddress: asText(
        row['exit_market_snapshot_pair_address'],
        'exit market snapshot pair',
      ),
      exitMarketSnapshotPriceUsd: asNullableFinite(
        row['exit_market_snapshot_price_usd'],
        'exit market snapshot price',
      ),
      exitMarketSnapshotCollectedAt: asText(
        row['exit_market_snapshot_collected_at'],
        'exit market snapshot collectedAt',
      ),
      closingPositionSourceIdentity: asText(
        row['closing_position_source_identity'],
        'closing position source identity',
      ),
      exitEvidenceSourceIdentity: asText(
        row['exit_evidence_source_identity'],
        'exit evidence source identity',
      ),
      exitEvaluationSourceIdentity: asText(
        row['exit_evaluation_source_identity'],
        'exit evaluation source identity',
      ),
    };
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new PerformanceError('Performance data source is closed.');
    }
  }
}

export function openSqlitePerformanceDataSource(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): SqlitePerformanceDataSource {
  return new SqlitePerformanceDataSource(openReadOnlyPerformanceDatabase(config));
}

export function openReadOnlyPerformanceDatabase(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): DatabaseSync {
  const location = resolveDatabasePath(config.path);
  if (location === MEMORY_DATABASE_PATH) {
    throw new PerformanceError('Performance analytics requires an existing on-disk database file.');
  }
  if (!existsSync(location)) {
    throw new PerformanceError(
      `Database file does not exist at ${location}. Run npm run db:init outside the performance command if initialization is needed. Performance commands do not add a missing database file.`,
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
    throw new PerformanceError('Could not open the historical database as read-only.', {
      cause: error,
    });
  }
}

function requireJoined(row: Record<string, SQLOutputValue>, key: string, message: string): void {
  if (row[key] === null || row[key] === undefined) {
    throw new PerformanceError(message);
  }
}

function asText(value: SQLOutputValue | undefined, field: string): string {
  if (typeof value !== 'string') {
    throw new PerformanceError(`Completed paper trade evidence has invalid ${field}.`);
  }
  return value;
}

function asNullableText(value: SQLOutputValue | undefined, field: string): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asText(value, field);
}

function asInteger(value: SQLOutputValue | undefined, field: string): number {
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    if (!Number.isSafeInteger(numeric)) {
      throw new PerformanceError(`Completed paper trade evidence has invalid ${field}.`);
    }
    return numeric;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return value;
  }
  throw new PerformanceError(`Completed paper trade evidence has invalid ${field}.`);
}

function asNullableInteger(value: SQLOutputValue | undefined, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asInteger(value, field);
}

function asFinite(value: SQLOutputValue | undefined, field: string): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      throw new PerformanceError(`Completed paper trade evidence has invalid ${field}.`);
    }
    return numeric;
  }
  throw new PerformanceError(`Completed paper trade evidence has invalid ${field}.`);
}

function asNullableFinite(value: SQLOutputValue | undefined, field: string): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return asFinite(value, field);
}
