import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import type { DiscoveryConfig } from '../src/config/types.js';
import { TradingSafetyError } from '../src/core/index.js';
import { prepareDiscoveryCommand } from '../src/discovery/command.js';
import { interleaveMints } from '../src/discovery/dedupe.js';
import { formatDiscoveryCheckLines } from '../src/discovery/format.js';
import type { DiscoveryFeedProvider } from '../src/discovery/provider.js';
import { DiscoveryError, runDiscovery, type SourceRecord } from '../src/discovery/index.js';
import type { MarketSnapshot } from '../src/market-data/types.js';

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const OBSERVED_AT = '2026-08-16T22:00:00.000Z';

function discoveryConfig(overrides: Partial<DiscoveryConfig> = {}): DiscoveryConfig {
  return {
    enabled: true,
    includeProfiles: true,
    includeBoosts: true,
    timeoutMs: 1000,
    pollIntervalMs: 30_000,
    maxCandidates: 20,
    enrichMarketData: false,
    ...overrides,
  };
}

function record(
  source: SourceRecord['source'],
  tokenMint: string,
  overrides: Partial<SourceRecord> = {},
): SourceRecord {
  return {
    source,
    tokenMint,
    dexScreenerUrl: `https://dexscreener.com/solana/${tokenMint}`,
    description: source === 'dexscreener_profile' ? 'Profile metadata' : null,
    links: [],
    profileUpdatedAt: null,
    boostAmount: source === 'dexscreener_boost' ? 5 : null,
    boostTotalAmount: source === 'dexscreener_boost' ? 15 : null,
    ...overrides,
  };
}

function feed(source: SourceRecord['source'], records: SourceRecord[]): DiscoveryFeedProvider {
  return {
    source,
    fetchRecords: () => Promise.resolve(records),
  };
}

function failingFeed(source: SourceRecord['source'], message: string): DiscoveryFeedProvider {
  return {
    source,
    fetchRecords: () => Promise.reject(new Error(message)),
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
    priceUsd: 1.25,
    liquidityUsd: 50_000,
    volume5mUsd: 100,
    volume1hUsd: 200,
    volume24hUsd: 300,
    buys5m: 1,
    sells5m: 2,
    buys1h: 3,
    sells1h: 4,
    priceChange5mPct: 0,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    marketCapUsd: 1000,
    fdvUsd: 2000,
    pairCreatedAt: '2021-01-01T00:00:00.000Z',
    collectedAt: OBSERVED_AT,
  };
}

describe('discovery service', () => {
  it('deduplicates repeated profile records for the same mint', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        feed('dexscreener_profile', [
          record('dexscreener_profile', WRAPPED_SOL_MINT),
          record('dexscreener_profile', WRAPPED_SOL_MINT, { description: 'Second copy' }),
        ]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.tokenMint).toBe(WRAPPED_SOL_MINT);
    expect(result.candidates[0]?.sources).toEqual(['dexscreener_profile']);
  });

  it('deduplicates repeated boost records for the same mint', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        feed('dexscreener_boost', [
          record('dexscreener_boost', USDC_MINT),
          record('dexscreener_boost', USDC_MINT, { boostAmount: 99 }),
        ]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.sources).toEqual(['dexscreener_boost']);
    expect(result.candidates[0]?.boostAmount).toBe(5);
  });

  it('merges the same mint from profile and boost into one candidate', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)]),
        feed('dexscreener_boost', [record('dexscreener_boost', WRAPPED_SOL_MINT)]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.sources).toEqual(['dexscreener_profile', 'dexscreener_boost']);
    expect(result.candidates[0]?.description).toBe('Profile metadata');
    expect(result.candidates[0]?.boostAmount).toBe(5);
  });

  it('does not turn boost metadata into a score or rank', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [feed('dexscreener_boost', [record('dexscreener_boost', USDC_MINT)])],
      now: () => new Date(OBSERVED_AT),
    });
    const candidate = result.candidates[0];
    const output = formatDiscoveryCheckLines(result).join('\n');

    expect(candidate).toBeDefined();
    expect(candidate).not.toHaveProperty('score');
    expect(candidate).not.toHaveProperty('rank');
    expect(candidate).not.toHaveProperty('riskScore');
    expect(candidate).not.toHaveProperty('opportunityScore');
    expect(output).toContain('Boost metadata is promotional provider data, not a quality or buy score.');
  });

  it('sets observedAt to the local collection time', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.observedAt).toBe(OBSERVED_AT);
    expect(result.candidates[0]?.observedAt).toBe(OBSERVED_AT);
  });

  it('keeps observedAt as collection time and does not invent profileUpdatedAt', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      now: () => new Date(OBSERVED_AT),
    });
    const output = formatDiscoveryCheckLines(result).join('\n');

    expect(result.candidates[0]?.profileUpdatedAt).toBeNull();
    expect(result.candidates[0]?.observedAt).toBe(OBSERVED_AT);
    expect(result.observedAt).toBe(OBSERVED_AT);
    expect(output).toContain('Observed at is this cycle’s collection time, not token mint or launch time.');
  });

  it('does not give profile-only candidates boost values', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates[0]?.sources).toEqual(['dexscreener_profile']);
    expect(result.candidates[0]?.boostAmount).toBeNull();
    expect(result.candidates[0]?.boostTotalAmount).toBeNull();
  });

  it('prefers profile metadata when a later boost record overlaps the same mint', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        feed('dexscreener_boost', [
          record('dexscreener_boost', WRAPPED_SOL_MINT, {
            description: 'Boost description should not win',
            dexScreenerUrl: 'https://dexscreener.com/solana/boost-url',
            links: [{ type: 'web', label: 'Boost', url: 'https://boost.example' }],
            boostAmount: 7,
            boostTotalAmount: 21,
          }),
        ]),
        feed('dexscreener_profile', [
          record('dexscreener_profile', WRAPPED_SOL_MINT, {
            description: 'Profile description wins',
            dexScreenerUrl: 'https://dexscreener.com/solana/profile-url',
            links: [{ type: 'web', label: 'Profile', url: 'https://profile.example' }],
          }),
        ]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.sources).toEqual(['dexscreener_profile', 'dexscreener_boost']);
    expect(result.candidates[0]?.description).toBe('Profile description wins');
    expect(result.candidates[0]?.dexScreenerUrl).toBe('https://dexscreener.com/solana/profile-url');
    expect(result.candidates[0]?.links).toEqual([
      { type: 'web', label: 'Profile', url: 'https://profile.example' },
      { type: 'web', label: 'Boost', url: 'https://boost.example' },
    ]);
    expect(result.candidates[0]?.boostAmount).toBe(7);
    expect(result.candidates[0]?.boostTotalAmount).toBe(21);
    expect(result.candidates[0]?.observedAt).toBe(OBSERVED_AT);
  });

  it('keeps first same-source values when duplicate records conflict', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        feed('dexscreener_profile', [
          record('dexscreener_profile', WRAPPED_SOL_MINT, { description: 'First profile' }),
          record('dexscreener_profile', WRAPPED_SOL_MINT, { description: 'Second profile' }),
        ]),
        feed('dexscreener_boost', [
          record('dexscreener_boost', WRAPPED_SOL_MINT, { boostAmount: 3, boostTotalAmount: 9 }),
          record('dexscreener_boost', WRAPPED_SOL_MINT, { boostAmount: 99, boostTotalAmount: 99 }),
        ]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.description).toBe('First profile');
    expect(result.candidates[0]?.boostAmount).toBe(3);
    expect(result.candidates[0]?.boostTotalAmount).toBe(9);
  });

  it('does not invent a token launch timestamp on merged candidates', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates[0]).not.toHaveProperty('launchTime');
    expect(result.candidates[0]).not.toHaveProperty('tokenCreatedAt');
    expect(result.candidates[0]).not.toHaveProperty('mintCreatedAt');
  });

  it('applies the candidate cap with deterministic interleaving', async () => {
    const result = await runDiscovery({
      config: discoveryConfig({ maxCandidates: 3 }),
      feeds: [
        feed('dexscreener_profile', [
          record('dexscreener_profile', WRAPPED_SOL_MINT),
          record('dexscreener_profile', BONK_MINT),
        ]),
        feed('dexscreener_boost', [
          record('dexscreener_boost', USDC_MINT),
          record('dexscreener_boost', USDT_MINT),
        ]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(interleaveMints([[WRAPPED_SOL_MINT, BONK_MINT], [USDC_MINT, USDT_MINT]], 3)).toEqual([
      WRAPPED_SOL_MINT,
      USDC_MINT,
      BONK_MINT,
    ]);
    expect(result.candidates.map((candidate) => candidate.tokenMint)).toEqual([
      WRAPPED_SOL_MINT,
      USDC_MINT,
      BONK_MINT,
    ]);
  });

  it('does not present the candidate cap as a quality ranking', async () => {
    const result = await runDiscovery({
      config: discoveryConfig({ maxCandidates: 1 }),
      feeds: [
        feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)]),
        feed('dexscreener_boost', [record('dexscreener_boost', USDC_MINT)]),
      ],
      now: () => new Date(OBSERVED_AT),
    });
    const output = formatDiscoveryCheckLines(result).join('\n');

    expect(result.candidates).toHaveLength(1);
    expect(output).toContain('Candidate cap is an operational limit, not a quality ranking.');
    expect(output.toLowerCase()).not.toMatch(/\bbest\b/);
    expect(output.toLowerCase()).not.toContain('top pick');
    expect(output.toLowerCase()).not.toContain('recommended');
    expect(output.toLowerCase()).not.toMatch(/\bsafe\b/);
  });

  it('attaches a MarketSnapshot when enrichment succeeds', async () => {
    const market = snapshot(WRAPPED_SOL_MINT);
    const result = await runDiscovery({
      config: discoveryConfig({ enrichMarketData: true }),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      marketData: {
        getSnapshot: (tokenMint) => Promise.resolve(snapshot(tokenMint)),
      },
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates[0]?.marketDataStatus).toBe('available');
    expect(result.candidates[0]?.marketSnapshot).toEqual(market);
  });

  it('keeps the candidate when market enrichment fails', async () => {
    const result = await runDiscovery({
      config: discoveryConfig({ enrichMarketData: true }),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      marketData: {
        getSnapshot: () => Promise.reject(new Error('no usable pair')),
      },
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.marketSnapshot).toBeNull();
    expect(result.candidates[0]?.marketDataStatus).toBe('unavailable');
  });

  it('treats an invalid root payload as a failed source, not an empty success', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        {
          source: 'dexscreener_profile',
          fetchRecords: () => {
            throw new DiscoveryError('Discovery provider returned an unexpected response.');
          },
        },
        feed('dexscreener_boost', [record('dexscreener_boost', USDC_MINT)]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.sourceResults[0]).toEqual({
      source: 'dexscreener_profile',
      ok: false,
      recordCount: 0,
      error: 'Discovery provider returned an unexpected response.',
    });
    expect(result.sourceResults[1]?.ok).toBe(true);
    expect(result.candidates).toHaveLength(1);
  });

  it('does not mark a discovery source failed when only market enrichment fails', async () => {
    const result = await runDiscovery({
      config: discoveryConfig({ enrichMarketData: true }),
      feeds: [feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)])],
      marketData: {
        getSnapshot: () => Promise.reject(new Error('no usable pair')),
      },
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.sourceResults).toEqual([
      { source: 'dexscreener_profile', ok: true, recordCount: 1, error: null },
    ]);
    expect(result.candidates[0]?.marketDataStatus).toBe('unavailable');
  });

  it('keeps profile candidates when boosts fail', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        feed('dexscreener_profile', [record('dexscreener_profile', WRAPPED_SOL_MINT)]),
        failingFeed('dexscreener_boost', 'boosts down'),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.sourceResults).toEqual([
      { source: 'dexscreener_profile', ok: true, recordCount: 1, error: null },
      { source: 'dexscreener_boost', ok: false, recordCount: 0, error: 'boosts down' },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.tokenMint).toBe(WRAPPED_SOL_MINT);
  });

  it('keeps boost candidates when profiles fail', async () => {
    const result = await runDiscovery({
      config: discoveryConfig(),
      feeds: [
        failingFeed('dexscreener_profile', 'profiles down'),
        feed('dexscreener_boost', [record('dexscreener_boost', USDC_MINT)]),
      ],
      now: () => new Date(OBSERVED_AT),
    });

    expect(result.sourceResults).toEqual([
      { source: 'dexscreener_profile', ok: false, recordCount: 0, error: 'profiles down' },
      { source: 'dexscreener_boost', ok: true, recordCount: 1, error: null },
    ]);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.tokenMint).toBe(USDC_MINT);
  });

  it('fails the discovery run when every enabled source fails', async () => {
    await expect(
      runDiscovery({
        config: discoveryConfig(),
        feeds: [
          failingFeed('dexscreener_profile', 'profiles down'),
          failingFeed('dexscreener_boost', 'boosts down'),
        ],
        now: () => new Date(OBSERVED_AT),
      }),
    ).rejects.toBeInstanceOf(DiscoveryError);
  });

  it('rejects TRADING_ENABLED=true before discovery runs', () => {
    expect(() => {
      prepareDiscoveryCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
  });
});
