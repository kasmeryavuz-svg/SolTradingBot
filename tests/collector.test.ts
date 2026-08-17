import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import type { DiscoveryConfig } from '../src/config/types.js';
import { TradingSafetyError } from '../src/core/index.js';
import { DiscoveryError } from '../src/discovery/types.js';
import type { DiscoveryFeedProvider } from '../src/discovery/provider.js';
import type { SourceRecord } from '../src/discovery/types.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import { prepareCollectorCommand } from '../src/collector/command.js';
import { runCollectorCycle } from '../src/collector/service.js';
import { watchCollector } from '../src/collector/watch-loop.js';
import {
  createSqlitePersistenceRepository,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
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

function discoveryConfig(): DiscoveryConfig {
  return {
    enabled: true,
    includeProfiles: true,
    includeBoosts: true,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    maxCandidates: 20,
    enrichMarketData: true,
  };
}

function record(source: SourceRecord['source'], tokenMint: string): SourceRecord {
  return {
    source,
    tokenMint,
    dexScreenerUrl: null,
    description: source === 'dexscreener_profile' ? 'Profile metadata' : null,
    links: [],
    profileUpdatedAt: null,
    boostAmount: source === 'dexscreener_boost' ? 5 : null,
    boostTotalAmount: source === 'dexscreener_boost' ? 15 : null,
  };
}

function snapshot(tokenMint: string): MarketSnapshot {
  return {
    chain: 'solana',
    tokenMint,
    tokenName: 'Test',
    tokenSymbol: 'TEST',
    dexId: 'raydium',
    pairAddress: 'pair-test',
    quoteTokenMint: USDC_MINT,
    quoteTokenSymbol: 'USDC',
    priceUsd: 1,
    liquidityUsd: 100,
    volume5mUsd: 1,
    volume1hUsd: 2,
    volume24hUsd: 3,
    buys5m: 1,
    sells5m: 1,
    buys1h: 1,
    sells1h: 1,
    priceChange5mPct: 0,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    marketCapUsd: 10,
    fdvUsd: 20,
    pairCreatedAt: '2021-01-01T00:00:00.000Z',
    collectedAt: '2026-08-17T10:00:00.000Z',
  };
}

describe('collector', () => {
  it('persists a successful discovery cycle with actual write counts', async () => {
    const repository = openMemoryRepo();
    const cycle = await runCollectorCycle({
      config: discoveryConfig(),
      feeds: [
        {
          source: 'dexscreener_profile',
          fetchRecords: () => Promise.resolve([record('dexscreener_profile', WRAPPED_SOL_MINT)]),
        },
        {
          source: 'dexscreener_boost',
          fetchRecords: () => Promise.resolve([record('dexscreener_boost', WRAPPED_SOL_MINT)]),
        },
      ],
      repository,
      marketData: {
        getSnapshot: (tokenMint) => Promise.resolve(snapshot(tokenMint)),
      },
      now: () => new Date('2026-08-17T10:00:00.000Z'),
    });

    expect(cycle.recorded.candidateCount).toBe(1);
    expect(cycle.recorded.tokensInserted).toBe(1);
    expect(cycle.recorded.tokensUpdated).toBe(0);
    expect(cycle.recorded.observationsWritten).toBe(1);
    expect(cycle.recorded.snapshotsWritten).toBe(1);
    expect(cycle.discovery.candidates[0]?.observedAt).toBe('2026-08-17T10:00:00.000Z');
    expect(cycle.discovery.candidates[0]?.profileUpdatedAt).toBeNull();
  });

  it('persists a partial source failure and does not invent a run when every source fails', async () => {
    const repository = openMemoryRepo();
    const partial = await runCollectorCycle({
      config: discoveryConfig(),
      feeds: [
        {
          source: 'dexscreener_profile',
          fetchRecords: () => Promise.resolve([record('dexscreener_profile', WRAPPED_SOL_MINT)]),
        },
        {
          source: 'dexscreener_boost',
          fetchRecords: () => Promise.reject(new Error('boosts down')),
        },
      ],
      repository,
      now: () => new Date('2026-08-17T10:00:00.000Z'),
    });

    expect(partial.discovery.sourceResults[0]?.ok).toBe(true);
    expect(partial.discovery.sourceResults[1]?.ok).toBe(false);
    expect(repository.getSourceResultsForRun(partial.recorded.runId)[1]?.ok).toBe(false);

    await expect(
      runCollectorCycle({
        config: discoveryConfig(),
        feeds: [
          {
            source: 'dexscreener_profile',
            fetchRecords: () => Promise.reject(new Error('profiles down')),
          },
          {
            source: 'dexscreener_boost',
            fetchRecords: () => Promise.reject(new Error('boosts down')),
          },
        ],
        repository,
      }),
    ).rejects.toBeInstanceOf(DiscoveryError);

    expect(repository.getStats().discoveryRunCount).toBe(1);
  });

  it('persists a candidate when market enrichment fails', async () => {
    const repository = openMemoryRepo();
    const cycle = await runCollectorCycle({
      config: discoveryConfig(),
      feeds: [
        {
          source: 'dexscreener_profile',
          fetchRecords: () => Promise.resolve([record('dexscreener_profile', BONK_MINT)]),
        },
      ],
      repository,
      marketData: {
        getSnapshot: () => Promise.reject(new Error('no usable pair')),
      },
      now: () => new Date('2026-08-17T10:00:00.000Z'),
    });

    expect(cycle.recorded.observationsWritten).toBe(1);
    expect(cycle.recorded.snapshotsWritten).toBe(0);
    expect(cycle.discovery.candidates[0]?.marketDataStatus).toBe('unavailable');
    expect(repository.getStats().marketSnapshotCount).toBe(0);
  });

  it('does not count a skipped exact-duplicate snapshot as a write', async () => {
    const repository = openMemoryRepo();
    const feeds: DiscoveryFeedProvider[] = [
      {
        source: 'dexscreener_profile',
        fetchRecords: () => Promise.resolve([record('dexscreener_profile', WRAPPED_SOL_MINT)]),
      },
    ];
    const marketData = {
      getSnapshot: (tokenMint: string) => Promise.resolve(snapshot(tokenMint)),
    };

    const first = await runCollectorCycle({
      config: discoveryConfig(),
      feeds,
      repository,
      marketData,
      now: () => new Date('2026-08-17T10:00:00.000Z'),
    });
    const second = await runCollectorCycle({
      config: discoveryConfig(),
      feeds,
      repository,
      marketData,
      now: () => new Date('2026-08-17T10:30:00.000Z'),
    });

    expect(first.recorded.snapshotsWritten).toBe(1);
    expect(second.recorded.tokensUpdated).toBe(1);
    expect(second.recorded.observationsWritten).toBe(1);
    expect(second.recorded.snapshotsWritten).toBe(0);
    expect(repository.getStats().marketSnapshotCount).toBe(1);
  });

  it('does not automatically run the risk scanner', () => {
    const files = [
      'src/collector/service.ts',
      'src/collector/once.ts',
      'src/collector/watch.ts',
      'src/collector/watch-loop.ts',
    ];

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(
        /scanTokenRisk|recordRiskReport|createSolanaRiskDataProvider|generateFeatureVector|recordFeatureBundle/,
      );
    }
  });

  it('rejects collector commands when trading is enabled or persistence is disabled', () => {
    expect(() => {
      prepareCollectorCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);

    expect(() => {
      prepareCollectorCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(/Persistence is disabled/);
  });

  it('stops the collector watch loop on abort', async () => {
    const repository = openMemoryRepo();
    const controller = new AbortController();
    const lines: string[] = [];
    let cycles = 0;
    const feed: DiscoveryFeedProvider = {
      source: 'dexscreener_profile',
      fetchRecords: () => {
        cycles += 1;
        return Promise.resolve([record('dexscreener_profile', WRAPPED_SOL_MINT)]);
      },
    };

    await watchCollector({
      config: discoveryConfig(),
      feeds: [feed],
      repository,
      intervalMs: 10,
      signal: controller.signal,
      write: (line) => {
        lines.push(line);
        if (line.includes('Checkpoint: 12.5') && cycles >= 2) {
          controller.abort();
        }
      },
      now: () => new Date('2026-08-17T10:00:00.000Z'),
    });

    expect(cycles).toBeGreaterThanOrEqual(2);
    expect(repository.getStats().discoveryRunCount).toBeGreaterThanOrEqual(2);
    expect(lines.some((line) => line.includes('LOCAL PERSISTENCE'))).toBe(true);
  });
});
