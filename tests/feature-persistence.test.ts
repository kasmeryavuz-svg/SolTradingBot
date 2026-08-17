import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { FEATURE_DEFINITIONS, FEATURE_NAMES, FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { generateFeatureVector } from '../src/features/engine.js';
import { featureSourceIdentity } from '../src/features/numbers.js';
import { FINDING_CODES } from '../src/risk/constants.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import { applyMigrations, LATEST_SCHEMA_VERSION, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import {
  FEATURE_GENERATED_AT,
  OTHER_PAIR,
  PAIR_ADDRESS,
  T_09_00,
  T_09_30,
  T_09_55,
  T_10_00,
  T_10_05,
  T_10_10,
  T_10_15,
  featureInputs,
  previousSnapshot,
  sampleRisk,
  sampleSnapshot,
  sampleVector,
} from './feature-fixtures.js';

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

describe('feature persistence migration', () => {
  it('upgrades a populated v2 database to v3 without deleting existing rows', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-feature-mig-'));
    const path = join(directory, 'history.sqlite');
    const raw = openSqliteDatabase({ path, busyTimeoutMs: 1000 });

    try {
      applyMigrations(raw, { targetVersion: 2 });
      expect(raw.prepare('SELECT MAX(version) AS version FROM schema_migrations').get()?.['version']).toBe(2);
      raw.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('solana', ?, ?, ?, ?)`,
      ).run(WRAPPED_SOL_MINT, T_09_00, T_09_00, T_09_00);
      raw.prepare(
        'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, 1)',
      ).run(T_09_00, T_09_00);
      raw.close();

      const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        repository.initialize();
        repository.initialize();
        expect(repository.getStats().schemaVersion).toBe(LATEST_SCHEMA_VERSION);
        expect(repository.getTableCounts().schemaMigrations).toBe(LATEST_SCHEMA_VERSION);
        expect(repository.getToken(WRAPPED_SOL_MINT)?.mint).toBe(WRAPPED_SOL_MINT);
        expect(repository.getStats().discoveryRunCount).toBe(1);

        const recorded = repository.recordFeatureBundle({
          marketSnapshot: sampleSnapshot(),
          riskReport: sampleRisk(),
          featureVector: sampleVector({ previousMarket: null }),
        });
        expect(recorded.inserted).toBe(true);
        expect(repository.getStats().featureVectorCount).toBe(1);
        expect(repository.getStats().integrity.ok).toBe(true);
      } finally {
        repository.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('feature persistence', () => {
  it('persists feature values in registry order and keeps unavailable reasons', () => {
    const repository = openMemoryRepo();
    const vector = sampleVector({ previousMarket: null });
    const recorded = repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: vector,
    });

    const history = repository.getFeatureHistory(WRAPPED_SOL_MINT, 20);
    expect(recorded.inserted).toBe(true);
    expect(history?.vectors).toHaveLength(1);
    expect(history?.vectors[0]?.values.map((value) => value.name)).toEqual([...FEATURE_NAMES]);
    const previousFeature = history?.vectors[0]?.values.find(
      (value) => value.name === 'seconds_since_previous_snapshot',
    );
    expect(previousFeature?.status).toBe('unavailable');
    expect(previousFeature?.unavailableReason).toMatch(/previous/);
    expect(history?.vectors[0]?.sourceIdentity).toBe(featureSourceIdentity(vector));
    expect(history?.vectors[0]?.values.find((value) => value.name === 'market_price_usd')).toMatchObject({
      kind: 'number',
      status: 'available',
      value: 100,
    });
    expect(history?.vectors[0]?.values.find((value) => value.name === 'trades_5m')).toMatchObject({
      kind: 'integer',
      status: 'available',
      value: 100,
    });
    expect(history?.vectors[0]?.values.find((value) => value.name === 'risk_data_complete')).toMatchObject({
      kind: 'boolean',
      status: 'available',
      value: true,
    });
  });

  it('treats the same sources and asOf with a later generatedAt as a no-op', () => {
    const repository = openMemoryRepo();
    const firstVector = sampleVector({ previousMarket: null }, { generatedAt: T_10_00 });
    const secondVector = sampleVector({ previousMarket: null }, { generatedAt: T_10_05 });
    expect(featureSourceIdentity(firstVector)).toBe(featureSourceIdentity(secondVector));
    expect(firstVector.generatedAt).not.toBe(secondVector.generatedAt);

    const first = repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: firstVector,
    });
    const second = repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: secondVector,
    });
    const history = repository.getFeatureHistory(WRAPPED_SOL_MINT, 20);
    expect(second.inserted).toBe(false);
    expect(second.vectorId).toBe(first.vectorId);
    expect(repository.getStats().featureVectorCount).toBe(1);
    expect(history?.vectors[0]?.generatedAt).toBe(T_10_00);
  });

  it('stores different asOf values as different source identities', () => {
    const repository = openMemoryRepo();
    const firstVector = sampleVector({ previousMarket: null, asOf: T_10_05 }, { generatedAt: T_10_05 });
    const secondVector = sampleVector({ previousMarket: null, asOf: T_10_10 }, { generatedAt: T_10_10 });
    expect(featureSourceIdentity(firstVector)).not.toBe(featureSourceIdentity(secondVector));

    expect(
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: firstVector,
      }).inserted,
    ).toBe(true);
    expect(
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: secondVector,
      }).inserted,
    ).toBe(true);
    expect(repository.getStats().featureVectorCount).toBe(2);
  });

  it('recomputes source identity and rejects a fake feature-set version', () => {
    const repository = openMemoryRepo();
    const vector = sampleVector({ previousMarket: null });
    expect(featureSourceIdentity(vector)).toContain(`"asOf":"${vector.asOf}"`);
    expect(featureSourceIdentity(vector)).not.toContain('generatedAt');

    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: { ...vector, featureSetVersion: 'c06_v2' },
      });
    }).toThrow(/feature-set version/);
    expect(repository.getStats().featureVectorCount).toBe(0);
  });

  it('reuses an identical existing market snapshot and fails when that identity disagrees', () => {
    const repository = openMemoryRepo();
    expect(repository.recordMarketSnapshots([sampleSnapshot()])).toBe(1);
    const matching = repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: sampleVector({ previousMarket: null }),
    });
    expect(matching.inserted).toBe(true);
    expect(matching.marketInserted).toBe(false);
    expect(repository.getStats().marketSnapshotCount).toBe(1);

    const mismatched = sampleVector({
      previousMarket: null,
      asOf: T_10_05,
      market: sampleSnapshot({ priceUsd: 999 }),
    }, { generatedAt: T_10_05 });
    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot({ priceUsd: 999 }),
        riskReport: sampleRisk(),
        featureVector: mismatched,
      });
    }).toThrow(/existing market snapshot/);
    expect(repository.getStats().featureVectorCount).toBe(1);
    expect(repository.getMarketHistory(WRAPPED_SOL_MINT, 20)?.snapshots[0]?.priceUsd).toBe(100);
  });

  it('reuses an identical existing risk scan and fails when that identity disagrees', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleRisk());
    const matching = repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: sampleVector({ previousMarket: null }),
    });
    expect(matching.riskInserted).toBe(false);
    expect(repository.getStats().riskScanCount).toBe(1);

    const conflictingRisk = sampleRisk({
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
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot({ collectedAt: T_10_05 }),
        riskReport: conflictingRisk,
        featureVector: sampleVector({
          previousMarket: null,
          market: sampleSnapshot({ collectedAt: T_10_05 }),
          risk: conflictingRisk,
          asOf: T_10_05,
        }),
      });
    }).toThrow(/existing risk scan/);
    expect(repository.getStats().riskScanCount).toBe(1);
    expect(repository.getStats().featureVectorCount).toBe(1);
  });

  it('rejects an existing risk identity when persisted historical facts differ', () => {
    const repository = openMemoryRepo();
    const original = sampleRisk();
    repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: original,
      featureVector: sampleVector({ previousMarket: null, risk: original }),
    });

    const supplyChanged = sampleRisk({ supplyRaw: '99999' });
    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: supplyChanged,
        featureVector: sampleVector({ previousMarket: null, risk: supplyChanged }),
      });
    }).toThrow(/existing risk scan/);

    const decimalsChanged = sampleRisk({ decimals: 9 });
    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: decimalsChanged,
        featureVector: sampleVector({ previousMarket: null, risk: decimalsChanged }),
      });
    }).toThrow(/existing risk scan/);
    expect(repository.getStats().riskScanCount).toBe(1);
    expect(repository.getStats().featureVectorCount).toBe(1);
  });

  it('reads history back with registry order and typed values', () => {
    const repository = openMemoryRepo();
    const vector = sampleVector({
      previousMarket: null,
      market: sampleSnapshot({ buys5m: 10, sells5m: 15 }),
    });
    repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot({ buys5m: 10, sells5m: 15 }),
      riskReport: sampleRisk(),
      featureVector: vector,
    });

    const stored = repository.getFeatureHistory(WRAPPED_SOL_MINT, 20)?.vectors[0];
    expect(stored?.values.map((value) => value.name)).toEqual(FEATURE_DEFINITIONS.map((item) => item.name));
    expect(stored?.values.find((value) => value.name === 'market_price_usd')).toMatchObject({
      kind: 'number',
      value: 100,
    });
    expect(stored?.values.find((value) => value.name === 'net_buys_5m')).toMatchObject({
      kind: 'integer',
      value: -5,
    });
    expect(stored?.values.find((value) => value.name === 'risk_data_complete')).toMatchObject({
      kind: 'boolean',
      value: true,
    });
    expect(Number.isInteger(stored?.values.find((value) => value.name === 'net_buys_5m')?.value)).toBe(true);
  });

  it('does not use broad INSERT OR IGNORE or REPLACE for feature rows', () => {
    const source = readFileSync(new URL('../src/persistence/sqlite/repository.ts', import.meta.url), 'utf8');
    const featureSql = source.slice(source.indexOf('insertFeatureVector'));
    expect(featureSql).not.toMatch(/INSERT OR IGNORE/i);
    expect(featureSql).not.toMatch(/INSERT OR REPLACE/i);
    expect(featureSql).not.toMatch(/REPLACE INTO/i);
  });

  it('treats an exact source duplicate as a deterministic no-op', () => {
    const repository = openMemoryRepo();
    const bundle = {
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: sampleVector({ previousMarket: null }),
    };
    const first = repository.recordFeatureBundle(bundle);
    const second = repository.recordFeatureBundle(bundle);
    expect(second.inserted).toBe(false);
    expect(second.vectorId).toBe(first.vectorId);
    expect(repository.getStats().featureVectorCount).toBe(1);
  });

  it('fails when the same source identity produces different feature output', () => {
    const repository = openMemoryRepo();
    const vector = sampleVector({ previousMarket: null });
    repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: vector,
    });

    const mutated = {
      ...vector,
      values: vector.values.map((value) =>
        value.name === 'market_price_usd' ? { ...value, value: 999 } : value,
      ),
    };
    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: mutated,
      });
    }).toThrow(PersistenceError);
    expect(repository.getStats().featureVectorCount).toBe(1);
  });

  it('rejects NaN and Infinity before writing feature values', () => {
    const repository = openMemoryRepo();
    const vector = sampleVector({ previousMarket: null });
    const nanVector = {
      ...vector,
      values: vector.values.map((value) =>
        value.name === 'market_price_usd'
          ? { ...value, status: 'available' as const, value: Number.NaN, unavailableReason: null }
          : value,
      ),
    };
    const infVector = {
      ...vector,
      values: vector.values.map((value) =>
        value.name === 'market_liquidity_usd'
          ? { ...value, status: 'available' as const, value: Number.POSITIVE_INFINITY, unavailableReason: null }
          : value,
      ),
    };

    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: nanVector,
      });
    }).toThrow(PersistenceError);
    expect(() => {
      repository.recordFeatureBundle({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: infVector,
      });
    }).toThrow(PersistenceError);
    expect(repository.getStats().featureVectorCount).toBe(0);
  });

  it('rolls back the entire feature bundle after a child insert', () => {
    const repository = openMemoryRepo();
    repository.recordMarketSnapshots([previousSnapshot()]);
    const beforeToken = repository.getToken(WRAPPED_SOL_MINT);
    const before = repository.getTableCounts();
    const vector = sampleVector();

    expect(() => {
      repository.recordFeatureBundleAndAbortAfterChild({
        marketSnapshot: sampleSnapshot(),
        riskReport: sampleRisk(),
        featureVector: vector,
      });
    }).toThrow(/after child insert/);

    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(beforeToken?.firstObservedAt);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(beforeToken?.lastObservedAt);
    expect(repository.getTableCounts()).toEqual(before);
  });

  it('selects the latest same-pair previous snapshot strictly before current', () => {
    const repository = openMemoryRepo();
    repository.recordMarketSnapshots([
      previousSnapshot({ collectedAt: T_09_00, pairAddress: PAIR_ADDRESS }),
      previousSnapshot({ collectedAt: T_09_30, pairAddress: PAIR_ADDRESS }),
      previousSnapshot({ collectedAt: T_09_30, pairAddress: OTHER_PAIR }),
      sampleSnapshot({ collectedAt: T_10_00 }),
      sampleSnapshot({ collectedAt: T_10_15 }),
    ]);

    const previous = repository.getPreviousMarketSnapshot(WRAPPED_SOL_MINT, PAIR_ADDRESS, T_10_00);
    expect(previous?.collectedAt).toBe(T_09_30);
    expect(previous?.pairAddress).toBe(PAIR_ADDRESS);
    expect(repository.getPreviousMarketSnapshot(WRAPPED_SOL_MINT, OTHER_PAIR, T_10_00)?.pairAddress).toBe(
      OTHER_PAIR,
    );
    expect(repository.getPreviousMarketSnapshot(USDC_MINT, PAIR_ADDRESS, T_10_00)).toBeNull();
  });

  it('selects historical risk with scanned_at <= asOf and a deterministic timestamp tie', () => {
    const repository = openMemoryRepo();
    repository.recordRiskReport(sampleRisk({ scannedAt: T_09_00 }));
    repository.recordRiskReport(sampleRisk({ scannedAt: T_09_55 }));
    repository.recordRiskReport(sampleRisk({ scannedAt: T_10_05 }));

    expect(repository.getLatestRiskScanAsOf(WRAPPED_SOL_MINT, T_10_00)?.scannedAt).toBe(T_09_55);
    expect(repository.getLatestRiskScanAsOf(WRAPPED_SOL_MINT, T_09_00)?.scannedAt).toBe(T_09_00);
    expect(repository.getLatestRiskScanAsOf(WRAPPED_SOL_MINT, T_10_05)?.scannedAt).toBe(T_10_05);
  });

  it('returns feature history newest-first and handles an unknown mint', () => {
    const repository = openMemoryRepo();
    const first = generateFeatureVector(
      featureInputs({
        market: sampleSnapshot({ collectedAt: T_09_30 }),
        previousMarket: null,
        risk: sampleRisk({ scannedAt: T_09_00 }),
        asOf: T_09_30,
      }),
      { generatedAt: T_09_30 },
    );
    const second = sampleVector({ previousMarket: previousSnapshot() });
    repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot({ collectedAt: T_09_30 }),
      riskReport: sampleRisk({ scannedAt: T_09_00 }),
      featureVector: first,
    });
    repository.recordFeatureBundle({
      marketSnapshot: sampleSnapshot(),
      riskReport: sampleRisk(),
      featureVector: second,
    });

    const history = repository.getFeatureHistory(WRAPPED_SOL_MINT, 1);
    expect(history?.vectors).toHaveLength(1);
    expect(history?.vectors[0]?.asOf).toBe(T_10_00);
    expect(repository.getFeatureHistory(WRAPPED_SOL_MINT, 20)?.vectors).toHaveLength(2);
    expect(repository.getFeatureHistory(USDC_MINT, 20)).toBeNull();
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(FEATURE_GENERATED_AT).toBe(T_10_00);
  });
});
