import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { featureSourceIdentity } from '../src/features/numbers.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { applyMigrations, LATEST_SCHEMA_VERSION, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import {
  FEATURE_MIGRATION_NAME,
  INITIAL_MIGRATION_NAME,
  RISK_MIGRATION_NAME,
  STRATEGY_MIGRATION_NAME,
  STRATEGY_MIGRATION_VERSION,
  migrationSqlDigest,
} from '../src/persistence/sqlite/migrations.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from '../src/strategy/identity.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from '../src/strategy/constants.js';
import { FINDING_CODES } from '../src/risk/constants.js';
import {
  OTHER_PAIR,
  PAIR_ADDRESS,
  T_09_00,
  T_09_30,
  T_10_00,
  T_10_05,
  T_10_10,
  previousSnapshot,
  sampleRisk,
  sampleSnapshot,
  sampleVector,
} from './feature-fixtures.js';
import {
  passingBundle,
  passingRisk,
  passingSnapshot,
  passingVector,
  withAvailableNumber,
} from './strategy-fixtures.js';

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

describe('strategy persistence migration', () => {
  it('applies migration 004 and upgrades v3 to the latest schema without deleting older rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-strategy-mig-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw, { targetVersion: 3 });
      expect(raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(3);
      raw.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('solana', ?, ?, ?, ?)`,
      ).run(WRAPPED_SOL_MINT, T_09_00, T_09_00, T_09_00);
      raw.prepare(
        'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, 1)',
      ).run(T_09_00, T_09_00);
      raw.prepare(
        `INSERT INTO feature_vectors (
          token_id, feature_set_version, generated_at, as_of, market_collected_at, market_pair_address,
          previous_market_collected_at, risk_scanned_at, feature_completeness, available_feature_count,
          unavailable_feature_count, source_identity
        ) VALUES (1, 'c06_v1', ?, ?, ?, ?, NULL, NULL, 'partial', 0, 1, 'legacy-v3-identity')`,
      ).run(T_10_00, T_10_00, T_10_00, PAIR_ADDRESS);
      raw.prepare(
        `INSERT INTO feature_values (
          vector_id, ordinal, feature_name, kind, status, number_value, integer_value, boolean_value,
          unavailable_reason
        ) VALUES (1, 0, 'market_price_usd', 'number', 'unavailable', NULL, NULL, NULL, 'legacy')`,
      ).run();
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        repository.initialize();
        expect(repository.getStats().schemaVersion).toBe(LATEST_SCHEMA_VERSION);
        expect(repository.getTableCounts().schemaMigrations).toBe(LATEST_SCHEMA_VERSION);
        expect(repository.getToken(WRAPPED_SOL_MINT)?.mint).toBe(WRAPPED_SOL_MINT);
        expect(repository.getStats().discoveryRunCount).toBe(1);
        expect(repository.getStats().featureVectorCount).toBe(1);
        expect(repository.getFeatureHistory(WRAPPED_SOL_MINT, 20)?.vectors[0]?.sourceIdentity).toBe(
          'legacy-v3-identity',
        );

        const recorded = repository.recordStrategyBundle(passingBundle());
        expect(recorded.inserted).toBe(true);
        expect(repository.getStats().strategyEvaluationCount).toBe(1);
        expect(repository.getStats().integrity.ok).toBe(true);
        expect(STRATEGY_MIGRATION_VERSION).toBe(4);
        expect(STRATEGY_MIGRATION_NAME).toBe('004_strategy_evaluations');
        expect(INITIAL_MIGRATION_NAME).toBe('001_initial_persistence');
        expect(RISK_MIGRATION_NAME).toBe('002_token_risk_scans');
        expect(FEATURE_MIGRATION_NAME).toBe('003_feature_vectors');
      } finally {
        repository.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps historical migration names and does not rewrite 001-004', () => {
    const source = readFileSync(new URL('../src/persistence/sqlite/migrations.ts', import.meta.url), 'utf8');
    expect(source.indexOf('001_initial_persistence')).toBeLessThan(source.indexOf('002_token_risk_scans'));
    expect(source.indexOf('002_token_risk_scans')).toBeLessThan(source.indexOf('003_feature_vectors'));
    expect(source.indexOf('003_feature_vectors')).toBeLessThan(source.indexOf('004_strategy_evaluations'));
    expect(source.indexOf('004_strategy_evaluations')).toBeLessThan(source.indexOf('005_paper_evaluations'));
    expect(source).toContain('CREATE TABLE feature_vectors');
    expect(source).toContain('CREATE TABLE strategy_evaluations');
    expect(source).toContain('CREATE TABLE paper_evaluations');
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(2)).toBe('c80bbcc691b4eb36c75a3a5fae303f694241152d2ab79679ec8328f9b267071e');
    expect(migrationSqlDigest(3)).toBe('891ed1347be25bcda40cc2219208789fd3af117f91d9d140367c241c087ece1c');
    expect(migrationSqlDigest(4)).toBe('eb21748b78a5ff33fb8bd6f590b24f9be098ff5a343107de74e50d528b84d308');
  });
});

describe('strategy persistence', () => {
  it('persists the strategy definition, evaluation, and ordered rule results', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    const recorded = repository.recordStrategyBundle(bundle);
    const history = repository.getStrategyHistory(WRAPPED_SOL_MINT, 20);

    expect(recorded.inserted).toBe(true);
    expect(recorded.definitionInserted).toBe(true);
    expect(recorded.featureInserted).toBe(true);
    expect(history?.evaluations).toHaveLength(1);
    expect(history?.evaluations[0]?.strategyVersion).toBe(STRATEGY_VERSION);
    expect(history?.evaluations[0]?.strategyName).toBe(STRATEGY_NAME);
    expect(history?.evaluations[0]?.strategyDefinitionFingerprint).toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(history?.evaluations[0]?.featureSetVersion).toBe(FEATURE_SET_VERSION);
    expect(history?.evaluations[0]?.decision).toBe('entry_candidate');
    expect(history?.evaluations[0]?.passedRuleCount).toBe(10);
    expect(history?.evaluations[0]?.failedRuleCount).toBe(0);
    expect(history?.evaluations[0]?.unavailableRuleCount).toBe(0);
    expect(history?.evaluations[0]?.rules.map((item) => item.ruleCode)).toEqual([
      'PRICE_POSITIVE',
      'LIQUIDITY_MINIMUM',
      'PAIR_AGE_RANGE',
      'MARKET_FRESHNESS',
      'TRADES_5M_MINIMUM',
      'VOLUME_LIQUIDITY_5M_MINIMUM',
      'BUY_SHARE_5M_MINIMUM',
      'NET_BUYS_5M_MINIMUM',
      'PRICE_CHANGE_5M_RANGE',
      'NO_BLOCKING_RISK_FINDINGS',
    ]);
    expect(history?.evaluations[0]?.sourceIdentity).toBe(
      strategySourceIdentity({
        strategyVersion: bundle.strategyEvaluation.strategyVersion,
        strategyDefinitionFingerprint: bundle.strategyEvaluation.strategyDefinitionFingerprint,
        featureSourceIdentity: bundle.strategyEvaluation.featureSourceIdentity,
      }),
    );
    expect(history?.evaluations[0]?.featureSourceIdentity).toBe(featureSourceIdentity(bundle.featureVector));
    expect(repository.getTableCounts().strategyDefinitions).toBe(1);
  });

  it('reuses the same version and fingerprint and excludes evaluatedAt from identity', () => {
    const repository = openMemoryRepo();
    const firstVector = passingVector({ previousMarket: null }, { generatedAt: T_10_00 });
    const secondVector = passingVector({ previousMarket: null }, { generatedAt: T_10_05 });
    const first = repository.recordStrategyBundle(
      passingBundle({
        featureVector: firstVector,
        strategyEvaluation: evaluateStrategy(firstVector, { evaluatedAt: T_10_00 }),
      }),
    );
    const second = repository.recordStrategyBundle(
      passingBundle({
        featureVector: secondVector,
        strategyEvaluation: evaluateStrategy(secondVector, { evaluatedAt: T_10_10 }),
      }),
    );

    expect(featureSourceIdentity(firstVector)).toBe(featureSourceIdentity(secondVector));
    expect(second.inserted).toBe(false);
    expect(second.evaluationId).toBe(first.evaluationId);
    expect(repository.getStats().strategyEvaluationCount).toBe(1);
    expect(repository.getStrategyHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0]?.evaluatedAt).toBe(T_10_00);
  });

  it('treats an exact duplicate evaluation as a no-op', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    const first = repository.recordStrategyBundle(bundle);
    const second = repository.recordStrategyBundle(bundle);
    expect(second.inserted).toBe(false);
    expect(second.evaluationId).toBe(first.evaluationId);
    expect(repository.getStats().strategyEvaluationCount).toBe(1);
  });

  it('fails when the same identity would store a different decision or rule result', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    repository.recordStrategyBundle(bundle);

    const failedVector = withAvailableNumber(bundle.featureVector, 'market_liquidity_usd', 10_000);
    const failedEvaluation = {
      ...evaluateStrategy(failedVector, { evaluatedAt: bundle.strategyEvaluation.evaluatedAt }),
      featureSourceIdentity: bundle.strategyEvaluation.featureSourceIdentity,
    };

    expect(() => {
      repository.recordStrategyBundle({
        ...bundle,
        strategyEvaluation: failedEvaluation,
      });
    }).toThrow(PersistenceError);
    expect(repository.getStats().strategyEvaluationCount).toBe(1);

    const mutatedRules = {
      ...bundle.strategyEvaluation,
      rules: bundle.strategyEvaluation.rules.map((item) =>
        item.ruleCode === 'PRICE_POSITIVE' ? { ...item, observed: 'forged' } : item,
      ),
    };
    expect(() => {
      repository.recordStrategyBundle({
        ...bundle,
        strategyEvaluation: mutatedRules,
      });
    }).toThrow(PersistenceError);
  });

  it('fails when a stored s07_v1 definition fingerprint disagrees with current code', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-strategy-drift-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw);
      raw.prepare(
        `INSERT INTO strategy_definitions (
          strategy_version, strategy_name, feature_set_version, definition_fingerprint, first_recorded_at
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(STRATEGY_VERSION, STRATEGY_NAME, FEATURE_SET_VERSION, 'old-fingerprint', T_10_00);
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        expect(() => {
          repository.recordStrategyBundle(passingBundle());
        }).toThrow(/fingerprint/);
        expect(repository.getStats().strategyEvaluationCount).toBe(0);
        const stored = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
        try {
          expect(stored.prepare('SELECT definition_fingerprint FROM strategy_definitions').get()?.['definition_fingerprint']).toBe(
            'old-fingerprint',
          );
        } finally {
          stored.close();
        }
      } finally {
        repository.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rolls back the entire strategy bundle after a child insert', () => {
    const repository = openMemoryRepo();
    repository.recordMarketSnapshots([previousSnapshot()]);
    const beforeToken = repository.getToken(WRAPPED_SOL_MINT);
    const before = repository.getTableCounts();

    expect(() => {
      repository.recordStrategyBundleAndAbortAfterChild(passingBundle());
    }).toThrow(/after child insert/);

    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(beforeToken?.firstObservedAt);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(beforeToken?.lastObservedAt);
    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getStats().strategyEvaluationCount).toBe(0);
    expect(repository.getStats().featureVectorCount).toBe(0);
  });

  it('reuses matching market, risk, and feature sources and fails on conflicts', () => {
    const repository = openMemoryRepo();
    expect(repository.recordMarketSnapshots([passingSnapshot()])).toBe(1);
    expect(repository.recordRiskReport(passingRisk()).tokenMint).toBe(WRAPPED_SOL_MINT);

    const matching = repository.recordStrategyBundle(passingBundle());
    expect(matching.marketInserted).toBe(false);
    expect(matching.riskInserted).toBe(false);
    expect(repository.getStats().marketSnapshotCount).toBe(1);
    expect(repository.getStats().riskScanCount).toBe(1);

    const laterMarket = passingSnapshot({ collectedAt: T_10_05 });
    const laterVector = passingVector({
      previousMarket: null,
      market: laterMarket,
      asOf: T_10_05,
    }, { generatedAt: T_10_05 });
    const existingFeature = repository.recordStrategyBundle(
      passingBundle({
        marketSnapshot: laterMarket,
        featureVector: laterVector,
        strategyEvaluation: evaluateStrategy(laterVector, { evaluatedAt: T_10_05 }),
      }),
    );
    expect(existingFeature.inserted).toBe(true);

    const conflictingMarket = passingSnapshot({ priceUsd: 999 });
    expect(() => {
      repository.recordStrategyBundle(
        passingBundle({
          marketSnapshot: conflictingMarket,
          featureVector: passingVector({
            previousMarket: null,
            market: conflictingMarket,
            asOf: T_10_10,
          }, { generatedAt: T_10_10 }),
          strategyEvaluation: evaluateStrategy(
            passingVector({
              previousMarket: null,
              market: conflictingMarket,
              asOf: T_10_10,
            }, { generatedAt: T_10_10 }),
            { evaluatedAt: T_10_10 },
          ),
        }),
      );
    }).toThrow(/existing market snapshot/);

    const conflictingRisk = passingRisk({
      findings: [{
        code: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
        category: 'authority',
        severity: 'high',
        confidence: 'high',
        title: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
        description: FINDING_CODES.FREEZE_AUTHORITY_ACTIVE,
      }],
      highestFindingSeverity: 'high',
    });
    expect(() => {
      repository.recordStrategyBundle(
        passingBundle({
          riskReport: conflictingRisk,
          marketSnapshot: passingSnapshot({ collectedAt: '2026-08-17T10:20:00.000Z' }),
          featureVector: passingVector({
            previousMarket: null,
            market: passingSnapshot({ collectedAt: '2026-08-17T10:20:00.000Z' }),
            risk: conflictingRisk,
            asOf: '2026-08-17T10:20:00.000Z',
          }, { generatedAt: '2026-08-17T10:20:00.000Z' }),
          strategyEvaluation: evaluateStrategy(
            passingVector({
              previousMarket: null,
              market: passingSnapshot({ collectedAt: '2026-08-17T10:20:00.000Z' }),
              risk: conflictingRisk,
              asOf: '2026-08-17T10:20:00.000Z',
            }, { generatedAt: '2026-08-17T10:20:00.000Z' }),
            { evaluatedAt: '2026-08-17T10:20:00.000Z' },
          ),
        }),
      );
    }).toThrow(/existing risk scan/);

    const mutatedFeature = passingVector({ previousMarket: null });
    const forged = {
      ...mutatedFeature,
      values: mutatedFeature.values.map((value) =>
        value.name === 'market_price_usd' ? { ...value, value: 999 } : value,
      ),
    };
    expect(() => {
      repository.recordStrategyBundle({
        marketSnapshot: passingSnapshot(),
        riskReport: passingRisk(),
        featureVector: forged,
        strategyEvaluation: evaluateStrategy(forged, { evaluatedAt: forged.generatedAt }),
      });
    }).toThrow(PersistenceError);
  });

  it('returns strategy history newest-first, bounded, and clear for an unknown mint', () => {
    const repository = openMemoryRepo();
    const earlierMarket = passingSnapshot({ collectedAt: T_09_30 });
    const earlierRisk = passingRisk({ scannedAt: T_09_00 });
    const earlierVector = passingVector({
      previousMarket: null,
      market: earlierMarket,
      risk: earlierRisk,
      asOf: T_09_30,
    }, { generatedAt: T_09_30 });
    repository.recordStrategyBundle(
      passingBundle({
        marketSnapshot: earlierMarket,
        riskReport: earlierRisk,
        featureVector: earlierVector,
        strategyEvaluation: evaluateStrategy(earlierVector, { evaluatedAt: T_09_30 }),
      }),
    );
    repository.recordStrategyBundle(passingBundle());

    const latest = repository.getStrategyHistory(WRAPPED_SOL_MINT, 1);
    expect(latest?.evaluations).toHaveLength(1);
    expect(latest?.evaluations[0]?.asOf).toBe(T_10_00);
    expect(repository.getStrategyHistory(WRAPPED_SOL_MINT, 20)?.evaluations).toHaveLength(2);
    expect(repository.getStrategyHistory(USDC_MINT, 20)).toBeNull();
    expect(OTHER_PAIR).toBeTruthy();
    expect(sampleSnapshot).toBeTypeOf('function');
    expect(sampleRisk).toBeTypeOf('function');
    expect(sampleVector).toBeTypeOf('function');
  });

  it('does not use INSERT OR IGNORE or REPLACE for strategy history', () => {
    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    const strategySql = source.slice(source.indexOf('insertStrategyEvaluation'));
    expect(strategySql).not.toMatch(/INSERT OR IGNORE/i);
    expect(strategySql).not.toMatch(/INSERT OR REPLACE/i);
    expect(strategySql).not.toMatch(/REPLACE INTO/i);
  });
});

describe('strategy persistence integrity', () => {
  it('recomputes Checkpoint 06 feature identity and links the exact feature vector row', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-strategy-link-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      repository.initialize();
      const bundle = passingBundle();
      const recorded = repository.recordStrategyBundle(bundle);
      const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        const row = raw
          .prepare(
            `SELECT e.id AS evaluation_id, e.token_id AS evaluation_token_id, e.feature_vector_id,
                    e.feature_set_version AS evaluation_feature_set, e.as_of AS evaluation_as_of,
                    e.source_identity AS evaluation_source, f.id AS vector_id, f.token_id AS vector_token_id,
                    f.feature_set_version AS vector_feature_set, f.as_of AS vector_as_of,
                    f.source_identity AS vector_source, t.mint
             FROM strategy_evaluations e
             JOIN feature_vectors f ON f.id = e.feature_vector_id
             JOIN tokens t ON t.id = e.token_id
             WHERE e.id = ?`,
          )
          .get(recorded.evaluationId);
        expect(row?.['evaluation_token_id']).toBe(row?.['vector_token_id']);
        expect(row?.['mint']).toBe(WRAPPED_SOL_MINT);
        expect(row?.['evaluation_feature_set']).toBe(FEATURE_SET_VERSION);
        expect(row?.['vector_feature_set']).toBe(FEATURE_SET_VERSION);
        expect(row?.['evaluation_as_of']).toBe(bundle.featureVector.asOf);
        expect(row?.['vector_as_of']).toBe(bundle.featureVector.asOf);
        expect(row?.['vector_source']).toBe(featureSourceIdentity(bundle.featureVector));
        expect(row?.['feature_vector_id']).toBe(recorded.vectorId);
        expect(row?.['vector_id']).toBe(recorded.vectorId);
        expect(row?.['evaluation_source']).toBe(
          strategySourceIdentity({
            strategyVersion: STRATEGY_VERSION,
            strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
            featureSourceIdentity: featureSourceIdentity(bundle.featureVector),
          }),
        );
        expect(
          raw.prepare('SELECT COUNT(*) AS count FROM feature_vectors').get()?.['count'],
        ).toBe(1);
      } finally {
        raw.close();
      }
    } finally {
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects a caller-supplied feature source identity string', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    expect(() => {
      repository.recordStrategyBundle({
        ...bundle,
        strategyEvaluation: {
          ...bundle.strategyEvaluation,
          featureSourceIdentity: 'caller-supplied-identity',
        },
      });
    }).toThrow(/featureSourceIdentity/);
    expect(repository.getStats().strategyEvaluationCount).toBe(0);
  });

  it('keeps first_recorded_at unchanged when the same identity is evaluated later', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-strategy-first-'));
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      repository.initialize();
      const vector = passingVector({ previousMarket: null }, { generatedAt: T_10_00 });
      repository.recordStrategyBundle(
        passingBundle({
          featureVector: vector,
          strategyEvaluation: evaluateStrategy(vector, { evaluatedAt: T_10_00 }),
        }),
      );
      repository.recordStrategyBundle(
        passingBundle({
          featureVector: vector,
          strategyEvaluation: evaluateStrategy(vector, { evaluatedAt: T_10_10 }),
        }),
      );

      const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      try {
        expect(raw.prepare('SELECT first_recorded_at FROM strategy_definitions').get()?.['first_recorded_at']).toBe(
          T_10_00,
        );
        expect(raw.prepare('SELECT evaluated_at FROM strategy_evaluations').get()?.['evaluated_at']).toBe(T_10_00);
        expect(raw.prepare('SELECT COUNT(*) AS count FROM strategy_evaluations').get()?.['count']).toBe(1);
      } finally {
        raw.close();
      }
    } finally {
      repository.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects same-identity mutations of decision, status, observed, reason, order, and counts', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    repository.recordStrategyBundle(bundle);
    const evaluation = bundle.strategyEvaluation;

    const cases: { label: string; patch: typeof evaluation }[] = [
      {
        label: 'decision',
        patch: { ...evaluation, decision: 'no_entry' },
      },
      {
        label: 'status',
        patch: {
          ...evaluation,
          rules: evaluation.rules.map((item, index) => (index === 0 ? { ...item, status: 'fail' } : item)),
        },
      },
      {
        label: 'observed',
        patch: {
          ...evaluation,
          rules: evaluation.rules.map((item, index) => (index === 0 ? { ...item, observed: 'forged' } : item)),
        },
      },
      {
        label: 'reason',
        patch: {
          ...evaluation,
          rules: evaluation.rules.map((item, index) => (index === 0 ? { ...item, reason: 'forged' } : item)),
        },
      },
      {
        label: 'order',
        patch: (() => {
          const firstRule = evaluation.rules[0];
          const secondRule = evaluation.rules[1];
          if (firstRule === undefined || secondRule === undefined) {
            throw new Error('Expected at least two rule results.');
          }
          return {
            ...evaluation,
            rules: [secondRule, firstRule, ...evaluation.rules.slice(2)],
          };
        })(),
      },
      {
        label: 'counts',
        patch: { ...evaluation, passedRuleCount: 9, unavailableRuleCount: 1 },
      },
    ];

    for (const item of cases) {
      expect(() => {
        repository.recordStrategyBundle({
          ...bundle,
          strategyEvaluation: item.patch,
        });
      }).toThrow(PersistenceError);
      expect(repository.getStats().strategyEvaluationCount, item.label).toBe(1);
      expect(repository.getStrategyHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0]?.decision).toBe('entry_candidate');
    }
  });

  it('rolls back a new strategy evaluation when sources already exist', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    const recordedFeature = repository.recordFeatureBundle({
      marketSnapshot: bundle.marketSnapshot,
      riskReport: bundle.riskReport,
      featureVector: bundle.featureVector,
    });
    const before = repository.getTableCounts();
    const beforeToken = repository.getToken(WRAPPED_SOL_MINT);

    expect(() => {
      repository.recordStrategyBundleAndAbortAfterChild(bundle);
    }).toThrow(/after child insert/);

    expect(recordedFeature.inserted).toBe(true);
    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(beforeToken?.firstObservedAt);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(beforeToken?.lastObservedAt);
    expect(repository.getStats().strategyEvaluationCount).toBe(0);
    expect(repository.getStats().featureVectorCount).toBe(1);
    expect(repository.getStats().marketSnapshotCount).toBe(1);
    expect(repository.getStats().riskScanCount).toBe(1);
  });

  it('lets SQLite reject invalid strategy enums, negative counts, and duplicate identities', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-strategy-check-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw);
      raw.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('solana', ?, ?, ?, ?)`,
      ).run(WRAPPED_SOL_MINT, T_10_00, T_10_00, T_10_00);
      raw.prepare(
        `INSERT INTO feature_vectors (
          token_id, feature_set_version, generated_at, as_of, market_collected_at, market_pair_address,
          previous_market_collected_at, risk_scanned_at, feature_completeness, available_feature_count,
          unavailable_feature_count, source_identity
        ) VALUES (1, 'c06_v1', ?, ?, ?, ?, NULL, NULL, 'partial', 0, 1, 'constraint-vector')`,
      ).run(T_10_00, T_10_00, T_10_00, PAIR_ADDRESS);
      raw.prepare(
        `INSERT INTO strategy_definitions (
          strategy_version, strategy_name, feature_set_version, definition_fingerprint, first_recorded_at
        ) VALUES (?, ?, ?, ?, ?)`,
      ).run(STRATEGY_VERSION, STRATEGY_NAME, FEATURE_SET_VERSION, STRATEGY_DEFINITION_FINGERPRINT, T_10_00);

      const insertEvaluation = raw.prepare(
        `INSERT INTO strategy_evaluations (
          token_id, feature_vector_id, strategy_version, strategy_definition_fingerprint, feature_set_version,
          evaluated_at, as_of, decision, passed_rule_count, failed_rule_count, unavailable_rule_count,
          source_identity
        ) VALUES (1, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );

      expect(() => {
        insertEvaluation.run(
          STRATEGY_VERSION,
          STRATEGY_DEFINITION_FINGERPRINT,
          FEATURE_SET_VERSION,
          T_10_00,
          T_10_00,
          'maybe',
          10,
          0,
          0,
          'identity-a',
        );
      }).toThrow(/CHECK|constraint/i);
      expect(() => {
        insertEvaluation.run(
          STRATEGY_VERSION,
          STRATEGY_DEFINITION_FINGERPRINT,
          FEATURE_SET_VERSION,
          T_10_00,
          T_10_00,
          'entry_candidate',
          -1,
          0,
          0,
          'identity-b',
        );
      }).toThrow(/CHECK|constraint/i);

      insertEvaluation.run(
        STRATEGY_VERSION,
        STRATEGY_DEFINITION_FINGERPRINT,
        FEATURE_SET_VERSION,
        T_10_00,
        T_10_00,
        'entry_candidate',
        10,
        0,
        0,
        'identity-ok',
      );

      expect(() => {
        insertEvaluation.run(
          STRATEGY_VERSION,
          STRATEGY_DEFINITION_FINGERPRINT,
          FEATURE_SET_VERSION,
          T_10_00,
          T_10_00,
          'no_entry',
          0,
          10,
          0,
          'identity-ok',
        );
      }).toThrow(/UNIQUE|constraint/i);

      const insertRule = raw.prepare(
        `INSERT INTO strategy_rule_results (
          evaluation_id, ordinal, rule_code, category, status, description, criterion, observed, reason
        ) VALUES (1, ?, ?, ?, ?, 'd', 'c', 'o', 'r')`,
      );
      expect(() => {
        insertRule.run(1, 'PRICE_POSITIVE', 'market_quality', 'ok');
      }).toThrow(/CHECK|constraint/i);
      expect(() => {
        insertRule.run(1, 'PRICE_POSITIVE', 'alpha', 'pass');
      }).toThrow(/CHECK|constraint/i);

      insertRule.run(1, 'PRICE_POSITIVE', 'market_quality', 'pass');
      expect(() => {
        insertRule.run(1, 'PRICE_POSITIVE', 'market_quality', 'fail');
      }).toThrow(/UNIQUE|constraint/i);
      expect(() => {
        insertRule.run(1, 'LIQUIDITY_MINIMUM', 'market_quality', 'pass');
      }).toThrow(/UNIQUE|constraint/i);
    } finally {
      raw.close();
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('persists locale-independent observed evidence and does not look up the latest feature row', () => {
    const repository = openMemoryRepo();
    const bundle = passingBundle();
    repository.recordStrategyBundle(bundle);
    const stored = repository.getStrategyHistory(WRAPPED_SOL_MINT, 20)?.evaluations[0];
    expect(stored?.rules.find((item) => item.ruleCode === 'LIQUIDITY_MINIMUM')?.observed).toBe('100000');
    expect(stored?.rules.find((item) => item.ruleCode === 'BUY_SHARE_5M_MINIMUM')?.observed).toBe('6000 bps');
    expect(stored?.unavailableRuleCount).toBe(0);

    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    expect(source).toContain('assertExactFeatureVectorLinkage');
    expect(source).toContain('getFeatureById');
    expect(source.slice(source.indexOf('private persistStrategyBundle'), source.indexOf('private ensureStrategyDefinition'))).not.toMatch(
      /ORDER BY id DESC/,
    );
    expect(source).not.toMatch(/latest feature/i);
    expect(source).not.toMatch(/feature-relevant values/);
  });

  it('reads stored history without recomputing current strategy rules', () => {
    const source = readFileSync(new URL('../src/strategy/history.ts', import.meta.url), 'utf8');
    expect(source).toContain('getStrategyHistory');
    expect(source).not.toMatch(/evaluateStrategy|fetch\(|createReadOnlySolanaRpc|dexscreener/i);
    const repository = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    expect(repository).toMatch(/ORDER BY e\.as_of DESC, e\.id DESC/);
    expect(repository).toContain('clampHistoryLimit');
  });

  it('fails when an existing risk identity has different persisted historical facts', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(passingRisk());
    const conflicting = passingRisk({ supplyRaw: '99999', mintAuthority: WRAPPED_SOL_MINT });
    expect(() => {
      repository.recordStrategyBundle(
        passingBundle({
          riskReport: conflicting,
          featureVector: passingVector({
            previousMarket: null,
            risk: conflicting,
          }),
          strategyEvaluation: evaluateStrategy(
            passingVector({
              previousMarket: null,
              risk: conflicting,
            }),
            { evaluatedAt: T_10_00 },
          ),
        }),
      );
    }).toThrow(/existing risk scan/);
    expect(repository.getStats().riskScanCount).toBe(1);
    expect(repository.getStats().strategyEvaluationCount).toBe(0);
  });
});
