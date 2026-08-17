import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { FEATURE_NAMES, FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../src/exit/identity.js';
import {
  EXIT_MAX_HOLDING_MS,
  EXIT_SPEC_VERSION,
} from '../src/exit/constants.js';
import { evaluateExitAction } from '../src/exit/evaluator.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from '../src/paper/constants.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { POSITION_SPEC_NAME, POSITION_SPEC_VERSION } from '../src/position/constants.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import type { ExitBundle } from '../src/persistence/types.js';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import {
  EXIT_MIGRATION_NAME,
  EXIT_MIGRATION_VERSION,
  INITIAL_MIGRATION_NAME,
  migrationSql,
  migrationSqlDigest,
} from '../src/persistence/sqlite/migrations.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from '../src/strategy/constants.js';
import { PAIR_ADDRESS, T_09_00, T_10_00, T_10_05, T_10_10, T_10_15 } from './feature-fixtures.js';
import {
  addMs,
  exitMarketSnapshot,
  laterOpenPositionBundle,
  nextRepresentableNumber,
  openPositionBundle,
} from './exit-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

function openMemoryRepo(): SqlitePersistenceRepository {
  const repository = createSqlitePersistenceRepository({
    path: ':memory:',
    busyTimeoutMs: 1000,
  });
  repository.initialize();
  openRepos.push(repository);
  return repository;
}

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

function openedExit(repository: SqlitePersistenceRepository) {
  repository.recordPositionBundle(openPositionBundle());
  const open = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
  if (open === null) {
    throw new Error('expected an open paper position');
  }
  return open;
}

function exitAt(
  repository: SqlitePersistenceRepository,
  overrides: { priceUsd?: number | null; collectedAt?: string } = {},
): ExitBundle {
  const open = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
  if (open === null) {
    throw new Error('expected an open paper position');
  }
  const marketSnapshot = exitMarketSnapshot(open, {
    priceUsd: overrides.priceUsd === undefined ? 100 : overrides.priceUsd,
    collectedAt: overrides.collectedAt ?? open.openedAt,
  });
  return {
    openPosition: open,
    marketSnapshot,
    exitEvaluation: evaluateExitAction({ openPosition: open, marketSnapshot }),
  };
}

const V6_TABLES = [
  'tokens',
  'market_snapshots',
  'risk_scans',
  'risk_scan_checks',
  'feature_vectors',
  'feature_values',
  'strategy_definitions',
  'strategy_evaluations',
  'strategy_rule_results',
  'paper_definitions',
  'paper_evaluations',
  'position_definitions',
  'position_evaluations',
  'paper_positions',
  'paper_open_positions',
] as const;

function dumpTables(database: ReturnType<typeof openSqliteDatabase>, tables: readonly string[]) {
  const dumped: Record<string, unknown[]> = {};
  for (const table of tables) {
    dumped[table] = database.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all();
  }
  return dumped;
}

describe('exit persistence migration', () => {
  it('appends migration 007 and keeps 001-006 byte-identical', () => {
    expect(EXIT_MIGRATION_VERSION).toBe(7);
    expect(EXIT_MIGRATION_NAME).toBe('007_exit_engine');
    expect(INITIAL_MIGRATION_NAME).toBe('001_initial_persistence');
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(2)).toBe('c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e');
    expect(migrationSqlDigest(3)).toBe('891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c');
    expect(migrationSqlDigest(4)).toBe('eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308');
    expect(migrationSqlDigest(5)).toBe('5435dc4d919729f38474f6cbcdb18a5993b5688d6d97fd31b15fcd75ea26c629');
    expect(migrationSqlDigest(6)).toBe('ddffdd15c0ee0d67e2146854aa6a3adb87c0f0497999de9c80a9bfa4210bdbb0');
    expect(migrationSql(6)).toContain('CREATE TABLE paper_open_positions');
    expect(migrationSql(7)).toContain('CREATE TABLE exit_definitions');
    expect(migrationSql(7)).toContain('CREATE TABLE exit_evaluations');
    expect(migrationSql(7)).toContain('CREATE TABLE paper_position_exits');
    expect(migrationSql(7)).toContain('CREATE UNIQUE INDEX market_snapshots_id_token_id');
    expect(migrationSql(7)).toContain('FOREIGN KEY (position_id, token_id) REFERENCES paper_positions(id, token_id)');
    expect(migrationSql(7)).toContain(
      'FOREIGN KEY (market_snapshot_id, token_id) REFERENCES market_snapshots(id, token_id)',
    );
    expect(migrationSql(7)).not.toMatch(/realized_pnl|unrealized_pnl|return_pct|equity_curve|profit_usd/);
    expect(migrationSql(6)).not.toContain('exit_evaluations');
  });

  it('upgrades a populated v6 database to v7 without deleting older rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-mig-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw, { targetVersion: 6 });
      raw.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('solana', ?, ?, ?, ?)`,
      ).run(WRAPPED_SOL_MINT, T_09_00, T_09_00, T_09_00);
      raw.prepare(
        `INSERT INTO market_snapshots (token_id, chain, dex_id, pair_address, collected_at, price_usd)
         VALUES (1, 'solana', 'orca', ?, ?, 100)`,
      ).run(PAIR_ADDRESS, T_10_00);
      raw.prepare(
        `INSERT INTO risk_scans (
          token_id, scanned_at, commitment, token_program, program_owner, mint_context_slot, decimals,
          largest_accounts_count, data_completeness, highest_finding_severity
        ) VALUES (1, ?, 'confirmed', 'spl_token', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 1, 9, 1, 'partial', 'info')`,
      ).run(T_09_00);
      raw.prepare(
        `INSERT INTO risk_scan_checks (scan_id, check_name, ok, context_slot, error)
         VALUES (1, 'mint_account', 1, 1, NULL)`,
      ).run();
      raw.prepare(
        `INSERT INTO feature_vectors (
          token_id, feature_set_version, generated_at, as_of, market_collected_at, market_pair_address,
          previous_market_collected_at, risk_scanned_at, feature_completeness, available_feature_count,
          unavailable_feature_count, source_identity
        ) VALUES (1, 'c06_v1', ?, ?, ?, ?, NULL, NULL, 'partial', 0, ?, 'legacy-v6-feature')`,
      ).run(T_10_00, T_10_00, T_10_00, PAIR_ADDRESS, FEATURE_NAMES.length);
      const insertValue = raw.prepare(
        `INSERT INTO feature_values (
          vector_id, ordinal, feature_name, kind, status, number_value, integer_value, boolean_value,
          unavailable_reason
        ) VALUES (1, ?, ?, 'number', 'unavailable', NULL, NULL, NULL, 'legacy')`,
      );
      for (const [ordinal, name] of FEATURE_NAMES.entries()) {
        insertValue.run(ordinal, name);
      }
      raw.prepare(
        `INSERT INTO strategy_definitions (
          strategy_version, strategy_name, feature_set_version, definition_fingerprint, first_recorded_at
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(STRATEGY_VERSION, STRATEGY_NAME, FEATURE_SET_VERSION, STRATEGY_DEFINITION_FINGERPRINT, T_10_00);
      raw.prepare(
        `INSERT INTO strategy_evaluations (
          token_id, feature_vector_id, strategy_version, strategy_definition_fingerprint, feature_set_version,
          evaluated_at, as_of, decision, passed_rule_count, failed_rule_count, unavailable_rule_count,
          source_identity
        ) VALUES (1, 1, ?, ?, 'c06_v1', ?, ?, 'entry_candidate', 1, 0, 0, 'legacy-v6-strategy')`,
      ).run(STRATEGY_VERSION, STRATEGY_DEFINITION_FINGERPRINT, T_10_00, T_10_00);
      raw.prepare(
        `INSERT INTO strategy_rule_results (
          evaluation_id, ordinal, rule_code, category, status, description, criterion, observed, reason
        ) VALUES (1, 0, 'legacy_rule', 'market_quality', 'pass', 'legacy', 'legacy', 'legacy', 'legacy')`,
      ).run();
      raw.prepare(
        `INSERT INTO paper_definitions (
          paper_spec_version, paper_spec_name, feature_set_version, strategy_version,
          strategy_definition_fingerprint, definition_fingerprint, first_recorded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        PAPER_SPEC_VERSION,
        PAPER_SPEC_NAME,
        FEATURE_SET_VERSION,
        STRATEGY_VERSION,
        STRATEGY_DEFINITION_FINGERPRINT,
        PAPER_DEFINITION_FINGERPRINT,
        T_10_00,
      );
      raw.prepare(
        `INSERT INTO paper_evaluations (
          token_id, strategy_evaluation_id, paper_spec_version, paper_definition_fingerprint,
          strategy_definition_fingerprint, feature_set_version, as_of, evaluated_at, market_collected_at,
          pair_address, strategy_decision, paper_action, no_action_reason, reference_price_usd,
          simulated_entry_price_usd, execution_model, cost_model, quantity_model, position_model,
          exit_model, source_identity
        ) VALUES (1, 1, ?, ?, ?, 'c06_v1', ?, ?, ?, ?, 'entry_candidate', 'entry_observation', NULL, 100, 100,
          'exact_strategy_market_snapshot_reference_price', 'none', 'none', 'none', 'none', 'legacy-v6-paper')`,
      ).run(
        PAPER_SPEC_VERSION,
        PAPER_DEFINITION_FINGERPRINT,
        STRATEGY_DEFINITION_FINGERPRINT,
        T_10_00,
        T_10_00,
        T_10_00,
        PAIR_ADDRESS,
      );
      raw.prepare(
        `INSERT INTO position_definitions (
          position_spec_version, position_spec_name, paper_spec_version, paper_definition_fingerprint,
          entry_notional_usd, quantity_formula, max_open_positions_per_token, definition_fingerprint,
          first_recorded_at
        ) VALUES (?, ?, ?, ?, 100, 'entryNotionalUsd / entryPriceUsd', 1, ?, ?)`,
      ).run(
        POSITION_SPEC_VERSION,
        POSITION_SPEC_NAME,
        PAPER_SPEC_VERSION,
        PAPER_DEFINITION_FINGERPRINT,
        POSITION_DEFINITION_FINGERPRINT,
        T_10_00,
      );
      raw.prepare(
        `INSERT INTO position_evaluations (
          token_id, paper_evaluation_id, position_spec_version, position_definition_fingerprint,
          paper_definition_fingerprint, as_of, evaluated_at, paper_action, paper_no_action_reason,
          prior_open_position_id, prior_open_position_source_identity, position_action, position_reason,
          entry_price_usd, entry_notional_usd, quantity_tokens, position_source_identity, source_identity
        ) VALUES (1, 1, ?, ?, ?, ?, ?, 'entry_observation', NULL, NULL, NULL, 'open_position', NULL,
          100, 100, 1, 'legacy-v6-position-source', 'legacy-v6-position')`,
      ).run(
        POSITION_SPEC_VERSION,
        POSITION_DEFINITION_FINGERPRINT,
        PAPER_DEFINITION_FINGERPRINT,
        T_10_00,
        T_10_00,
      );
      raw.prepare(
        `INSERT INTO paper_positions (
          token_id, position_evaluation_id, opening_paper_evaluation_id, position_spec_version,
          position_definition_fingerprint, pair_address, opened_at, entry_market_collected_at,
          entry_price_usd, entry_notional_usd, quantity_tokens, opening_paper_source_identity, source_identity
        ) VALUES (1, 1, 1, ?, ?, ?, ?, ?, 100, 100, 1, 'legacy-v6-paper', 'legacy-v6-position-source')`,
      ).run(
        POSITION_SPEC_VERSION,
        POSITION_DEFINITION_FINGERPRINT,
        PAIR_ADDRESS,
        T_10_00,
        T_10_00,
      );
      raw.prepare('INSERT INTO paper_open_positions (token_id, position_id) VALUES (1, 1)').run();

      const before = dumpTables(raw, V6_TABLES);
      expect(before.feature_values).toHaveLength(48);
      expect(before.paper_positions).toHaveLength(1);
      expect(before.paper_open_positions).toHaveLength(1);
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        repository.initialize();
        const stats = repository.getStats();
        expect(stats.schemaVersion).toBe(7);
        expect(repository.getTableCounts().schemaMigrations).toBe(7);
        expect(stats.paperPositionCount).toBe(1);
        expect(stats.openPaperPositionCount).toBe(1);
        expect(stats.exitEvaluationCount).toBe(0);
        expect(stats.paperPositionExitCount).toBe(0);
        expect(stats.integrity.ok).toBe(true);

        const after = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
        try {
          expect(dumpTables(after, V6_TABLES)).toEqual(before);
          expect(after.prepare('SELECT COUNT(*) AS count FROM exit_definitions').get()?.['count']).toBe(0);
          expect(after.prepare('SELECT COUNT(*) AS count FROM exit_evaluations').get()?.['count']).toBe(0);
          expect(after.prepare('SELECT COUNT(*) AS count FROM paper_position_exits').get()?.['count']).toBe(0);
          expect(String(Object.values(after.prepare('PRAGMA quick_check').get() ?? {})[0] ?? '')).toBe('ok');
          expect(after.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        } finally {
          after.close();
        }
      } finally {
        repository.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('exit persistence behavior', () => {
  it('persists a hold without inserting an exit or removing open state', () => {
    const repository = openMemoryRepo();
    const open = openedExit(repository);
    const beforePositions = repository.getTableCounts().paperPositions;
    const recorded = repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
    expect(recorded.openPositionRemoved).toBe(false);
    expect(recorded.paperPositionExitId).toBeNull();
    expect(repository.getStats().exitEvaluationCount).toBe(1);
    expect(repository.getStats().paperPositionExitCount).toBe(0);
    expect(repository.getTableCounts().paperPositions).toBe(beforePositions);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)?.id).toBe(open.id);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)?.positionSourceIdentity).toBe(
      open.positionSourceIdentity,
    );
  });

  it('reuses an exact duplicate hold evaluation without writing a second row', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    const first = repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
    const second = repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
    expect(first.inserted).toBe(true);
    expect(second.inserted).toBe(false);
    expect(second.exitEvaluationId).toBe(first.exitEvaluationId);
    expect(repository.getStats().exitEvaluationCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(1);
  });

  it('closes atomically, keeps the entry, and removes only the current-open row', () => {
    const repository = openMemoryRepo();
    const open = openedExit(repository);
    const recorded = repository.recordExitBundle(exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 }));
    expect(recorded.openPositionRemoved).toBe(true);
    expect(recorded.paperPositionExitId).toBe(1);
    expect(repository.getStats().paperPositionCount).toBe(1);
    expect(repository.getStats().paperPositionExitCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(0);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toBeNull();
    const history = repository.getExitHistory(WRAPPED_SOL_MINT, 20);
    expect(history?.evaluations[0]?.exitReason).toBe('stop_loss_threshold');
    expect(history?.evaluations[0]?.closedQuantityTokens).toBe(open.quantityTokens);
    expect(Object.is(history?.evaluations[0]?.closedQuantityTokens, open.quantityTokens)).toBe(true);
    expect(history?.evaluations[0]?.simulatedExitPriceUsd).toBe(90);
  });

  it('rolls back a close if any abort point fires, including after open-row delete', () => {
    const stages = [
      'market',
      'exitDefinition',
      'exitEvaluation',
      'paperPositionExit',
      'openPositionDelete',
    ] as const;
    for (const stage of stages) {
      const repository = openMemoryRepo();
      openedExit(repository);
      const before = repository.getTableCounts();
      const bundle = exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 });
      expect(() => {
        repository.recordExitBundleAndAbortAfter(bundle, stage);
      }).toThrow(/Test-forced write failure/);
      expect(repository.getTableCounts(), stage).toEqual(before);
      expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT), stage).not.toBeNull();
      expect(repository.getStats().paperPositionExitCount, stage).toBe(0);
      expect(repository.verifyIntegrity().ok, stage).toBe(true);
    }
  });

  it('restores the open row after DELETE abort and keeps SQLite integrity_check clean', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-abort-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      repository.initialize();
      openedExit(repository);
      const before = repository.getTableCounts();
      const bundle = exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 });
      expect(() => {
        repository.recordExitBundleAndAbortAfter(bundle, 'openPositionDelete');
      }).toThrow(/Test-forced write failure after open-position delete/);
      expect(repository.getTableCounts()).toEqual(before);
      expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).not.toBeNull();
      expect(repository.verifyIntegrity().ok).toBe(true);
      repository.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        expect(database.prepare('PRAGMA integrity_check').get()?.['integrity_check']).toBe('ok');
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(
          database.prepare('SELECT COUNT(*) AS count FROM paper_open_positions').get()?.['count'],
        ).toBe(1);
        expect(
          database.prepare('SELECT COUNT(*) AS count FROM paper_position_exits').get()?.['count'],
        ).toBe(0);
        expect(
          database.prepare('SELECT COUNT(*) AS count FROM exit_evaluations').get()?.['count'],
        ).toBe(0);
      } finally {
        database.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('CASE A: exact successful close retry reuses the stored result without writing', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    const bundle = exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 });
    const first = repository.recordExitBundle(bundle);
    const afterClose = repository.getTableCounts();
    const lastObservedAt = repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt;
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toBeNull();
    expect(first.inserted).toBe(true);
    expect(first.openPositionRemoved).toBe(true);

    const second = repository.recordExitBundle(bundle);
    expect(second.inserted).toBe(false);
    expect(second.marketInserted).toBe(false);
    expect(second.exitDefinitionInserted).toBe(false);
    expect(second.openPositionRemoved).toBe(true);
    expect(second.exitEvaluationId).toBe(first.exitEvaluationId);
    expect(second.marketSnapshotId).toBe(first.marketSnapshotId);
    expect(second.paperPositionExitId).toBe(first.paperPositionExitId);
    expect(second.sourceIdentity).toBe(first.sourceIdentity);
    expect(repository.getTableCounts()).toEqual(afterClose);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(lastObservedAt);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toBeNull();
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 20)?.evaluations).toHaveLength(1);
    expect(
      Object.is(
        repository.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations[0]?.closedQuantityTokens,
        bundle.openPosition.quantityTokens,
      ),
    ).toBe(true);
  });

  it('CASE B: a stale independent close is rejected after another valid close', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    const independent = exitAt(repository, { priceUsd: 120, collectedAt: T_10_05 });
    const closer = exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 });
    repository.recordExitBundle(closer);
    const afterClose = repository.getTableCounts();
    const lastObservedAt = repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt;
    expect(() => repository.recordExitBundle(independent)).toThrow(/open-position state changed/);
    expect(repository.getTableCounts()).toEqual(afterClose);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(lastObservedAt);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toBeNull();
    expect(repository.getStats().paperPositionExitCount).toBe(1);
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 20)?.evaluations).toHaveLength(1);
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations[0]?.exitReason).toBe('stop_loss_threshold');
  });

  it('CASE C: a stale A close must not delete or mutate reopened position B', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    const seeingA = exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 });
    repository.recordExitBundle(seeingA);
    repository.recordPositionBundle(laterOpenPositionBundle());
    const openB = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    expect(openB).not.toBeNull();
    const afterOpenB = repository.getTableCounts();
    const lastObservedAt = repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt;
    expect(() => repository.recordExitBundle(seeingA)).toThrow(/open-position state changed/);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)?.id).toBe(openB?.id);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)?.positionSourceIdentity).toBe(
      openB?.positionSourceIdentity,
    );
    expect(repository.getTableCounts()).toEqual(afterOpenB);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(lastObservedAt);
    expect(repository.getStats().paperPositionCount).toBe(2);
    expect(repository.getStats().paperPositionExitCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(1);
  });

  it('rejects caller state whose immutable facts no longer match', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    const bundle = exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 });
    expect(() =>
      repository.recordExitBundle({
        ...bundle,
        openPosition: { ...bundle.openPosition, quantityTokens: nextRepresentableNumber(bundle.openPosition.quantityTokens) },
      }),
    ).toThrow(/quantity|open-position state changed|entryPriceUsd|does not match/);
  });

  it('links the exact passed market snapshot, not the latest row', () => {
    const repository = openMemoryRepo();
    const open = openedExit(repository);
    const older = exitMarketSnapshot(open, { priceUsd: 100, collectedAt: T_10_00 });
    const newer = exitMarketSnapshot(open, { priceUsd: 50, collectedAt: T_10_05 });
    repository.recordMarketSnapshots([older, newer]);
    const recorded = repository.recordExitBundle({
      openPosition: open,
      marketSnapshot: older,
      exitEvaluation: evaluateExitAction({ openPosition: open, marketSnapshot: older }),
    });
    const history = repository.getExitHistory(WRAPPED_SOL_MINT, 20);
    expect(history?.evaluations[0]?.marketSnapshotId).toBe(recorded.marketSnapshotId);
    expect(history?.evaluations[0]?.observedPriceUsd).toBe(100);
    expect(history?.evaluations[0]?.exitAction).toBe('no_change');
    expect(repository.getStats().marketSnapshotCount).toBeGreaterThanOrEqual(2);
  });

  it('rejects the same market identity with a changed price', () => {
    const repository = openMemoryRepo();
    const open = openedExit(repository);
    const market = exitMarketSnapshot(open, { priceUsd: 100, collectedAt: T_10_00 });
    repository.recordExitBundle({
      openPosition: open,
      marketSnapshot: market,
      exitEvaluation: evaluateExitAction({ openPosition: open, marketSnapshot: market }),
    });
    const changed = { ...market, priceUsd: 99 };
    expect(() =>
      repository.recordExitBundle({
        openPosition: open,
        marketSnapshot: changed,
        exitEvaluation: evaluateExitAction({ openPosition: open, marketSnapshot: changed }),
      }),
    ).toThrow(/different values/);
  });

  it('enforces one immutable exit per paper position', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    repository.recordExitBundle(exitAt(repository, { priceUsd: 90, collectedAt: T_10_00 }));
    expect(repository.getStats().paperPositionExitCount).toBe(1);

    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-unique-'));
    const path = join(directory, 'history.sqlite');
    const fileRepo = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      fileRepo.initialize();
      openedExit(fileRepo);
      fileRepo.recordExitBundle(exitAt(fileRepo, { priceUsd: 90, collectedAt: T_10_00 }));
      fileRepo.close();
      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        expect(() => {
          database.prepare(
            `INSERT INTO paper_position_exits (
              token_id, position_id, exit_evaluation_id, exit_spec_version, exit_definition_fingerprint,
              position_definition_fingerprint, pair_address, exited_at, exit_market_collected_at,
              exit_price_usd, quantity_tokens, closing_position_source_identity, source_identity
            ) VALUES (1, 1, 1, ?, ?, ?, ?, ?, ?, 90, 1, 'src', 'dup-exit')`,
          ).run(
            EXIT_SPEC_VERSION,
            EXIT_DEFINITION_FINGERPRINT,
            POSITION_DEFINITION_FINGERPRINT,
            PAIR_ADDRESS,
            T_10_00,
            T_10_00,
          );
        }).toThrow();
      } finally {
        database.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('supports hold then close then reopen of the same token', () => {
    const repository = openMemoryRepo();
    const first = openedExit(repository);
    repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
    repository.recordExitBundle(exitAt(repository, { priceUsd: 90, collectedAt: T_10_05 }));
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toBeNull();
    expect(repository.getStats().paperPositionCount).toBe(1);
    expect(repository.getStats().paperPositionExitCount).toBe(1);

    repository.recordPositionBundle(laterOpenPositionBundle());
    const second = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    expect(second).not.toBeNull();
    expect(second?.id).not.toBe(first.id);
    expect(repository.getStats().paperPositionCount).toBe(2);
    expect(repository.getStats().paperPositionExitCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(1);
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 20)?.evaluations).toHaveLength(2);
  });

  it('returns token-scoped history newest asOf first without recomputing exits', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
    repository.recordExitBundle(exitAt(repository, { priceUsd: 101, collectedAt: T_10_05 }));
    const history = repository.getExitHistory(WRAPPED_SOL_MINT, 20);
    expect(history?.evaluations.map((item) => item.asOf)).toEqual([T_10_05, T_10_00]);
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations.map((item) => item.asOf)).toEqual([T_10_05]);
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 20)?.evaluations).toHaveLength(2);
    expect(repository.getExitHistory(WRAPPED_SOL_MINT, 100)?.evaluations).toHaveLength(2);
  });

  it('rejects x11_v1 definition drift and leaves the stored row unchanged', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-drift-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      repository.initialize();
      openedExit(repository);
      repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
      repository.close();

      const stored = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      const original = stored.prepare('SELECT * FROM exit_definitions').get();
      if (original === undefined) {
        throw new Error('expected a stored exit definition');
      }
      const firstRecordedAt = original['first_recorded_at'];
      expect(() => {
        stored.prepare('UPDATE exit_definitions SET stop_loss_bps = 999').run();
      }).toThrow();
      expect(() => {
        stored.prepare('UPDATE exit_definitions SET take_profit_bps = 2001').run();
      }).toThrow();
      expect(() => {
        stored.prepare('UPDATE exit_definitions SET max_holding_ms = 1').run();
      }).toThrow();
      expect(() => {
        stored.prepare('UPDATE exit_definitions SET close_fraction_bps = 5000').run();
      }).toThrow();

      const runtimeDrift: Array<[string, string]> = [
        ['exit_spec_name', 'mutated'],
        ['position_spec_version', 'pm10_v2'],
        ['position_definition_fingerprint', '0'.repeat(64)],
        ['definition_fingerprint', '0'.repeat(64)],
      ];
      try {
        for (const [column, value] of runtimeDrift) {
          stored.prepare(`UPDATE exit_definitions SET ${column} = ?`).run(value);
          const retry = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
          try {
            retry.initialize();
            expect(() => {
              retry.recordExitBundle(exitAt(retry, { priceUsd: 100, collectedAt: T_10_05 }));
            }).toThrow(/x11_v1/);
          } finally {
            retry.close();
          }
          const restored = original[column];
          if (typeof restored !== 'string') {
            throw new Error(`expected original ${column} to be a string`);
          }
          stored.prepare(`UPDATE exit_definitions SET ${column} = ?`).run(restored);
        }
        expect(stored.prepare('SELECT first_recorded_at FROM exit_definitions').get()?.['first_recorded_at']).toBe(
          firstRecordedAt,
        );
        expect(stored.prepare('SELECT exit_spec_name FROM exit_definitions').get()?.['exit_spec_name']).toBe(
          original['exit_spec_name'],
        );
      } finally {
        stored.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects forged close/hold decisions and one-step price or quantity changes', () => {
    const repository = openMemoryRepo();
    openedExit(repository);
    const hold = exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 });
    expect(() =>
      repository.recordExitBundle({
        ...hold,
        exitEvaluation: {
          ...hold.exitEvaluation,
          exitAction: 'close_position',
          exitReason: 'stop_loss_threshold',
          simulatedExitPriceUsd: 100,
          closedQuantityTokens: hold.openPosition.quantityTokens,
        },
      }),
    ).toThrow(PersistenceError);

    const stop = exitAt(repository, { priceUsd: 90, collectedAt: T_10_10 });
    expect(() =>
      repository.recordExitBundle({
        ...stop,
        exitEvaluation: {
          ...stop.exitEvaluation,
          exitAction: 'no_change',
          exitReason: 'exit_conditions_not_met',
          simulatedExitPriceUsd: null,
          closedQuantityTokens: null,
        },
      }),
    ).toThrow(PersistenceError);
    expect(() =>
      repository.recordExitBundle({
        ...stop,
        exitEvaluation: { ...stop.exitEvaluation, exitReason: 'take_profit_threshold' },
      }),
    ).toThrow(PersistenceError);
    expect(() =>
      repository.recordExitBundle({
        ...stop,
        exitEvaluation: {
          ...stop.exitEvaluation,
          simulatedExitPriceUsd: nextRepresentableNumber(90),
        },
      }),
    ).toThrow(PersistenceError);
    expect(() =>
      repository.recordExitBundle({
        ...stop,
        exitEvaluation: {
          ...stop.exitEvaluation,
          closedQuantityTokens: nextRepresentableNumber(stop.openPosition.quantityTokens),
        },
      }),
    ).toThrow(PersistenceError);
    expect(Object.is(stop.exitEvaluation.closedQuantityTokens, stop.openPosition.quantityTokens)).toBe(true);
    expect(() =>
      repository.recordExitBundle({
        ...stop,
        exitEvaluation: { ...stop.exitEvaluation, holdingAgeMs: stop.exitEvaluation.holdingAgeMs + 1 },
      }),
    ).toThrow(PersistenceError);
    expect(() =>
      repository.recordExitBundle({
        ...stop,
        exitEvaluation: { ...stop.exitEvaluation, stopTriggerPriceUsd: 89 },
      }),
    ).toThrow(PersistenceError);

    const take = exitAt(repository, { priceUsd: 120, collectedAt: T_10_15 });
    expect(() =>
      repository.recordExitBundle({
        ...take,
        exitEvaluation: {
          ...take.exitEvaluation,
          exitAction: 'no_change',
          exitReason: 'exit_conditions_not_met',
          simulatedExitPriceUsd: null,
          closedQuantityTokens: null,
        },
      }),
    ).toThrow(PersistenceError);

    const maxHold = exitAt(repository, {
      priceUsd: 100,
      collectedAt: addMs(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)?.openedAt ?? T_10_00, EXIT_MAX_HOLDING_MS),
    });
    expect(maxHold.exitEvaluation.exitReason).toBe('max_holding_time');
    expect(() =>
      repository.recordExitBundle({
        ...maxHold,
        exitEvaluation: {
          ...maxHold.exitEvaluation,
          exitAction: 'no_change',
          exitReason: 'exit_conditions_not_met',
          simulatedExitPriceUsd: null,
          closedQuantityTokens: null,
        },
      }),
    ).toThrow(PersistenceError);
  });

  it('persists take-profit, max-hold, and zero-price closes', () => {
    const takeRepo = openMemoryRepo();
    openedExit(takeRepo);
    const take = takeRepo.recordExitBundle(exitAt(takeRepo, { priceUsd: 120, collectedAt: T_10_00 }));
    expect(take.openPositionRemoved).toBe(true);
    expect(takeRepo.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations[0]?.exitReason).toBe('take_profit_threshold');

    const timeRepo = openMemoryRepo();
    const open = openedExit(timeRepo);
    const maxAt = addMs(open.openedAt, EXIT_MAX_HOLDING_MS);
    const timed = timeRepo.recordExitBundle(exitAt(timeRepo, { priceUsd: 100, collectedAt: maxAt }));
    expect(timed.openPositionRemoved).toBe(true);
    expect(timeRepo.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations[0]?.exitReason).toBe('max_holding_time');

    const zeroRepo = openMemoryRepo();
    openedExit(zeroRepo);
    const zeroBundle = exitAt(zeroRepo, { priceUsd: 0, collectedAt: T_10_00 });
    const zero = zeroRepo.recordExitBundle(zeroBundle);
    expect(zero.openPositionRemoved).toBe(true);
    expect(zeroRepo.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations[0]?.simulatedExitPriceUsd).toBe(0);
    expect(Object.is(zeroRepo.getExitHistory(WRAPPED_SOL_MINT, 1)?.evaluations[0]?.simulatedExitPriceUsd, 0)).toBe(true);
    expect(zeroRepo.getStats().paperPositionExitCount).toBe(1);
    const zeroRetry = zeroRepo.recordExitBundle(zeroBundle);
    expect(zeroRetry.inserted).toBe(false);
    expect(zeroRetry.paperPositionExitId).toBe(zero.paperPositionExitId);
    expect(zeroRepo.getStats().paperPositionExitCount).toBe(1);
  });
});

describe('exit SQLite constraints', () => {
  it('rejects invalid actions, reasons, close shape, and cross-token FKs', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-sql-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      repository.initialize();
      openedExit(repository);
      repository.recordExitBundle(exitAt(repository, { priceUsd: 100, collectedAt: T_10_00 }));
      repository.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        const insertEval = database.prepare(
          `INSERT INTO exit_evaluations (
            token_id, position_id, market_snapshot_id, exit_spec_version, exit_definition_fingerprint,
            position_definition_fingerprint, position_source_identity, as_of, evaluated_at, pair_address,
            market_collected_at, observed_price_usd, entry_price_usd, stop_trigger_price_usd,
            take_profit_trigger_price_usd, holding_age_ms, max_holding_ms, exit_action, exit_reason,
            simulated_exit_price_usd, closed_quantity_tokens, source_identity
          ) VALUES (1, 1, ?, ?, ?, ?, 'src', ?, ?, ?, ?, ?, 100, 90, 120, 0, ?, ?, ?, ?, ?, ?)`,
        );
        const marketId = Number(database.prepare('SELECT MAX(id) AS id FROM market_snapshots').get()?.['id']);
        const spec = EXIT_SPEC_VERSION;
        const fingerprint = EXIT_DEFINITION_FINGERPRINT;
        const positionFingerprint = POSITION_DEFINITION_FINGERPRINT;

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            100,
            EXIT_MAX_HOLDING_MS,
            'sell',
            'exit_conditions_not_met',
            null,
            null,
            'bad-action',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            90,
            EXIT_MAX_HOLDING_MS,
            'close_position',
            'stop_loss_threshold',
            null,
            1,
            'close-null-obs',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            90,
            EXIT_MAX_HOLDING_MS,
            'close_position',
            'stop_loss_threshold',
            91,
            1,
            'close-mismatch-price',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            90,
            EXIT_MAX_HOLDING_MS,
            'close_position',
            'stop_loss_threshold',
            90,
            null,
            'close-null-qty',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            90,
            EXIT_MAX_HOLDING_MS,
            'close_position',
            'stop_loss_threshold',
            90,
            0,
            'close-zero-qty',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            100,
            EXIT_MAX_HOLDING_MS,
            'no_change',
            'exit_conditions_not_met',
            100,
            null,
            'hold-with-sim',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            1,
            EXIT_MAX_HOLDING_MS,
            'no_change',
            'market_price_unavailable',
            null,
            null,
            'unavail-with-price',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            999,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            100,
            EXIT_MAX_HOLDING_MS,
            'no_change',
            'exit_conditions_not_met',
            null,
            null,
            'bad-market-fk',
          );
        }).toThrow();

        expect(() => {
          database.prepare(
            `INSERT INTO exit_evaluations (
              token_id, position_id, market_snapshot_id, exit_spec_version, exit_definition_fingerprint,
              position_definition_fingerprint, position_source_identity, as_of, evaluated_at, pair_address,
              market_collected_at, observed_price_usd, entry_price_usd, stop_trigger_price_usd,
              take_profit_trigger_price_usd, holding_age_ms, max_holding_ms, exit_action, exit_reason,
              simulated_exit_price_usd, closed_quantity_tokens, source_identity
            ) VALUES (1, 999, ?, ?, ?, ?, 'src', ?, ?, ?, ?, 100, 100, 90, 120, 0, ?, 'no_change',
              'exit_conditions_not_met', NULL, NULL, 'bad-position-fk')`,
          ).run(marketId, spec, fingerprint, positionFingerprint, T_10_05, T_10_05, PAIR_ADDRESS, T_10_05, EXIT_MAX_HOLDING_MS);
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            100,
            EXIT_MAX_HOLDING_MS,
            'no_change',
            'explode',
            null,
            null,
            'bad-reason',
          );
        }).toThrow();

        expect(() => {
          insertEval.run(
            marketId,
            'x11_v2',
            fingerprint,
            positionFingerprint,
            T_10_05,
            T_10_05,
            PAIR_ADDRESS,
            T_10_05,
            100,
            EXIT_MAX_HOLDING_MS,
            'no_change',
            'exit_conditions_not_met',
            null,
            null,
            'bad-definition-fk',
          );
        }).toThrow();

        database.prepare(
          `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
           VALUES ('solana', ?, ?, ?, ?)`,
        ).run(USDC_MINT, T_10_00, T_10_00, T_10_00);
        expect(() => {
          database.prepare(
            `INSERT INTO exit_evaluations (
              token_id, position_id, market_snapshot_id, exit_spec_version, exit_definition_fingerprint,
              position_definition_fingerprint, position_source_identity, as_of, evaluated_at, pair_address,
              market_collected_at, observed_price_usd, entry_price_usd, stop_trigger_price_usd,
              take_profit_trigger_price_usd, holding_age_ms, max_holding_ms, exit_action, exit_reason,
              simulated_exit_price_usd, closed_quantity_tokens, source_identity
            ) VALUES (2, 1, ?, ?, ?, ?, 'src', ?, ?, ?, ?, 100, 100, 90, 120, 0, ?, 'no_change',
              'exit_conditions_not_met', NULL, NULL, 'cross-token-position')`,
          ).run(marketId, spec, fingerprint, positionFingerprint, T_10_05, T_10_05, PAIR_ADDRESS, T_10_05, EXIT_MAX_HOLDING_MS);
        }).toThrow();

        const foreignMarketId = Number(
          database.prepare(
            `INSERT INTO market_snapshots (token_id, chain, dex_id, pair_address, collected_at, price_usd)
             VALUES (2, 'solana', 'orca', ?, ?, 1)`,
          ).run(PAIR_ADDRESS, T_10_15).lastInsertRowid,
        );
        expect(() => {
          database.prepare(
            `INSERT INTO exit_evaluations (
              token_id, position_id, market_snapshot_id, exit_spec_version, exit_definition_fingerprint,
              position_definition_fingerprint, position_source_identity, as_of, evaluated_at, pair_address,
              market_collected_at, observed_price_usd, entry_price_usd, stop_trigger_price_usd,
              take_profit_trigger_price_usd, holding_age_ms, max_holding_ms, exit_action, exit_reason,
              simulated_exit_price_usd, closed_quantity_tokens, source_identity
            ) VALUES (1, 1, ?, ?, ?, ?, 'src', ?, ?, ?, ?, 100, 100, 90, 120, 0, ?, 'no_change',
              'exit_conditions_not_met', NULL, NULL, 'cross-token-market')`,
          ).run(
            foreignMarketId,
            spec,
            fingerprint,
            positionFingerprint,
            T_10_15,
            T_10_15,
            PAIR_ADDRESS,
            T_10_15,
            EXIT_MAX_HOLDING_MS,
          );
        }).toThrow();
        expect(database.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
        expect(database.prepare('PRAGMA integrity_check').get()?.['integrity_check']).toBe('ok');
      } finally {
        database.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('never mutates paper_positions and deletes the open index by token_id and position_id', () => {
    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/UPDATE paper_positions\b/);
    expect(source).not.toMatch(/DELETE FROM paper_positions\b/);
    expect(source).not.toMatch(/REPLACE INTO paper_positions\b/);
    expect(source).toMatch(/DELETE FROM paper_open_positions WHERE token_id = \? AND position_id = \?/);
    expect(source).not.toMatch(/DELETE FROM paper_open_positions WHERE token_id = \?;/);
  });
});
