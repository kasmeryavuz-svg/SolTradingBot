import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import type { DiscoveryRunResult, DiscoverySource } from '../src/discovery/types.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import { formatStatusLines } from '../src/persistence/format.js';
import { preparePersistenceCommand } from '../src/persistence/command.js';
import { clampHistoryLimit } from '../src/persistence/limits.js';
import {
  applyMigrations,
  interpretIntegrityPragmas,
  openSqliteDatabase,
} from '../src/persistence/sqlite/index.js';
import {
  INITIAL_MIGRATION_NAME,
  INITIAL_MIGRATION_VERSION,
  LATEST_SCHEMA_VERSION,
  FEATURE_MIGRATION_NAME,
  FEATURE_MIGRATION_VERSION,
  RISK_MIGRATION_NAME,
  RISK_MIGRATION_VERSION,
} from '../src/persistence/sqlite/migrations.js';
import {
  createSqlitePersistenceRepository,
  PersistenceError,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const TIME_A = '2026-08-17T10:00:00.000Z';
const TIME_B = '2026-08-17T10:30:00.000Z';
const TIME_C = '2026-08-17T11:00:00.000Z';
const TIME_EARLY = '2026-08-17T09:00:00.000Z';
const TIME_LATE = '2026-08-17T12:00:00.000Z';

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

function snapshot(tokenMint: string, overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    chain: 'solana',
    tokenMint,
    tokenName: 'Test',
    tokenSymbol: 'TEST',
    dexId: 'raydium',
    pairAddress: `pair-${tokenMint.slice(0, 8)}`,
    quoteTokenMint: USDC_MINT,
    quoteTokenSymbol: 'USDC',
    priceUsd: 0.001,
    liquidityUsd: 1000,
    volume5mUsd: 10,
    volume1hUsd: 20,
    volume24hUsd: 30,
    buys5m: 1,
    sells5m: 2,
    buys1h: 3,
    sells1h: 4,
    priceChange5mPct: 0.1,
    priceChange1hPct: 0.2,
    priceChange24hPct: 0.3,
    marketCapUsd: 5000,
    fdvUsd: 9000,
    pairCreatedAt: '2021-01-01T00:00:00.000Z',
    collectedAt: TIME_A,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<DiscoveryRunResult['candidates'][number]> = {},
): DiscoveryRunResult['candidates'][number] {
  return {
    chain: 'solana',
    tokenMint: WRAPPED_SOL_MINT,
    sources: ['dexscreener_profile', 'dexscreener_boost'],
    dexScreenerUrl: 'https://dexscreener.com/solana/sol',
    description: 'Profile metadata',
    links: [
      { type: 'website', label: 'Site', url: 'https://example.com' },
      { type: 'twitter', label: 'X', url: 'https://x.com/example' },
    ],
    profileUpdatedAt: null,
    boostAmount: 10,
    boostTotalAmount: 40,
    observedAt: TIME_A,
    marketSnapshot: snapshot(WRAPPED_SOL_MINT),
    marketDataStatus: 'available',
    ...overrides,
  };
}

function runResult(overrides: Partial<DiscoveryRunResult> = {}): DiscoveryRunResult {
  return {
    observedAt: TIME_A,
    sourceResults: [
      { source: 'dexscreener_profile', ok: true, recordCount: 1, error: null },
      { source: 'dexscreener_boost', ok: true, recordCount: 1, error: null },
    ],
    candidates: [candidate()],
    ...overrides,
  };
}

describe('SQLite persistence', () => {
  it('initializes and records the latest schema version once', () => {
    const repository = openMemoryRepo();
    const first = repository.getStats();
    repository.initialize();
    const second = repository.getStats();

    expect(first.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(second.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(INITIAL_MIGRATION_NAME).toBe('001_initial_persistence');
    expect(INITIAL_MIGRATION_VERSION).toBe(1);
    expect(RISK_MIGRATION_NAME).toBe('002_token_risk_scans');
    expect(RISK_MIGRATION_VERSION).toBe(2);
    expect(FEATURE_MIGRATION_NAME).toBe('003_feature_vectors');
    expect(FEATURE_MIGRATION_VERSION).toBe(3);
    expect(first.foreignKeysEnabled).toBe(true);
    expect(first.integrity.ok).toBe(true);
    expect(first.riskScanCount).toBe(0);
    expect(first.featureVectorCount).toBe(0);
    expect(repository.getTableCounts().schemaMigrations).toBe(3);
  });

  it('inserts one token row and updates observation bounds', () => {
    const repository = openMemoryRepo();
    repository.recordDiscoveryRun(runResult());

    const token = repository.getToken(WRAPPED_SOL_MINT);
    expect(token).not.toBeNull();
    expect(token?.firstObservedAt).toBe(TIME_A);
    expect(token?.lastObservedAt).toBe(TIME_A);
    expect(repository.getStats().tokenCount).toBe(1);
  });

  it('does not create a second token row for a duplicate mint', () => {
    const repository = openMemoryRepo();
    repository.recordDiscoveryRun(runResult());
    repository.recordDiscoveryRun(runResult({
      observedAt: TIME_B,
      candidates: [
        candidate({
          observedAt: TIME_B,
          marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_B, priceUsd: 0.002 }),
        }),
      ],
    }));

    expect(repository.getStats().tokenCount).toBe(1);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(TIME_B);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(TIME_A);
  });

  it('moves first and last observed times from out-of-order writes', () => {
    const repository = openMemoryRepo();
    repository.recordDiscoveryRun(runResult({
      observedAt: TIME_C,
      candidates: [candidate({ observedAt: TIME_C, marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_C }) })],
    }));
    repository.recordDiscoveryRun(runResult({
      observedAt: TIME_EARLY,
      candidates: [candidate({ observedAt: TIME_EARLY, marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_EARLY }) })],
    }));

    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(TIME_EARLY);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(TIME_C);

    repository.recordDiscoveryRun(runResult({
      observedAt: TIME_LATE,
      candidates: [candidate({ observedAt: TIME_LATE, marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_LATE }) })],
    }));

    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(TIME_EARLY);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(TIME_LATE);
  });

  it('persists discovery runs, source health, observations, tags, and links', () => {
    const repository = openMemoryRepo();
    const recorded = repository.recordDiscoveryRun(runResult());
    const observations = repository.getRecentDiscoveryObservations(20);
    const sources = repository.getSourceResultsForRun(recorded.runId);

    expect(recorded.candidateCount).toBe(1);
    expect(recorded.observationsWritten).toBe(1);
    expect(recorded.snapshotsWritten).toBe(1);
    expect(sources).toEqual([
      { source: 'dexscreener_profile', ok: true, recordCount: 1, error: null },
      { source: 'dexscreener_boost', ok: true, recordCount: 1, error: null },
    ]);
    expect(observations).toHaveLength(1);
    expect(observations[0]?.sources).toEqual(['dexscreener_profile', 'dexscreener_boost']);
    expect(observations[0]?.profileUpdatedAt).toBeNull();
    expect(observations[0]?.boostAmount).toBe(10);
    expect(observations[0]?.boostTotalAmount).toBe(40);
    expect(observations[0]?.description).toBe('Profile metadata');
  });

  it('persists a failed source without inventing a successful empty feed', () => {
    const repository = openMemoryRepo();
    const recorded = repository.recordDiscoveryRun(runResult({
      sourceResults: [
        { source: 'dexscreener_profile', ok: true, recordCount: 1, error: null },
        { source: 'dexscreener_boost', ok: false, recordCount: 0, error: 'boosts down' },
      ],
    }));

    expect(repository.getSourceResultsForRun(recorded.runId)).toEqual([
      { source: 'dexscreener_profile', ok: true, recordCount: 1, error: null },
      { source: 'dexscreener_boost', ok: false, recordCount: 0, error: 'boosts down' },
    ]);
  });

  it('keeps profile-only boost values null and unavailable market data snapshot-free', () => {
    const repository = openMemoryRepo();
    repository.recordDiscoveryRun(runResult({
      sourceResults: [{ source: 'dexscreener_profile', ok: true, recordCount: 1, error: null }],
      candidates: [candidate({
        sources: ['dexscreener_profile'],
        boostAmount: null,
        boostTotalAmount: null,
        marketSnapshot: null,
        marketDataStatus: 'unavailable',
      })],
    }));

    const observation = repository.getRecentDiscoveryObservations(1)[0];
    expect(observation?.boostAmount).toBeNull();
    expect(observation?.boostTotalAmount).toBeNull();
    expect(observation?.marketDataStatus).toBe('unavailable');
    expect(repository.getStats().marketSnapshotCount).toBe(0);
  });

  it('preserves nullable MarketSnapshot fields, market cap, FDV, and pairCreatedAt', () => {
    const repository = openMemoryRepo();
    const empty = snapshot(WRAPPED_SOL_MINT, {
      tokenName: null,
      tokenSymbol: null,
      quoteTokenMint: null,
      quoteTokenSymbol: null,
      priceUsd: null,
      liquidityUsd: null,
      volume5mUsd: null,
      volume1hUsd: null,
      volume24hUsd: null,
      buys5m: null,
      sells5m: null,
      buys1h: null,
      sells1h: null,
      priceChange5mPct: null,
      priceChange1hPct: null,
      priceChange24hPct: null,
      marketCapUsd: null,
      fdvUsd: 12_000,
      pairCreatedAt: '2024-02-02T00:00:00.000Z',
      collectedAt: TIME_B,
    });
    repository.recordMarketSnapshots([empty]);
    const history = repository.getMarketHistory(WRAPPED_SOL_MINT, 20);

    expect(history?.snapshots[0]?.priceUsd).toBeNull();
    expect(history?.snapshots[0]?.marketCapUsd).toBeNull();
    expect(history?.snapshots[0]?.fdvUsd).toBe(12_000);
    expect(history?.snapshots[0]?.pairCreatedAt).toBe('2024-02-02T00:00:00.000Z');
    expect(history?.snapshots[0]?.collectedAt).toBe(TIME_B);
  });

  it('does not duplicate an exact snapshot and does persist a later one', () => {
    const repository = openMemoryRepo();
    const first = snapshot(WRAPPED_SOL_MINT, { priceUsd: 0.001, collectedAt: TIME_A });
    const later = snapshot(WRAPPED_SOL_MINT, { priceUsd: 0.002, collectedAt: TIME_B });

    expect(repository.recordMarketSnapshots([first])).toBe(1);
    expect(repository.recordMarketSnapshots([first])).toBe(0);
    expect(repository.recordMarketSnapshots([later])).toBe(1);

    const history = repository.getMarketHistory(WRAPPED_SOL_MINT, 20);
    expect(history?.snapshots.map((item) => item.collectedAt)).toEqual([TIME_B, TIME_A]);
    expect(history?.snapshots[0]?.priceUsd).toBe(0.002);
  });

  it('stores three historical observations for one token without computing returns', () => {
    const repository = openMemoryRepo();
    for (const [observedAt, priceUsd] of [
      [TIME_A, 0.001],
      [TIME_B, 0.002],
      [TIME_C, 0.0015],
    ] as const) {
      repository.recordDiscoveryRun(runResult({
        observedAt,
        candidates: [candidate({
          observedAt,
          marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: observedAt, priceUsd }),
        })],
      }));
    }

    const token = repository.getToken(WRAPPED_SOL_MINT);
    const history = repository.getMarketHistory(WRAPPED_SOL_MINT, 20);
    expect(repository.getStats().tokenCount).toBe(1);
    expect(repository.getStats().discoveryRunCount).toBe(3);
    expect(repository.getStats().discoveryObservationCount).toBe(3);
    expect(token?.firstObservedAt).toBe(TIME_A);
    expect(token?.lastObservedAt).toBe(TIME_C);
    expect(history?.snapshots).toHaveLength(3);
    expect(history?.snapshots.map((item) => item.priceUsd)).toEqual([0.0015, 0.002, 0.001]);
  });

  it('survives close and reopen on a file-backed database', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-persist-'));
    const path = join(directory, 'history.sqlite');
    const first = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      first.initialize();
      first.recordDiscoveryRun(runResult());
      first.close();

      const second = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        second.initialize();
        expect(second.getToken(WRAPPED_SOL_MINT)?.mint).toBe(WRAPPED_SOL_MINT);
        expect(second.getStats().discoveryRunCount).toBe(1);
        expect(second.getStats().integrity.ok).toBe(true);
      } finally {
        second.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rolls back a failed discovery-run transaction atomically', () => {
    const repository = openMemoryRepo();
    expect(() => {
      repository.recordDiscoveryRunAndAbort(runResult());
    }).toThrow(PersistenceError);

    const stats = repository.getStats();
    expect(stats.discoveryRunCount).toBe(0);
    expect(stats.discoveryObservationCount).toBe(0);
    expect(stats.marketSnapshotCount).toBe(0);
    expect(stats.tokenCount).toBe(0);
    expect(repository.getRecentDiscoveryObservations(20)).toEqual([]);
  });

  it('persists SQL-looking provider text without breaking the schema', () => {
    const repository = openMemoryRepo();
    const payload = "Robert'); DROP TABLE tokens;--";
    repository.recordDiscoveryRun(runResult({
      candidates: [candidate({
        description: payload,
      })],
    }));

    expect(repository.getRecentDiscoveryObservations(1)[0]?.description).toBe(payload);
    expect(repository.getToken(WRAPPED_SOL_MINT)).not.toBeNull();
    expect(repository.getStats().tokenCount).toBe(1);
  });

  it('returns no history for an unknown mint and bounds history queries', () => {
    const repository = openMemoryRepo();
    expect(repository.getMarketHistory(BONK_MINT, 20)).toBeNull();
    expect(clampHistoryLimit(0)).toBe(20);
    expect(clampHistoryLimit(1000)).toBe(100);
    expect(clampHistoryLimit(7)).toBe(7);
  });

  it('rejects persistent commands when the database is disabled or trading is enabled', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-disabled-db-'));
    const path = join(directory, 'should-not-exist.sqlite');

    try {
      expect(() => {
        preparePersistenceCommand({ DATABASE_ENABLED: 'false', DATABASE_PATH: path });
      }).toThrow(/Persistence is disabled/);
      expect(existsSync(path)).toBe(false);

      expect(() => {
        preparePersistenceCommand({ TRADING_ENABLED: 'true' });
      }).toThrow(TradingSafetyError);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps source tags unique even if a candidate repeats a source', () => {
    const repository = openMemoryRepo();
    const repeated: DiscoverySource[] = ['dexscreener_profile', 'dexscreener_profile'];
    repository.recordDiscoveryRun(runResult({
      candidates: [candidate({
        sources: repeated,
        boostAmount: null,
        boostTotalAmount: null,
      })],
    }));

    expect(repository.getRecentDiscoveryObservations(1)[0]?.sources).toEqual(['dexscreener_profile']);
  });
});

describe('persistence integrity', () => {
  it('uses an exact snapshot conflict target instead of INSERT OR IGNORE', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/persistence/sqlite/repository.ts'),
      'utf8',
    );

    expect(source).not.toMatch(/INSERT OR IGNORE/i);
    expect(source).not.toMatch(/INSERT OR REPLACE/i);
    expect(source).not.toMatch(/REPLACE INTO/i);
    expect(source).toMatch(/ON CONFLICT\(token_id, pair_address, collected_at\) DO NOTHING/);
  });

  it('skips only an exact snapshot duplicate and still throws on CHECK failures', () => {
    const repository = openMemoryRepo();
    const first = repository.recordDiscoveryRun(runResult());
    expect(first.snapshotsWritten).toBe(1);

    const duplicate = repository.recordDiscoveryRun(runResult({
      observedAt: TIME_B,
      candidates: [candidate({
        observedAt: TIME_B,
        marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_A, priceUsd: 99 }),
      })],
    }));
    expect(duplicate.snapshotsWritten).toBe(0);
    expect(repository.getMarketHistory(WRAPPED_SOL_MINT, 20)?.snapshots).toHaveLength(1);
    expect(repository.getMarketHistory(WRAPPED_SOL_MINT, 20)?.snapshots[0]?.priceUsd).toBe(0.001);

    const before = repository.getTableCounts();
    expect(() => {
      repository.recordDiscoveryRun(runResult({
        observedAt: TIME_C,
        candidates: [
          candidate({
            tokenMint: USDC_MINT,
            observedAt: TIME_C,
            marketSnapshot: {
              ...snapshot(USDC_MINT, { collectedAt: TIME_C }),
              chain: 'ethereum' as MarketSnapshot['chain'],
            },
          }),
        ],
      }));
    }).toThrow(PersistenceError);
    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getToken(USDC_MINT)).toBeNull();

    expect(() => {
      repository.recordDiscoveryRun(runResult({
        observedAt: TIME_C,
        candidates: [candidate({
          tokenMint: USDC_MINT,
          observedAt: TIME_C,
          marketSnapshot: snapshot(USDC_MINT, {
            collectedAt: TIME_C,
            pairAddress: null as unknown as string,
          }),
        })],
      }));
    }).toThrow(PersistenceError);
    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getToken(USDC_MINT)).toBeNull();
  });

  it('rolls back every table and an existing token timestamp after a mid-run failure', () => {
    const repository = openMemoryRepo();
    repository.recordDiscoveryRun(runResult());
    const before = repository.getTableCounts();
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(TIME_A);

    expect(() => {
      repository.recordDiscoveryRunAndAbort(runResult({
        observedAt: TIME_LATE,
        candidates: [candidate({
          observedAt: TIME_LATE,
          marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_LATE, priceUsd: 0.009 }),
        })],
      }));
    }).toThrow(/Test-forced write failure/);

    expect(repository.getTableCounts()).toEqual(before);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(TIME_A);
    expect(repository.getToken(WRAPPED_SOL_MINT)?.firstObservedAt).toBe(TIME_A);
    expect(repository.getMarketHistory(WRAPPED_SOL_MINT, 20)?.snapshots).toHaveLength(1);
  });

  it('keeps snapshot identity token-specific and does not retarget a skipped duplicate', () => {
    const repository = openMemoryRepo();
    const sharedPair = 'shared-pair';
    const first = repository.recordDiscoveryRun(runResult({
      candidates: [candidate({
        marketSnapshot: snapshot(WRAPPED_SOL_MINT, { pairAddress: sharedPair, collectedAt: TIME_A }),
      })],
    }));
    const original = repository.getSnapshotOwnership(WRAPPED_SOL_MINT);
    const originalObservationId = original[0]?.discoveryObservationId;
    expect(original).toHaveLength(1);
    expect(original[0]?.collectedAt).toBe(TIME_A);
    expect(originalObservationId).toEqual(expect.any(Number));

    const skipped = repository.recordDiscoveryRun(runResult({
      observedAt: TIME_B,
      candidates: [candidate({
        observedAt: TIME_B,
        marketSnapshot: snapshot(WRAPPED_SOL_MINT, {
          pairAddress: sharedPair,
          collectedAt: TIME_A,
          priceUsd: 7,
        }),
      })],
    }));
    expect(skipped.snapshotsWritten).toBe(0);
    expect(skipped.observationsWritten).toBe(1);
    expect(repository.getSnapshotOwnership(WRAPPED_SOL_MINT)).toEqual([
      { collectedAt: TIME_A, discoveryObservationId: originalObservationId },
    ]);
    expect(repository.getMarketHistory(WRAPPED_SOL_MINT, 20)?.snapshots[0]?.priceUsd).toBe(0.001);

    const later = repository.recordDiscoveryRun(runResult({
      observedAt: TIME_C,
      candidates: [candidate({
        observedAt: TIME_C,
        marketSnapshot: snapshot(WRAPPED_SOL_MINT, { pairAddress: sharedPair, collectedAt: TIME_C }),
      })],
    }));
    expect(later.snapshotsWritten).toBe(1);

    const otherMint = repository.recordDiscoveryRun(runResult({
      observedAt: TIME_A,
      candidates: [candidate({
        tokenMint: USDC_MINT,
        observedAt: TIME_A,
        marketSnapshot: snapshot(USDC_MINT, { pairAddress: sharedPair, collectedAt: TIME_A }),
      })],
    }));
    expect(otherMint.snapshotsWritten).toBe(1);
    expect(repository.getMarketHistory(WRAPPED_SOL_MINT, 20)?.snapshots).toHaveLength(2);
    expect(repository.getMarketHistory(USDC_MINT, 20)?.snapshots).toHaveLength(1);
    expect(first.snapshotsWritten).toBe(1);
  });

  it('stores finite zero and null, and rolls back NaN or Infinity', () => {
    const repository = openMemoryRepo();
    repository.recordDiscoveryRun(runResult({
      candidates: [candidate({
        boostAmount: 0,
        boostTotalAmount: 0,
        marketSnapshot: snapshot(WRAPPED_SOL_MINT, { priceUsd: 0, liquidityUsd: null }),
      })],
    }));

    const stored = repository.getRecentDiscoveryObservations(1)[0];
    const history = repository.getMarketHistory(WRAPPED_SOL_MINT, 1)?.snapshots[0];
    expect(stored?.boostAmount).toBe(0);
    expect(stored?.boostTotalAmount).toBe(0);
    expect(history?.priceUsd).toBe(0);
    expect(history?.liquidityUsd).toBeNull();

    const before = repository.getTableCounts();
    for (const priceUsd of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => {
        repository.recordDiscoveryRun(runResult({
          observedAt: TIME_B,
          candidates: [candidate({
            observedAt: TIME_B,
            marketSnapshot: snapshot(WRAPPED_SOL_MINT, { collectedAt: TIME_B, priceUsd }),
          })],
        }));
      }).toThrow(PersistenceError);
      expect(repository.getTableCounts()).toEqual(before);
      expect(repository.getToken(WRAPPED_SOL_MINT)?.lastObservedAt).toBe(TIME_A);
    }
  });

  it('enforces chain, source, market_data_status, and boolean CHECKs in SQLite', () => {
    const database = openSqliteDatabase({ path: ':memory:', busyTimeoutMs: 1000 });
    applyMigrations(database);
    database.prepare(
      `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
       VALUES ('solana', ?, ?, ?, ?)`,
    ).run(WRAPPED_SOL_MINT, TIME_A, TIME_A, TIME_A);
    database.prepare(
      'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, 1)',
    ).run(TIME_A, TIME_A);

    expect(() => {
      database.prepare(
        `INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at)
         VALUES ('ethereum', ?, ?, ?, ?)`,
      ).run(USDC_MINT, TIME_A, TIME_A, TIME_A);
    }).toThrow(/CHECK|constraint/i);

    expect(() => {
      database.prepare(
        `INSERT INTO discovery_source_results (run_id, source, ok, record_count, error)
         VALUES (1, 'dexscreener_profile', 2, 0, NULL)`,
      ).run();
    }).toThrow(/CHECK|constraint/i);

    expect(() => {
      database.prepare(
        `INSERT INTO discovery_source_results (run_id, source, ok, record_count, error)
         VALUES (1, 'birdeye', 1, 0, NULL)`,
      ).run();
    }).toThrow(/CHECK|constraint/i);

    expect(() => {
      database.prepare(
        `INSERT INTO discovery_observations (
          run_id, token_id, observed_at, dex_screener_url, description, profile_updated_at,
          boost_amount, boost_total_amount, market_data_status
        ) VALUES (1, 1, ?, NULL, NULL, NULL, NULL, NULL, 'maybe')`,
      ).run(TIME_A);
    }).toThrow(/CHECK|constraint/i);

    database.prepare(
      `INSERT INTO discovery_source_results (run_id, source, ok, record_count, error)
       VALUES (1, 'dexscreener_boost', 0, 0, 'down')`,
    ).run();
    database.prepare(
      `INSERT INTO discovery_observations (
        run_id, token_id, observed_at, dex_screener_url, description, profile_updated_at,
        boost_amount, boost_total_amount, market_data_status
      ) VALUES (1, 1, ?, NULL, NULL, NULL, NULL, NULL, 'not_requested')`,
    ).run(TIME_A);

    const ok = database.prepare('SELECT ok FROM discovery_source_results WHERE source = ?').get(
      'dexscreener_boost',
    );
    const status = database.prepare('SELECT market_data_status FROM discovery_observations').get();
    expect(ok?.['ok']).toBe(0);
    expect(status?.['market_data_status']).toBe('not_requested');
    database.close();
  });

  it('rolls schema changes and the migration row back together', () => {
    const database = openSqliteDatabase({ path: ':memory:', busyTimeoutMs: 1000 });
    database.exec('CREATE VIEW tokens AS SELECT 1 AS x');

    expect(() => {
      applyMigrations(database);
    }).toThrow(PersistenceError);

    const migrationCount = database.prepare('SELECT COUNT(*) AS count FROM schema_migrations').get();
    const tokens = database.prepare(
      "SELECT type FROM sqlite_master WHERE name = 'tokens'",
    ).get();
    const runs = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'discovery_runs'",
    ).get();
    expect(migrationCount?.['count']).toBe(0);
    expect(tokens?.['type']).toBe('view');
    expect(runs).toBeUndefined();
    database.close();
  });

  it('treats a failed quick_check or foreign_key_check as integrity failure', () => {
    expect(interpretIntegrityPragmas('ok', 0)).toEqual({ ok: true, detail: 'ok' });
    expect(interpretIntegrityPragmas('*** in database ***', 0).ok).toBe(false);
    expect(interpretIntegrityPragmas('ok', 1).ok).toBe(false);

    const directory = mkdtempSync(join(tmpdir(), 'mtb-integrity-'));
    const path = join(directory, 'broken.sqlite');
    const first = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });

    try {
      first.initialize();
      first.close();

      const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
      database.exec('PRAGMA foreign_keys = OFF');
      database.prepare(
        `INSERT INTO market_snapshots (token_id, chain, dex_id, pair_address, collected_at)
         VALUES (999, 'solana', 'raydium', 'orphan-pair', ?)`,
      ).run(TIME_A);
      database.close();

      const second = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      try {
        second.initialize();
        const integrity = second.verifyIntegrity();
        expect(integrity.ok).toBe(false);
        expect(
          formatStatusLines(path, second.getStats()).some((line) => line.includes('Integrity status: FAILED')),
        ).toBe(true);
      } finally {
        second.close();
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
