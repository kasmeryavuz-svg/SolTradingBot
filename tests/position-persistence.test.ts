import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { FEATURE_NAMES, FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from '../src/paper/constants.js';
import { evaluatePositionAction } from '../src/position/evaluator.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../src/position/identity.js';
import { POSITION_SPEC_VERSION } from '../src/position/constants.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import {
  INITIAL_MIGRATION_NAME,
  POSITION_MIGRATION_NAME,
  POSITION_MIGRATION_VERSION,
  migrationSql,
  migrationSqlDigest,
} from '../src/persistence/sqlite/migrations.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from '../src/strategy/constants.js';
import { OTHER_PAIR, PAIR_ADDRESS, T_09_00, T_10_00, T_10_10 } from './feature-fixtures.js';
import {
  nextRepresentableNumber,
  insufficientPaperBundle,
  noEntryPaperBundle,
  paperBundle,
  paperBundleAt,
  positionBundle,
  positionBundleAt,
} from './position-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';

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

const ABORT_STAGES = [
  'token',
  'market',
  'riskParent',
  'riskChildren',
  'featureVector',
  'featureValues',
  'strategyDefinition',
  'strategyEvaluation',
  'strategyRules',
  'paperDefinition',
  'paperEvaluation',
  'positionDefinition',
  'positionEvaluation',
  'paperPosition',
  'openPositionState',
] as const;

const V5_TABLES = [
  'tokens',
  'discovery_runs',
  'discovery_source_results',
  'discovery_observations',
  'discovery_observation_sources',
  'discovery_links',
  'market_snapshots',
  'risk_scans',
  'risk_scan_checks',
  'risk_scan_extensions',
  'risk_top_token_accounts',
  'risk_findings',
  'feature_vectors',
  'feature_values',
  'strategy_definitions',
  'strategy_evaluations',
  'strategy_rule_results',
  'paper_definitions',
  'paper_evaluations',
] as const;

describe('position persistence migration', () => {
  it('appends migration 006 and keeps 001-005 byte-identical', () => {
    expect(POSITION_MIGRATION_VERSION).toBe(6);
    expect(POSITION_MIGRATION_NAME).toBe('006_position_management');
    expect(INITIAL_MIGRATION_NAME).toBe('001_initial_persistence');
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(2)).toBe('c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e');
    expect(migrationSqlDigest(3)).toBe('891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c');
    expect(migrationSqlDigest(4)).toBe('eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308');
    expect(migrationSqlDigest(5)).toBe('5435dc4d919729f38474f6cbcdb18a5993b5688d6d97fd31b15fcd75ea26c629');
    expect(migrationSql(6)).toContain('CREATE TABLE position_definitions');
    expect(migrationSql(6)).toContain('CREATE TABLE position_evaluations');
    expect(migrationSql(6)).toContain('CREATE TABLE paper_positions');
    expect(migrationSql(6)).toContain('CREATE TABLE paper_open_positions');
    expect(migrationSql(6)).toContain('position_evaluations_token_as_of_id');
    expect(migrationSql(6)).toContain('UNIQUE (id, token_id)');
    expect(migrationSql(6)).toContain('FOREIGN KEY (position_id, token_id) REFERENCES paper_positions(id, token_id)');
    expect(migrationSql(6)).toContain(
      'FOREIGN KEY (prior_open_position_id, prior_open_position_source_identity)',
    );
    expect(migrationSql(6)).not.toMatch(/closed_at|exit_price|realized_pnl|unrealized_pnl|stop_loss|take_profit|equity_curve/);
    expect(migrationSql(5)).not.toContain('position_evaluations');
  });

  it('upgrades a populated v5 database to v6 without deleting older rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-position-mig-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw, { targetVersion: 5 });
      expect(raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(5);
      raw.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('solana', ?, ?, ?, ?)`,
      ).run(WRAPPED_SOL_MINT, T_09_00, T_09_00, T_09_00);
      raw.prepare(
        'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, 1)',
      ).run(T_09_00, T_09_00);
      raw.prepare(
        `INSERT INTO market_snapshots (token_id, chain, dex_id, pair_address, collected_at)
         VALUES (1, 'solana', 'orca', ?, ?)`,
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
        `INSERT INTO risk_scan_extensions (
          scan_id, ordinal, extension_name, authority, program_id, state, transfer_fee_basis_points,
          maximum_fee_raw, parsed
        ) VALUES (1, 0, 'legacy_ext', NULL, NULL, NULL, NULL, NULL, 0)`,
      ).run();
      raw.prepare(
        `INSERT INTO risk_top_token_accounts (scan_id, rank, token_account, amount_raw, share_bps)
         VALUES (1, 1, 'LegacyAccount11111111111111111111111111111', '1', 10000)`,
      ).run();
      raw.prepare(
        `INSERT INTO risk_findings (scan_id, code, category, severity, confidence, title, description)
         VALUES (1, 'legacy_finding', 'data_quality', 'info', 'low', 'legacy', 'legacy')`,
      ).run();
      raw.prepare(
        `INSERT INTO feature_vectors (
          token_id, feature_set_version, generated_at, as_of, market_collected_at, market_pair_address,
          previous_market_collected_at, risk_scanned_at, feature_completeness, available_feature_count,
          unavailable_feature_count, source_identity
        ) VALUES (1, 'c06_v1', ?, ?, ?, ?, NULL, NULL, 'partial', 0, ?, 'legacy-v5-feature')`,
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
        ) VALUES (1, 1, ?, ?, 'c06_v1', ?, ?, 'no_entry', 0, 1, 0, 'legacy-v5-strategy')`,
      ).run(STRATEGY_VERSION, STRATEGY_DEFINITION_FINGERPRINT, T_10_00, T_10_00);
      raw.prepare(
        `INSERT INTO strategy_rule_results (
          evaluation_id, ordinal, rule_code, category, status, description, criterion, observed, reason
        ) VALUES (1, 0, 'legacy_rule', 'market_quality', 'fail', 'legacy', 'legacy', 'legacy', 'legacy')`,
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
        ) VALUES (1, 1, ?, ?, ?, 'c06_v1', ?, ?, ?, ?, 'no_entry', 'no_action', 'strategy_no_entry', NULL, NULL,
          'exact_strategy_market_snapshot_reference_price', 'none', 'none', 'none', 'none', 'legacy-v5-paper')`,
      ).run(
        PAPER_SPEC_VERSION,
        PAPER_DEFINITION_FINGERPRINT,
        STRATEGY_DEFINITION_FINGERPRINT,
        T_10_00,
        T_10_00,
        T_10_00,
        PAIR_ADDRESS,
      );

      const before = dumpTables(raw, V5_TABLES);
      expect(before.feature_values).toHaveLength(48);
      expect(before.paper_evaluations).toHaveLength(1);
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        repository.initialize();
        const stats = repository.getStats();
        expect(stats.schemaVersion).toBe(6);
        expect(repository.getTableCounts().schemaMigrations).toBe(6);
        expect(stats.paperEvaluationCount).toBe(1);
        expect(stats.positionEvaluationCount).toBe(0);
        expect(stats.paperPositionCount).toBe(0);
        expect(stats.openPaperPositionCount).toBe(0);
        expect(stats.integrity.ok).toBe(true);
        expect(stats.foreignKeysEnabled).toBe(true);

        const after = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
        try {
          expect(dumpTables(after, V5_TABLES)).toEqual(before);
          expect(after.prepare('SELECT COUNT(*) AS count FROM position_definitions').get()?.['count']).toBe(0);
          expect(after.prepare('SELECT COUNT(*) AS count FROM position_evaluations').get()?.['count']).toBe(0);
          expect(after.prepare('SELECT COUNT(*) AS count FROM paper_positions').get()?.['count']).toBe(0);
          expect(after.prepare('SELECT COUNT(*) AS count FROM paper_open_positions').get()?.['count']).toBe(0);
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

describe('position persistence', () => {
  it('does not create position rows from recordPaperBundle', () => {
    const repository = openMemoryRepo();
    repository.recordPaperBundle(paperBundle());
    expect(repository.getStats().paperEvaluationCount).toBe(1);
    expect(repository.getStats().positionEvaluationCount).toBe(0);
    expect(repository.getStats().paperPositionCount).toBe(0);
    expect(repository.getStats().openPaperPositionCount).toBe(0);
  });

  it('opens a synthetic c06/s07/p09/pm10 position at $100 notional', () => {
    const repository = openMemoryRepo();
    const bundle = positionBundle({ marketSnapshot: passingSnapshot({ priceUsd: 0.001 }) });
    const recorded = repository.recordPositionBundle(bundle);
    const open = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);

    expect(bundle.paperEvaluation.paperAction).toBe('entry_observation');
    expect(bundle.positionEvaluation.positionAction).toBe('open_position');
    expect(recorded.inserted).toBe(true);
    expect(recorded.openPositionCreated).toBe(true);
    expect(recorded.paperPositionId).not.toBeNull();
    expect(open).not.toBeNull();
    expect(open?.entryNotionalUsd).toBe(100);
    expect(open?.entryPriceUsd).toBe(0.001);
    expect(open?.quantityTokens).toBe(100_000);
    expect(open?.openedAt).toBe(bundle.paperEvaluation.evaluatedAt);
    expect(open?.pairAddress).toBe(bundle.paperEvaluation.pairAddress);
    expect(repository.getStats().paperPositionCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(1);
    expect(repository.getTableCounts().positionEvaluations).toBe(1);
  });

  it('does not open a second position for the same token, including a different pair', () => {
    const repository = openMemoryRepo();
    const first = repository.recordPositionBundle(positionBundle());
    const prior = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    const before = repository.getTableCounts();
    const samePairPaper = paperBundleAt(T_10_10, { priceUsd: 0.002 });
    const samePairEvaluation = evaluatePositionAction({
      paperEvaluation: samePairPaper.paperEvaluation,
      currentOpenPosition: prior,
    });
    const samePairRecorded = repository.recordPositionBundle({
      ...samePairPaper,
      priorOpenPosition: prior,
      positionEvaluation: samePairEvaluation,
    });
    expect(samePairEvaluation.positionReason).toBe('position_already_open');
    expect(samePairRecorded.inserted).toBe(true);
    expect(samePairRecorded.openPositionCreated).toBe(false);

    const laterPaper = paperBundleAt(T_10_10, { pairAddress: OTHER_PAIR, priceUsd: 0.002 });
    const evaluation = evaluatePositionAction({
      paperEvaluation: laterPaper.paperEvaluation,
      currentOpenPosition: prior,
    });
    const recorded = repository.recordPositionBundle({
      ...laterPaper,
      priorOpenPosition: prior,
      positionEvaluation: evaluation,
    });

    expect(evaluation.positionReason).toBe('position_already_open');
    expect(recorded.openPositionCreated).toBe(false);
    expect(repository.getTableCounts().paperPositions).toBe(1);
    expect(repository.getTableCounts().openPaperPositions).toBe(1);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toEqual(prior);
    expect(first.paperPositionId).toBe(prior?.id);

    const other = repository.recordPositionBundle(positionBundleAt(T_10_00, { tokenMint: USDC_MINT }));
    expect(other.openPositionCreated).toBe(true);
    expect(repository.getTableCounts().paperPositions).toBe(2);
    expect(repository.getTableCounts().openPaperPositions).toBe(2);
    expect(before.paperPositions).toBe(1);
  });

  it('reuses an exact paper evaluation position-processing and rejects semantic conflicts', () => {
    const repository = openMemoryRepo();
    const bundle = positionBundle();
    const first = repository.recordPositionBundle(bundle);
    const reuse = repository.recordPositionBundle(bundle);
    expect(reuse.inserted).toBe(false);
    expect(reuse.positionEvaluationId).toBe(first.positionEvaluationId);
    expect(repository.getStats().positionEvaluationCount).toBe(1);
    expect(repository.getStats().paperPositionCount).toBe(1);

    const prior = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    const conflict = evaluatePositionAction({
      paperEvaluation: bundle.paperEvaluation,
      currentOpenPosition: prior,
    });
    expect(() => {
      repository.recordPositionBundle({
        ...bundle,
        priorOpenPosition: prior,
        positionEvaluation: conflict,
      });
    }).toThrow(PersistenceError);
  });

  it('links the older exact paper evaluation, not the latest row', () => {
    const repository = openMemoryRepo();
    const older = paperBundleAt(T_10_00);
    const newer = paperBundleAt(T_10_10);
    const olderPaper = repository.recordPaperBundle(older);
    const newerPaper = repository.recordPaperBundle(newer);
    expect(newerPaper.paperEvaluationId).toBeGreaterThan(olderPaper.paperEvaluationId);

    const olderPosition = evaluatePositionAction({
      paperEvaluation: older.paperEvaluation,
      currentOpenPosition: null,
    });
    const recorded = repository.recordPositionBundle({
      ...older,
      priorOpenPosition: null,
      positionEvaluation: olderPosition,
    });
    expect(recorded.paperEvaluationId).toBe(olderPaper.paperEvaluationId);
    expect(recorded.paperEvaluationId).not.toBe(newerPaper.paperEvaluationId);
    const history = repository.getPositionHistory(WRAPPED_SOL_MINT, 20);
    expect(history?.evaluations[0]?.paperEvaluationId).toBe(olderPaper.paperEvaluationId);
  });

  it('rejects one-ULP quantity, price, and notional forgeries', () => {
    const repository = openMemoryRepo();
    const bundle = positionBundle({ marketSnapshot: passingSnapshot({ priceUsd: 0.001 }) });
    const nextPrice = nextRepresentableNumber(0.001);
    expect(() => {
      repository.recordPositionBundle({
        ...bundle,
        positionEvaluation: {
          ...bundle.positionEvaluation,
          entryPriceUsd: nextPrice,
          quantityTokens: 100 / nextPrice,
        },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPositionBundle({
        ...bundle,
        positionEvaluation: {
          ...bundle.positionEvaluation,
          quantityTokens: nextRepresentableNumber(100_000),
        },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPositionBundle({
        ...bundle,
        positionEvaluation: {
          ...bundle.positionEvaluation,
          entryNotionalUsd: 101,
        },
      });
    }).toThrow(PersistenceError);
    expect(repository.getStats().positionEvaluationCount).toBe(0);
  });

  it('rolls back a fresh bundle after every abort stage', () => {
    const repository = openMemoryRepo();
    const before = repository.getTableCounts();
    for (const stage of ABORT_STAGES) {
      expect(() => {
        repository.recordPositionBundleAndAbortAfter(positionBundle(), stage);
      }).toThrow(/Test-forced write failure/);
      expect(repository.getTableCounts(), stage).toEqual(before);
      expect(repository.getToken(WRAPPED_SOL_MINT), stage).toBeNull();
    }

    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/return this\.transact\(\(\) => this\.persistPositionBundle\(bundle\)\)/);
    expect(source).toMatch(/this\.persistPaperBundle\(bundle/);
    expect(source).not.toMatch(/this\.recordPaperBundle\(/);
  });

  it('preserves reused paper rows when a later position insert fails', () => {
    const repository = openMemoryRepo();
    const paper = repository.recordPaperBundle(paperBundle());
    const tokenBefore = repository.getToken(WRAPPED_SOL_MINT);
    const before = repository.getTableCounts();
    const bundle = positionBundle();

    for (const stage of ABORT_STAGES) {
      expect(() => {
        repository.recordPositionBundleAndAbortAfter(bundle, stage);
      }).toThrow(/Test-forced write failure/);
      expect(repository.getTableCounts().paperEvaluations, stage).toBe(before.paperEvaluations);
      expect(repository.getToken(WRAPPED_SOL_MINT), stage).toEqual(tokenBefore);
      expect(repository.getPaperHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0]?.id, stage).toBe(
        paper.paperEvaluationId,
      );
      expect(repository.getStats().positionEvaluationCount, stage).toBe(0);
      expect(repository.getStats().paperPositionCount, stage).toBe(0);
      expect(repository.getStats().openPaperPositionCount, stage).toBe(0);
    }
  });

  it('rejects stale OPEN_POSITION after the DB gains an open position', () => {
    const repository = openMemoryRepo();
    repository.recordPositionBundle(positionBundle());
    const later = positionBundleAt(T_10_10);
    expect(later.positionEvaluation.positionAction).toBe('open_position');
    expect(() => {
      repository.recordPositionBundle(later);
    }).toThrow(PersistenceError);
    expect(repository.getStats().paperPositionCount).toBe(1);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)?.openedAt).toBe(
      positionBundle().paperEvaluation.evaluatedAt,
    );
  });

  it('rejects persistence when the caller prior no longer matches DB state', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-position-stale-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      repository.initialize();
      repository.recordPositionBundle(positionBundle());
      const prior = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
      expect(prior).not.toBeNull();
      if (prior === null) {
        throw new Error('expected an open paper position');
      }
      repository.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        database.prepare('UPDATE paper_positions SET pair_address = ? WHERE id = ?').run(OTHER_PAIR, prior.id);
      } finally {
        database.close();
      }

      const retry = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        retry.initialize();
        const laterPaper = paperBundleAt(T_10_10);
        const evaluation = evaluatePositionAction({
          paperEvaluation: laterPaper.paperEvaluation,
          currentOpenPosition: prior,
        });
        expect(() => {
          retry.recordPositionBundle({
            ...laterPaper,
            priorOpenPosition: prior,
            positionEvaluation: evaluation,
          });
        }).toThrow(/changed since evaluation/);
      } finally {
        retry.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps an existing position bit-for-bit unchanged after a later signal', () => {
    const repository = openMemoryRepo();
    repository.recordPositionBundle(positionBundle());
    const before = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    const laterPaper = paperBundleAt(T_10_10, { pairAddress: OTHER_PAIR, priceUsd: 0.002 });
    const evaluation = evaluatePositionAction({
      paperEvaluation: laterPaper.paperEvaluation,
      currentOpenPosition: before,
    });
    repository.recordPositionBundle({
      ...laterPaper,
      priorOpenPosition: before,
      positionEvaluation: evaluation,
    });
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toEqual(before);
  });

  it('keeps paper no-action reasons when an open position already exists', () => {
    const repository = openMemoryRepo();
    repository.recordPositionBundle(positionBundleAt(T_10_00));
    const prior = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    const noEntry = noEntryPaperBundle();
    const noEntryEval = evaluatePositionAction({
      paperEvaluation: noEntry.paperEvaluation,
      currentOpenPosition: prior,
    });
    repository.recordPositionBundle({
      ...noEntry,
      priorOpenPosition: prior,
      positionEvaluation: noEntryEval,
    });
    expect(noEntryEval.positionReason).toBe('paper_strategy_no_entry');
    expect(noEntryEval.positionAction).toBe('no_change');
    expect(repository.getStats().paperPositionCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(1);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toEqual(prior);
  });

  it('keeps paper_strategy_insufficient_data when an open position already exists', () => {
    const repository = openMemoryRepo();
    repository.recordPositionBundle(positionBundleAt(T_10_00));
    const prior = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    const insufficient = insufficientPaperBundle();
    const evaluation = evaluatePositionAction({
      paperEvaluation: insufficient.paperEvaluation,
      currentOpenPosition: prior,
    });
    repository.recordPositionBundle({
      ...insufficient,
      priorOpenPosition: prior,
      positionEvaluation: evaluation,
    });
    expect(evaluation.positionReason).toBe('paper_strategy_insufficient_data');
    expect(evaluation.positionAction).toBe('no_change');
    expect(repository.getStats().paperPositionCount).toBe(1);
    expect(repository.getStats().openPaperPositionCount).toBe(1);
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).toEqual(prior);
  });

  it('returns token-scoped history newest first with id tie-break', () => {
    const repository = openMemoryRepo();
    repository.recordPositionBundle(positionBundleAt(T_10_00));
    const prior = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
    const later = paperBundleAt(T_10_10);
    const laterEval = evaluatePositionAction({
      paperEvaluation: later.paperEvaluation,
      currentOpenPosition: prior,
    });
    repository.recordPositionBundle({
      ...later,
      priorOpenPosition: prior,
      positionEvaluation: laterEval,
    });
    const noEntry = noEntryPaperBundle();
    const noEntryEval = evaluatePositionAction({
      paperEvaluation: noEntry.paperEvaluation,
      currentOpenPosition: prior,
    });
    repository.recordPositionBundle({
      ...noEntry,
      priorOpenPosition: prior,
      positionEvaluation: noEntryEval,
    });

    const history = repository.getPositionHistory(WRAPPED_SOL_MINT, 20);
    expect(history?.evaluations[0]?.asOf).toBe(T_10_10);
    expect(history?.evaluations.every((item) => item.tokenMint === WRAPPED_SOL_MINT)).toBe(true);
    expect(repository.getPositionHistory(WRAPPED_SOL_MINT, 1)?.evaluations).toHaveLength(1);
    expect(repository.getPositionHistory('UnknownMint111111111111111111111111111', 20)).toBeNull();
  });

  it('rejects definition drift without updating first_recorded_at', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-position-drift-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      repository.initialize();
      repository.recordPositionBundle(positionBundle());
      repository.close();

      const stored = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      const original = stored.prepare('SELECT * FROM position_definitions').get();
      if (original === undefined) {
        throw new Error('expected a stored position definition');
      }
      const firstRecordedAt = original['first_recorded_at'];
      expect(() => {
        stored.prepare('UPDATE position_definitions SET entry_notional_usd = 101').run();
      }).toThrow();
      expect(() => {
        stored.prepare('UPDATE position_definitions SET max_open_positions_per_token = 2').run();
      }).toThrow();

      const runtimeDrift: Array<[string, string | number]> = [
        ['position_spec_name', 'other'],
        ['paper_spec_version', 'p09_v2'],
        ['paper_definition_fingerprint', '0'.repeat(64)],
        ['quantity_formula', '1 / entryPriceUsd'],
        ['definition_fingerprint', '0'.repeat(64)],
      ];
      try {
        for (const [column, value] of runtimeDrift) {
          stored.prepare(`UPDATE position_definitions SET ${column} = ?`).run(value);
          const retry = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
          try {
            retry.initialize();
            expect(() => {
              retry.recordPositionBundle(positionBundleAt(T_10_10));
            }).toThrow(/pm10_v1/);
          } finally {
            retry.close();
          }
          const restored = original[column];
          if (typeof restored !== 'string' && typeof restored !== 'number') {
            throw new Error(`expected original ${column} to be a string or number`);
          }
          stored.prepare(`UPDATE position_definitions SET ${column} = ?`).run(restored);
        }
        expect(stored.prepare('SELECT first_recorded_at FROM position_definitions').get()?.['first_recorded_at']).toBe(
          firstRecordedAt,
        );
      } finally {
        stored.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('does not write when reading status and history', () => {
    const repository = openMemoryRepo();
    repository.recordPositionBundle(positionBundle());
    const before = repository.getTableCounts();
    expect(repository.getOpenPaperPosition(WRAPPED_SOL_MINT)).not.toBeNull();
    expect(repository.getPositionHistory(WRAPPED_SOL_MINT, 20)?.evaluations).toHaveLength(1);
    expect(repository.getTableCounts()).toEqual(before);

    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/INSERT INTO paper_positions \(/);
    expect(source).toMatch(/INSERT INTO paper_open_positions \(token_id, position_id\)/);
    expect(source).not.toMatch(/UPDATE paper_positions\b/);
    expect(source).not.toMatch(/DELETE FROM paper_positions\b/);
    expect(source).not.toMatch(/REPLACE INTO paper_positions\b/);
    expect(source).not.toMatch(/UPDATE paper_open_positions\b/);
    expect(source).not.toMatch(/DELETE FROM paper_open_positions\b/);
    expect(source).not.toMatch(/REPLACE INTO paper_open_positions\b/);
  });

  it('rejects a stored open position whose quantity no longer matches 100 / price', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-position-qty-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    try {
      repository.initialize();
      repository.recordPositionBundle(positionBundle());
      const open = repository.getOpenPaperPosition(WRAPPED_SOL_MINT);
      expect(open).not.toBeNull();
      if (open === null) {
        throw new Error('expected an open paper position');
      }
      repository.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        database.prepare('UPDATE paper_positions SET quantity_tokens = 1 WHERE id = ?').run(open.id);
      } finally {
        database.close();
      }

      const retry = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        retry.initialize();
        expect(() => retry.getOpenPaperPosition(WRAPPED_SOL_MINT)).toThrow(/quantity/);
      } finally {
        retry.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('position SQLite constraints', () => {
  it('enforces actions, notional, uniqueness, and foreign keys', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-position-check-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      repository.initialize();
      const recorded = repository.recordPositionBundle(positionBundle());
      repository.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        const identity = (suffix: string) =>
          `{"positionSpecVersion":"pm10_v1","suffix":"${suffix}"}`;

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: recorded.paperEvaluationId + 100,
            action: 'open_position',
            reason: null,
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: null,
            priorSource: null,
            price: 0.001,
            notional: 100,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('fk-paper'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: recorded.paperEvaluationId,
            action: 'close_position',
            reason: null,
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: null,
            priorSource: null,
            price: 0.001,
            notional: 100,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('close'),
          });
        }).toThrow();

        const extraPaperIdentity = '{"paperSpecVersion":"p09_v1","suffix":"extra-paper"}';
        database.prepare(
          `INSERT INTO paper_evaluations (
            token_id, strategy_evaluation_id, paper_spec_version, paper_definition_fingerprint,
            strategy_definition_fingerprint, feature_set_version, as_of, evaluated_at, market_collected_at,
            pair_address, strategy_decision, paper_action, no_action_reason, reference_price_usd,
            simulated_entry_price_usd, execution_model, cost_model, quantity_model, position_model,
            exit_model, source_identity
          ) VALUES (1, ?, ?, ?, ?, 'c06_v1', ?, ?, ?, ?, 'no_entry', 'no_action', 'strategy_no_entry', NULL, NULL,
            'exact_strategy_market_snapshot_reference_price', 'none', 'none', 'none', 'none', ?)`,
        ).run(
          recorded.strategyEvaluationId,
          PAPER_SPEC_VERSION,
          PAPER_DEFINITION_FINGERPRINT,
          STRATEGY_DEFINITION_FINGERPRINT,
          T_10_10,
          T_10_10,
          T_10_10,
          PAIR_ADDRESS,
          extraPaperIdentity,
        );
        const extraPaperId = Number(
          database.prepare('SELECT id FROM paper_evaluations WHERE source_identity = ?').get(extraPaperIdentity)?.[
            'id'
          ],
        );

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'open_position',
            reason: null,
            paperAction: 'no_action',
            paperReason: 'strategy_no_entry',
            priorId: null,
            priorSource: null,
            price: 0.001,
            notional: 100,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('open-no-action'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'open_position',
            reason: null,
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: recorded.paperPositionId,
            priorSource: 'prior',
            price: 0.001,
            notional: 100,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('open-with-prior'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'open_position',
            reason: null,
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: null,
            priorSource: null,
            price: null,
            notional: 100,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('null-price'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'open_position',
            reason: null,
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: null,
            priorSource: null,
            price: 0.001,
            notional: 101,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('notional'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'no_change',
            reason: 'position_already_open',
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: null,
            priorSource: null,
            price: null,
            notional: null,
            quantity: null,
            positionSource: null,
            identity: identity('already-open-no-prior'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'no_change',
            reason: 'position_already_open',
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: recorded.paperPositionId,
            priorSource: 'prior',
            price: 0.001,
            notional: 100,
            quantity: 100_000,
            positionSource: 'src',
            identity: identity('already-open-fields'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'no_change',
            reason: 'paper_strategy_insufficient_data',
            paperAction: 'no_action',
            paperReason: 'strategy_no_entry',
            priorId: null,
            priorSource: null,
            price: null,
            notional: null,
            quantity: null,
            positionSource: null,
            identity: identity('reason-mismatch-no-entry'),
          });
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'no_change',
            reason: 'paper_strategy_no_entry',
            paperAction: 'no_action',
            paperReason: 'strategy_insufficient_data',
            priorId: null,
            priorSource: null,
            price: null,
            notional: null,
            quantity: null,
            positionSource: null,
            identity: identity('reason-mismatch-insufficient'),
          });
        }).toThrow();

        expect(() => {
          database.prepare(
            'INSERT INTO paper_open_positions (token_id, position_id) VALUES (1, ?)',
          ).run(recorded.paperPositionId);
        }).toThrow();

        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: recorded.paperEvaluationId,
            action: 'no_change',
            reason: 'position_already_open',
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: recorded.paperPositionId,
            priorSource: 'prior',
            price: null,
            notional: null,
            quantity: null,
            positionSource: null,
            identity: identity('duplicate-paper'),
          });
        }).toThrow();

        database.prepare(
          `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
           VALUES ('solana', ?, ?, ?, ?)`,
        ).run(USDC_MINT, T_10_00, T_10_00, T_10_00);
        const usdcTokenId = Number(
          database.prepare('SELECT id FROM tokens WHERE mint = ?').get(USDC_MINT)?.['id'],
        );
        expect(() => {
          database.prepare('INSERT INTO paper_open_positions (token_id, position_id) VALUES (?, ?)').run(
            usdcTokenId,
            recorded.paperPositionId,
          );
        }).toThrow();

        const solSource = String(
          database.prepare('SELECT source_identity FROM paper_positions WHERE id = ?').get(recorded.paperPositionId)?.[
            'source_identity'
          ],
        );
        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: extraPaperId,
            action: 'no_change',
            reason: 'position_already_open',
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: recorded.paperPositionId,
            priorSource: 'not-the-real-source',
            price: null,
            notional: null,
            quantity: null,
            positionSource: null,
            identity: identity('prior-source-mismatch'),
          });
        }).toThrow();

        const usdcPaperIdentity = '{"paperSpecVersion":"p09_v1","suffix":"usdc-paper"}';
        database.prepare(
          `INSERT INTO paper_evaluations (
            token_id, strategy_evaluation_id, paper_spec_version, paper_definition_fingerprint,
            strategy_definition_fingerprint, feature_set_version, as_of, evaluated_at, market_collected_at,
            pair_address, strategy_decision, paper_action, no_action_reason, reference_price_usd,
            simulated_entry_price_usd, execution_model, cost_model, quantity_model, position_model,
            exit_model, source_identity
          ) VALUES (?, ?, ?, ?, ?, 'c06_v1', ?, ?, ?, ?, 'no_entry', 'no_action', 'strategy_no_entry', NULL, NULL,
            'exact_strategy_market_snapshot_reference_price', 'none', 'none', 'none', 'none', ?)`,
        ).run(
          usdcTokenId,
          recorded.strategyEvaluationId,
          PAPER_SPEC_VERSION,
          PAPER_DEFINITION_FINGERPRINT,
          STRATEGY_DEFINITION_FINGERPRINT,
          T_10_10,
          T_10_10,
          T_10_10,
          PAIR_ADDRESS,
          usdcPaperIdentity,
        );
        const usdcPaperId = Number(
          database.prepare('SELECT id FROM paper_evaluations WHERE source_identity = ?').get(usdcPaperIdentity)?.['id'],
        );
        expect(() => {
          insertPositionEvaluation(database, {
            paperEvaluationId: usdcPaperId,
            action: 'no_change',
            reason: 'position_already_open',
            paperAction: 'entry_observation',
            paperReason: null,
            priorId: recorded.paperPositionId,
            priorSource: solSource,
            price: null,
            notional: null,
            quantity: null,
            positionSource: null,
            identity: identity('prior-token-mismatch'),
            tokenId: usdcTokenId,
          });
        }).toThrow();

        insertPositionEvaluation(database, {
          paperEvaluationId: extraPaperId,
          action: 'open_position',
          reason: null,
          paperAction: 'entry_observation',
          paperReason: null,
          priorId: null,
          priorSource: null,
          price: 0.001,
          notional: 100,
          quantity: 100_000,
          positionSource: 'second-open-src',
          identity: identity('second-historical-open'),
        });
        const secondEvalId = Number(
          database.prepare('SELECT id FROM position_evaluations WHERE source_identity = ?').get(
            identity('second-historical-open'),
          )?.['id'],
        );
        database.prepare(
          `INSERT INTO paper_positions (
            token_id, position_evaluation_id, opening_paper_evaluation_id, position_spec_version,
            position_definition_fingerprint, pair_address, opened_at, entry_market_collected_at,
            entry_price_usd, entry_notional_usd, quantity_tokens, opening_paper_source_identity, source_identity
          ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, 0.001, 100, 100000, 'opening', ?)`,
        ).run(
          secondEvalId,
          extraPaperId,
          POSITION_SPEC_VERSION,
          POSITION_DEFINITION_FINGERPRINT,
          PAIR_ADDRESS,
          T_10_10,
          T_10_10,
          identity('second-position-source'),
        );
        expect(database.prepare('SELECT COUNT(*) AS count FROM paper_positions WHERE token_id = 1').get()?.['count']).toBe(
          2,
        );
        const secondPositionId = Number(
          database.prepare('SELECT id FROM paper_positions WHERE source_identity = ?').get(
            identity('second-position-source'),
          )?.['id'],
        );
        expect(() => {
          database.prepare('INSERT INTO paper_open_positions (token_id, position_id) VALUES (1, ?)').run(
            secondPositionId,
          );
        }).toThrow();
        expect(() => {
          database.prepare('UPDATE paper_positions SET quantity_tokens = 0 WHERE id = ?').run(secondPositionId);
        }).toThrow();
        expect(() => {
          database.prepare('UPDATE paper_positions SET entry_price_usd = 0 WHERE id = ?').run(secondPositionId);
        }).toThrow();
        expect(() => {
          database.prepare('UPDATE paper_positions SET source_identity = ? WHERE id = ?').run(
            solSource,
            secondPositionId,
          );
        }).toThrow();
      } finally {
        database.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

function dumpTables(
  database: ReturnType<typeof openSqliteDatabase>,
  names: readonly string[],
): Record<string, unknown[]> {
  const dumped: Record<string, unknown[]> = {};
  for (const name of names) {
    dumped[name] = database.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all();
  }
  return dumped;
}

function insertPositionEvaluation(
  database: ReturnType<typeof openSqliteDatabase>,
  input: {
    paperEvaluationId: number;
    action: string;
    reason: string | null;
    paperAction: string;
    paperReason: string | null;
    priorId: number | null;
    priorSource: string | null;
    price: number | null;
    notional: number | null;
    quantity: number | null;
    positionSource: string | null;
    identity: string;
    tokenId?: number;
  },
): void {
  database.prepare(
    `INSERT INTO position_evaluations (
      token_id, paper_evaluation_id, position_spec_version, position_definition_fingerprint,
      paper_definition_fingerprint, as_of, evaluated_at, paper_action, paper_no_action_reason,
      prior_open_position_id, prior_open_position_source_identity, position_action, position_reason,
      entry_price_usd, entry_notional_usd, quantity_tokens, position_source_identity, source_identity
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.tokenId ?? 1,
    input.paperEvaluationId,
    POSITION_SPEC_VERSION,
    POSITION_DEFINITION_FINGERPRINT,
    PAPER_DEFINITION_FINGERPRINT,
    T_10_00,
    T_10_00,
    input.paperAction,
    input.paperReason,
    input.priorId,
    input.priorSource,
    input.action,
    input.reason,
    input.price,
    input.notional,
    input.quantity,
    input.positionSource,
    input.identity,
  );
}
