import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { evaluatePaperAction } from '../src/paper/evaluator.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../src/paper/identity.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from '../src/paper/constants.js';
import type { PaperEvaluation } from '../src/paper/types.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import {
  INITIAL_MIGRATION_NAME,
  PAPER_MIGRATION_NAME,
  PAPER_MIGRATION_VERSION,
  migrationSqlDigest,
} from '../src/persistence/sqlite/migrations.js';
import { FEATURE_NAMES, FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from '../src/strategy/constants.js';
import { OTHER_PAIR, PAIR_ADDRESS, T_09_00, T_10_00, T_10_05, T_10_10 } from './feature-fixtures.js';
import {
  insufficientPaperBundle,
  nextRepresentableNumber,
  noEntryPaperBundle,
  paperBundle,
  paperBundleAt,
} from './paper-fixtures.js';
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

describe('paper persistence migration', () => {
  it('appends migration 005 and keeps 001-004 byte-identical', () => {
    expect(PAPER_MIGRATION_VERSION).toBe(5);
    expect(PAPER_MIGRATION_NAME).toBe('005_paper_evaluations');
    expect(INITIAL_MIGRATION_NAME).toBe('001_initial_persistence');
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(2)).toBe('c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e');
    expect(migrationSqlDigest(3)).toBe('891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c');
    expect(migrationSqlDigest(4)).toBe('eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308');
    expect(migrationSqlDigest(5)).toMatch(/^[a-f0-9]{64}$/);
    expect(migrationSqlDigest(5)).toBe(migrationSqlDigest(5));

    const source = readFileSync(new URL('../src/persistence/sqlite/migrations.ts', import.meta.url), 'utf8');
    expect(source).toContain('CREATE TABLE paper_definitions');
    expect(source).toContain('CREATE TABLE paper_evaluations');
    expect(source).toContain('paper_evaluations_token_as_of_id');
    expect(source).not.toMatch(/paper_positions|paper_orders|paper_balances|paper_portfolios|paper_exits/);
    expect(source).not.toMatch(/notional|virtual_cash|realized_pnl|unrealized_pnl|stop_loss|take_profit|equity_curve/);
  });

  it('upgrades a populated v4 database to v5 without deleting older rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-paper-mig-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
    const v4Tables = [
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
    ];

    try {
      applyMigrations(raw, { targetVersion: 4 });
      expect(raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(4);
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
        ) VALUES (1, 'c06_v1', ?, ?, ?, ?, NULL, NULL, 'partial', 0, ?, 'legacy-v4-feature')`,
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
        ) VALUES (1, 1, ?, ?, 'c06_v1', ?, ?, 'no_entry', 0, 1, 0, 'legacy-v4-strategy')`,
      ).run(STRATEGY_VERSION, STRATEGY_DEFINITION_FINGERPRINT, T_10_00, T_10_00);
      raw.prepare(
        `INSERT INTO strategy_rule_results (
          evaluation_id, ordinal, rule_code, category, status, description, criterion, observed, reason
        ) VALUES (1, 0, 'legacy_rule', 'market_quality', 'fail', 'legacy', 'legacy', 'legacy', 'legacy')`,
      ).run();

      const before = dumpTables(raw, v4Tables);
      expect(before.risk_scan_checks).toHaveLength(1);
      expect(before.risk_scan_extensions).toHaveLength(1);
      expect(before.risk_top_token_accounts).toHaveLength(1);
      expect(before.risk_findings).toHaveLength(1);
      expect(before.feature_values).toHaveLength(48);
      expect(before.strategy_rule_results).toHaveLength(1);
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        repository.initialize();
        const stats = repository.getStats();
        expect(stats.schemaVersion).toBe(5);
        expect(repository.getTableCounts().schemaMigrations).toBe(5);
        expect(stats.tokenCount).toBe(1);
        expect(stats.discoveryRunCount).toBe(1);
        expect(stats.marketSnapshotCount).toBe(1);
        expect(stats.riskScanCount).toBe(1);
        expect(stats.featureVectorCount).toBe(1);
        expect(stats.strategyEvaluationCount).toBe(1);
        expect(stats.paperEvaluationCount).toBe(0);
        expect(repository.getTableCounts().paperDefinitions).toBe(0);
        expect(repository.getTableCounts().paperEvaluations).toBe(0);
        expect(stats.integrity.ok).toBe(true);
        expect(stats.foreignKeysEnabled).toBe(true);
        expect(repository.getToken(WRAPPED_SOL_MINT)?.mint).toBe(WRAPPED_SOL_MINT);
        expect(repository.getStrategyHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0]?.sourceIdentity).toBe(
          'legacy-v4-strategy',
        );

        const after = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
        try {
          expect(dumpTables(after, v4Tables)).toEqual(before);
          expect(after.prepare('SELECT COUNT(*) AS count FROM paper_definitions').get()?.['count']).toBe(0);
          expect(after.prepare('SELECT COUNT(*) AS count FROM paper_evaluations').get()?.['count']).toBe(0);
          expect(after.prepare('PRAGMA foreign_keys').get()?.['foreign_keys']).toBe(1);
          expect(String(Object.values(after.prepare('PRAGMA quick_check').get() ?? {})[0] ?? '')).toBe('ok');
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

describe('paper persistence', () => {
  it('persists a fresh paper bundle atomically including the synthetic entry observation', () => {
    const repository = openMemoryRepo();
    const bundle = paperBundle({
      marketSnapshot: passingSnapshot({ priceUsd: 0.001 }),
    });
    const recorded = repository.recordPaperBundle(bundle);
    const history = repository.getPaperHistory(WRAPPED_SOL_MINT, 20);

    expect(recorded.inserted).toBe(true);
    expect(recorded.strategyInserted).toBe(true);
    expect(recorded.featureInserted).toBe(true);
    expect(recorded.paperDefinitionInserted).toBe(true);
    expect(history?.evaluations).toHaveLength(1);
    expect(history?.evaluations[0]?.paperSpecVersion).toBe(PAPER_SPEC_VERSION);
    expect(history?.evaluations[0]?.paperSpecName).toBe(PAPER_SPEC_NAME);
    expect(history?.evaluations[0]?.paperDefinitionFingerprint).toBe(PAPER_DEFINITION_FINGERPRINT);
    expect(history?.evaluations[0]?.strategyDecision).toBe('entry_candidate');
    expect(history?.evaluations[0]?.paperAction).toBe('entry_observation');
    expect(history?.evaluations[0]?.noActionReason).toBeNull();
    expect(history?.evaluations[0]?.referencePriceUsd).toBe(0.001);
    expect(history?.evaluations[0]?.simulatedEntryPriceUsd).toBe(0.001);
    expect(history?.evaluations[0]?.id).toBe(recorded.paperEvaluationId);
    expect(JSON.stringify(history?.evaluations[0])).not.toMatch(/quantityUsd|notional|balance|pnl|positionState/);
    expect(repository.getStats().paperEvaluationCount).toBe(1);
  });

  it('reuses an exact duplicate and keeps original metadata', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-paper-dup-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      repository.initialize();
      const bundle = paperBundle();
      const first = repository.recordPaperBundle(bundle);
      const firstRecordedAt = readPaperDefinitionTime(path);
      const second = repository.recordPaperBundle(bundle);
      expect(second.inserted).toBe(false);
      expect(second.paperEvaluationId).toBe(first.paperEvaluationId);
      expect(repository.getStats().paperEvaluationCount).toBe(1);
      expect(readPaperDefinitionTime(path)).toBe(firstRecordedAt);
    } finally {
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects same-identity mutations of action, reason, prices, and execution model', () => {
    const repository = openMemoryRepo();
    const bundle = paperBundle();
    repository.recordPaperBundle(bundle);
    const paper = bundle.paperEvaluation;

    const cases = [
      {
        label: 'action',
        patch: {
          ...paper,
          paperAction: 'no_action' as const,
          noActionReason: 'strategy_no_entry' as const,
          referencePriceUsd: null,
          simulatedEntryPriceUsd: null,
        },
      },
      {
        label: 'reason',
        patch: { ...paper, noActionReason: 'strategy_no_entry' as const },
      },
      {
        label: 'reference price',
        patch: { ...paper, referencePriceUsd: 0.0011, simulatedEntryPriceUsd: 0.0011 },
      },
      {
        label: 'simulated price',
        patch: { ...paper, simulatedEntryPriceUsd: 0.0011 },
      },
      {
        label: 'execution model',
        patch: { ...paper, executionModel: 'modeled_fill' as unknown as PaperEvaluation['executionModel'] },
      },
    ];

    for (const item of cases) {
      expect(() => {
        repository.recordPaperBundle({
          ...bundle,
          paperEvaluation: item.patch,
        });
      }, item.label).toThrow(PersistenceError);
      expect(repository.getStats().paperEvaluationCount, item.label).toBe(1);
    }
  });

  it('rejects forged actions that disagree with the strategy evaluation', () => {
    const repository = openMemoryRepo();
    const noEntry = noEntryPaperBundle();
    expect(() => {
      repository.recordPaperBundle({
        ...noEntry,
        paperEvaluation: {
          ...noEntry.paperEvaluation,
          paperAction: 'entry_observation',
          noActionReason: null,
          referencePriceUsd: 0.001,
          simulatedEntryPriceUsd: 0.001,
        },
      });
    }).toThrow(PersistenceError);

    const insufficient = insufficientPaperBundle();
    expect(() => {
      repository.recordPaperBundle({
        ...insufficient,
        paperEvaluation: {
          ...insufficient.paperEvaluation,
          paperAction: 'entry_observation',
          noActionReason: null,
          referencePriceUsd: 0.001,
          simulatedEntryPriceUsd: 0.001,
        },
      });
    }).toThrow(PersistenceError);

    const entry = paperBundle();
    expect(() => {
      repository.recordPaperBundle({
        ...entry,
        paperEvaluation: {
          ...entry.paperEvaluation,
          paperAction: 'no_action',
          noActionReason: 'strategy_no_entry',
          referencePriceUsd: null,
          simulatedEntryPriceUsd: null,
        },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPaperBundle({
        ...entry,
        paperEvaluation: {
          ...entry.paperEvaluation,
          noActionReason: 'strategy_no_entry',
        },
      });
    }).toThrow(PersistenceError);
    expect(repository.getStats().paperEvaluationCount).toBe(0);
  });

  it('rejects a caller-defined paper price that is not the exact market snapshot price', () => {
    const repository = openMemoryRepo();
    const bundle = paperBundle({
      marketSnapshot: passingSnapshot({ priceUsd: 0.001 }),
    });
    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        paperEvaluation: {
          ...bundle.paperEvaluation,
          referencePriceUsd: 0.0011,
          simulatedEntryPriceUsd: 0.0011,
        },
      });
    }).toThrow(PersistenceError);
  });

  it('rejects p09_v1 definition drift on every identity field and does not update the stored row', () => {
    const drifts = [
      { column: 'paper_spec_name', value: 'other_name' },
      { column: 'feature_set_version', value: 'c06_v2' },
      { column: 'strategy_version', value: 's07_v2' },
      { column: 'strategy_definition_fingerprint', value: '0'.repeat(64) },
      { column: 'definition_fingerprint', value: 'old-paper-fingerprint' },
    ] as const;

    for (const drift of drifts) {
      const directory = mkdtempSync(join(tmpdir(), 'mtb-paper-drift-'));
      const path = join(directory, 'history.sqlite');
      const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

      try {
        applyMigrations(raw);
        raw.prepare(
          `INSERT INTO paper_definitions (
            paper_spec_version, paper_spec_name, feature_set_version, strategy_version,
            strategy_definition_fingerprint, definition_fingerprint, first_recorded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          PAPER_SPEC_VERSION,
          drift.column === 'paper_spec_name' ? drift.value : PAPER_SPEC_NAME,
          drift.column === 'feature_set_version' ? drift.value : FEATURE_SET_VERSION,
          drift.column === 'strategy_version' ? drift.value : STRATEGY_VERSION,
          drift.column === 'strategy_definition_fingerprint' ? drift.value : STRATEGY_DEFINITION_FINGERPRINT,
          drift.column === 'definition_fingerprint' ? drift.value : PAPER_DEFINITION_FINGERPRINT,
          T_10_00,
        );
        raw.close();

        const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
        try {
          repository.initialize();
          expect(() => {
            repository.recordPaperBundle(paperBundle());
          }, drift.column).toThrow(/fingerprint|definition/);
          expect(repository.getStats().paperEvaluationCount, drift.column).toBe(0);
          const stored = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
          try {
            const row = stored.prepare(
              `SELECT paper_spec_name, feature_set_version, strategy_version,
                      strategy_definition_fingerprint, definition_fingerprint, first_recorded_at
               FROM paper_definitions WHERE paper_spec_version = ?`,
            ).get(PAPER_SPEC_VERSION);
            expect(row?.[drift.column], drift.column).toBe(drift.value);
            expect(row?.['first_recorded_at'], drift.column).toBe(T_10_00);
          } finally {
            stored.close();
          }
        } finally {
          repository.close();
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    }
  });

  it('rolls back the entire paper bundle after forced failures', () => {
    const repository = openMemoryRepo();
    const before = repository.getTableCounts();
    const stages = [
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
    ] as const;

    for (const stage of stages) {
      expect(() => {
        repository.recordPaperBundleAndAbortAfter(paperBundle(), stage);
      }).toThrow(/Test-forced write failure/);
      expect(repository.getTableCounts(), stage).toEqual(before);
      expect(repository.getStats().paperEvaluationCount, stage).toBe(0);
      expect(repository.getStats().strategyEvaluationCount, stage).toBe(0);
      expect(repository.getTableCounts().paperDefinitions, stage).toBe(0);
      expect(repository.getTableCounts().riskScans, stage).toBe(0);
      expect(repository.getTableCounts().featureVectors, stage).toBe(0);
      expect(repository.getToken(WRAPPED_SOL_MINT), stage).toBeNull();
    }

    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/return this\.transact\(\(\) => this\.persistPaperBundle\(bundle\)\)/);
    expect(source).toMatch(/this\.persistStrategyBundle\(bundle/);
    expect(source).not.toMatch(/this\.recordStrategyBundle\(/);
    expect(source).toMatch(/WHERE e\.id = \?`/);
  });

  it('rolls back a paper constraint failure and leaves no orphan paper or strategy row', () => {
    const repository = openMemoryRepo();
    const before = repository.getTableCounts();
    expect(() => {
      repository.recordPaperBundleAndViolatePaperConstraint(paperBundle());
    }).toThrow(PersistenceError);
    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getStats().strategyEvaluationCount).toBe(0);
    expect(repository.getStats().paperEvaluationCount).toBe(0);
  });

  it('preserves pre-existing source rows when a later paper insert fails', () => {
    const repository = openMemoryRepo();
    const first = repository.recordPaperBundle(paperBundle());
    const tokenBefore = repository.getToken(WRAPPED_SOL_MINT);
    const before = repository.getTableCounts();
    const later = paperBundleAt(T_10_10, { scannedAt: T_10_10 });
    const stages = [
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
    ] as const;

    for (const stage of stages) {
      expect(() => {
        repository.recordPaperBundleAndAbortAfter(later, stage);
      }).toThrow(/Test-forced write failure/);
      expect(repository.getTableCounts(), stage).toEqual(before);
      expect(repository.getToken(WRAPPED_SOL_MINT), stage).toEqual(tokenBefore);
      expect(repository.getPaperHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0]?.id, stage).toBe(
        first.paperEvaluationId,
      );
    }

    expect(() => {
      repository.recordPaperBundleAndViolatePaperConstraint(later);
    }).toThrow(PersistenceError);
    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getToken(WRAPPED_SOL_MINT)).toEqual(tokenBefore);
    expect(repository.getPaperHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0]?.id).toBe(first.paperEvaluationId);
  });

  it('reuses exact sources and rejects changed market, risk, feature, and strategy facts', () => {
    const repository = openMemoryRepo();
    const first = repository.recordPaperBundle(paperBundle());
    expect(first.marketInserted).toBe(true);

    const reuse = repository.recordPaperBundle(paperBundle());
    expect(reuse.inserted).toBe(false);
    expect(reuse.marketInserted).toBe(false);
    expect(reuse.featureInserted).toBe(false);
    expect(reuse.strategyInserted).toBe(false);

    expect(() => {
      repository.recordPaperBundle(
        paperBundle({
          marketSnapshot: passingSnapshot({ priceUsd: 999 }),
        }),
      );
    }).toThrow(PersistenceError);
  });

  it('links paper_evaluations.strategy_evaluation_id to the exact matching strategy evaluation, not the newest row', () => {
    const repository = openMemoryRepo();
    const older = paperBundleAt(T_10_00);
    const newer = paperBundleAt(T_10_10);
    const olderStrategy = repository.recordStrategyBundle(older);
    const newerStrategy = repository.recordStrategyBundle(newer);
    expect(newerStrategy.evaluationId).toBeGreaterThan(olderStrategy.evaluationId);
    expect(repository.getStats().strategyEvaluationCount).toBe(2);

    const paper = repository.recordPaperBundle(older);
    expect(paper.strategyEvaluationId).toBe(olderStrategy.evaluationId);
    expect(paper.strategyEvaluationId).not.toBe(newerStrategy.evaluationId);
    expect(paper.vectorId).toBe(olderStrategy.vectorId);
    expect(paper.inserted).toBe(true);

    const stored = repository.getPaperHistory(WRAPPED_SOL_MINT, 20)?.evaluations.find(
      (item) => item.id === paper.paperEvaluationId,
    );
    expect(stored?.strategyEvaluationId).toBe(olderStrategy.evaluationId);
    expect(stored?.asOf).toBe(T_10_00);
    expect(stored?.strategyDecision).toBe(older.strategyEvaluation.decision);

    const newestStrategy = repository.getStrategyHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0];
    expect(newestStrategy?.id).toBe(newerStrategy.evaluationId);
    expect(paper.strategyEvaluationId).not.toBe(newestStrategy?.id);
  });

  it('rejects forged market and paper prices, including NO_ACTION numeric prices', () => {
    const repository = openMemoryRepo();
    const bundle = paperBundle({
      marketSnapshot: passingSnapshot({ priceUsd: 0.001 }),
    });
    const nextPrice = nextRepresentableNumber(0.001);

    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, pairAddress: OTHER_PAIR },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, collectedAt: T_10_05 },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, priceUsd: 999 },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        marketSnapshot: { ...bundle.marketSnapshot, priceUsd: nextPrice },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        paperEvaluation: {
          ...bundle.paperEvaluation,
          referencePriceUsd: nextPrice,
          simulatedEntryPriceUsd: nextPrice,
        },
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordPaperBundle({
        ...bundle,
        paperEvaluation: {
          ...bundle.paperEvaluation,
          simulatedEntryPriceUsd: nextPrice,
        },
      });
    }).toThrow(PersistenceError);

    const noEntry = noEntryPaperBundle();
    expect(() => {
      repository.recordPaperBundle({
        ...noEntry,
        paperEvaluation: {
          ...noEntry.paperEvaluation,
          referencePriceUsd: 0.001,
          simulatedEntryPriceUsd: 0.001,
        },
      });
    }).toThrow(PersistenceError);
    const insufficient = insufficientPaperBundle();
    expect(() => {
      repository.recordPaperBundle({
        ...insufficient,
        paperEvaluation: {
          ...insufficient.paperEvaluation,
          referencePriceUsd: 0.001,
          simulatedEntryPriceUsd: 0.001,
        },
      });
    }).toThrow(PersistenceError);
    expect(repository.getStats().paperEvaluationCount).toBe(0);
  });

  it('returns token-scoped history newest first with id tie-break and a bounded limit', () => {
    const repository = openMemoryRepo();
    repository.recordPaperBundle(paperBundleAt(T_10_00, { pairAddress: PAIR_ADDRESS }));
    const newer = repository.recordPaperBundle(paperBundleAt(T_10_10, { pairAddress: PAIR_ADDRESS }));
    const sameTime = repository.recordPaperBundle(paperBundleAt(T_10_10, { pairAddress: OTHER_PAIR }));
    repository.recordPaperBundle(paperBundleAt(T_10_05, { tokenMint: USDC_MINT, pairAddress: PAIR_ADDRESS }));

    const wrapped = repository.getPaperHistory(WRAPPED_SOL_MINT, 2);
    expect(wrapped?.evaluations).toHaveLength(2);
    expect(wrapped?.evaluations[0]?.asOf).toBe(T_10_10);
    expect(wrapped?.evaluations[0]?.id).toBe(sameTime.paperEvaluationId);
    expect(wrapped?.evaluations[1]?.id).toBe(newer.paperEvaluationId);
    expect(wrapped?.evaluations.every((item) => item.tokenMint === WRAPPED_SOL_MINT)).toBe(true);

    const usdc = repository.getPaperHistory(USDC_MINT, 20);
    expect(usdc?.evaluations).toHaveLength(1);
    expect(usdc?.evaluations[0]?.tokenMint).toBe(USDC_MINT);
    expect(usdc?.evaluations[0]?.noActionReason ?? usdc?.evaluations[0]?.paperAction).toBeDefined();

    const bounded = repository.getPaperHistory(WRAPPED_SOL_MINT, 1000);
    expect(bounded?.evaluations.length).toBeLessThanOrEqual(100);
    expect(repository.getPaperHistory('UnknownMint111111111111111111111111111', 20)).toBeNull();
  });

  it('preserves stored no-action reasons and prices without recomputing them', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-paper-hist-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      repository.initialize();
      const noEntry = noEntryPaperBundle();
      repository.recordPaperBundle(noEntry);
      repository.close();

      const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        raw.prepare(
          `UPDATE feature_values
           SET number_value = 999999
           WHERE feature_name = 'market_liquidity_usd'`,
        ).run();
      } finally {
        raw.close();
      }

      const reader = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        reader.initialize();
        const stored = reader.getPaperHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0];
        expect(stored?.paperAction).toBe('no_action');
        expect(stored?.noActionReason).toBe('strategy_no_entry');
        expect(stored?.referencePriceUsd).toBeNull();
        expect(stored?.simulatedEntryPriceUsd).toBeNull();
        expect(evaluatePaperAction(paperBundle()).paperAction).toBe('entry_observation');
        expect(evaluatePaperAction({
          marketSnapshot: noEntry.marketSnapshot,
          featureVector: noEntry.featureVector,
          strategyEvaluation: noEntry.strategyEvaluation,
        }).noActionReason).toBe('strategy_no_entry');
      } finally {
        reader.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('paper SQLite constraints', () => {
  it('enforces action, price, reason, uniqueness, and foreign keys', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-paper-check-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      repository.initialize();
      const recorded = repository.recordPaperBundle(paperBundle());
      repository.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        const tokenId = 1;
        const strategyId = recorded.strategyEvaluationId;
        const identity = (suffix: string) => `{"paperSpecVersion":"p09_v1","suffix":"${suffix}"}`;

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'entry_candidate',
            action: 'buy',
            reason: null,
            reference: 0.001,
            simulated: 0.001,
            identity: identity('buy'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'hold',
            action: 'no_action',
            reason: 'strategy_no_entry',
            reference: null,
            simulated: null,
            identity: identity('hold'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'entry_candidate',
            action: 'entry_observation',
            reason: null,
            reference: null,
            simulated: null,
            identity: identity('null-price'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'entry_candidate',
            action: 'entry_observation',
            reason: null,
            reference: 0,
            simulated: 0,
            identity: identity('zero-price'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'entry_candidate',
            action: 'entry_observation',
            reason: null,
            reference: 0.001,
            simulated: 0.0011,
            identity: identity('price-mismatch'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'no_entry',
            action: 'no_action',
            reason: 'strategy_no_entry',
            reference: 0.001,
            simulated: 0.001,
            identity: identity('no-action-price'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'no_entry',
            action: 'no_action',
            reason: 'strategy_insufficient_data',
            reference: null,
            simulated: null,
            identity: identity('wrong-reason-no-entry'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'insufficient_data',
            action: 'no_action',
            reason: 'strategy_no_entry',
            reference: null,
            simulated: null,
            identity: identity('wrong-reason-insufficient'),
          });
        }).toThrow();

        insertPaperRow(database, {
          tokenId,
          strategyId,
          decision: 'no_entry',
          action: 'no_action',
          reason: 'strategy_no_entry',
          reference: null,
          simulated: null,
          identity: identity('unique'),
        });
        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId,
            decision: 'no_entry',
            action: 'no_action',
            reason: 'strategy_no_entry',
            reference: null,
            simulated: null,
            identity: identity('unique'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId: 999,
            strategyId,
            decision: 'no_entry',
            action: 'no_action',
            reason: 'strategy_no_entry',
            reference: null,
            simulated: null,
            identity: identity('fk-token'),
          });
        }).toThrow();

        expect(() => {
          insertPaperRow(database, {
            tokenId,
            strategyId: 999,
            decision: 'no_entry',
            action: 'no_action',
            reason: 'strategy_no_entry',
            reference: null,
            simulated: null,
            identity: identity('fk-strategy'),
          });
        }).toThrow();

        expect(() => {
          database.prepare(
            `INSERT INTO paper_evaluations (
              token_id, strategy_evaluation_id, paper_spec_version, paper_definition_fingerprint,
              strategy_definition_fingerprint, feature_set_version, as_of, evaluated_at, market_collected_at,
              pair_address, strategy_decision, paper_action, no_action_reason, reference_price_usd,
              simulated_entry_price_usd, execution_model, cost_model, quantity_model, position_model,
              exit_model, source_identity
            ) VALUES (?, ?, 'missing_spec', ?, ?, 'c06_v1', ?, ?, ?, ?, 'no_entry', 'no_action',
              'strategy_no_entry', NULL, NULL, 'exact_strategy_market_snapshot_reference_price', 'none', 'none',
              'none', 'none', ?)`,
          ).run(
            tokenId,
            strategyId,
            PAPER_DEFINITION_FINGERPRINT,
            STRATEGY_DEFINITION_FINGERPRINT,
            T_10_00,
            T_10_00,
            T_10_00,
            PAIR_ADDRESS,
            identity('fk-definition'),
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

function readPaperDefinitionTime(path: string): string {
  const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
  try {
    return String(
      database.prepare('SELECT first_recorded_at FROM paper_definitions WHERE paper_spec_version = ?').get(
        PAPER_SPEC_VERSION,
      )?.['first_recorded_at'],
    );
  } finally {
    database.close();
  }
}

function insertPaperRow(
  database: ReturnType<typeof openSqliteDatabase>,
  input: {
    tokenId: number;
    strategyId: number;
    decision: string;
    action: string;
    reason: string | null;
    reference: number | null;
    simulated: number | null;
    identity: string;
  },
): void {
  database.prepare(
    `INSERT INTO paper_evaluations (
      token_id, strategy_evaluation_id, paper_spec_version, paper_definition_fingerprint,
      strategy_definition_fingerprint, feature_set_version, as_of, evaluated_at, market_collected_at,
      pair_address, strategy_decision, paper_action, no_action_reason, reference_price_usd,
      simulated_entry_price_usd, execution_model, cost_model, quantity_model, position_model,
      exit_model, source_identity
    ) VALUES (?, ?, ?, ?, ?, 'c06_v1', ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'exact_strategy_market_snapshot_reference_price', 'none', 'none', 'none', 'none', ?)`,
  ).run(
    input.tokenId,
    input.strategyId,
    PAPER_SPEC_VERSION,
    PAPER_DEFINITION_FINGERPRINT,
    STRATEGY_DEFINITION_FINGERPRINT,
    T_10_00,
    T_10_00,
    T_10_00,
    PAIR_ADDRESS,
    input.decision,
    input.action,
    input.reason,
    input.reference,
    input.simulated,
    input.identity,
  );
}
