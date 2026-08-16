import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import type { DiscoveryConfig } from '../src/config/types.js';
import { createFirstSeenTracker } from '../src/discovery/first-seen.js';
import type { DiscoveryFeedProvider } from '../src/discovery/provider.js';
import type { SourceRecord } from '../src/discovery/types.js';
import { watchDiscovery } from '../src/discovery/watch-loop.js';

const BONK_MINT = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

function discoveryConfig(): DiscoveryConfig {
  return {
    enabled: true,
    includeProfiles: true,
    includeBoosts: false,
    timeoutMs: 1000,
    pollIntervalMs: 10,
    maxCandidates: 20,
    enrichMarketData: false,
  };
}

function record(tokenMint: string): SourceRecord {
  return {
    source: 'dexscreener_profile',
    tokenMint,
    dexScreenerUrl: null,
    description: null,
    links: [],
    profileUpdatedAt: null,
    boostAmount: null,
    boostTotalAmount: null,
  };
}

describe('discovery first-seen tracking', () => {
  it('marks every mint first-seen on the first remember call', () => {
    const tracker = createFirstSeenTracker();

    expect(tracker.remember([WRAPPED_SOL_MINT, USDC_MINT])).toEqual([WRAPPED_SOL_MINT, USDC_MINT]);
  });

  it('does not mark a repeated mint as first-seen again', () => {
    const tracker = createFirstSeenTracker();
    tracker.remember([WRAPPED_SOL_MINT]);

    expect(tracker.remember([WRAPPED_SOL_MINT])).toEqual([]);
    expect(tracker.has(WRAPPED_SOL_MINT)).toBe(true);
  });

  it('marks a later new mint as first-seen', () => {
    const tracker = createFirstSeenTracker();
    tracker.remember([WRAPPED_SOL_MINT]);

    expect(tracker.remember([WRAPPED_SOL_MINT, USDC_MINT])).toEqual([USDC_MINT]);
  });

  it('marks A and B new, then neither, then only C', () => {
    const tracker = createFirstSeenTracker();

    expect(tracker.remember([WRAPPED_SOL_MINT, USDC_MINT])).toEqual([WRAPPED_SOL_MINT, USDC_MINT]);
    expect(tracker.remember([WRAPPED_SOL_MINT, USDC_MINT])).toEqual([]);
    expect(tracker.remember([WRAPPED_SOL_MINT, USDC_MINT, BONK_MINT])).toEqual([BONK_MINT]);
  });
});

describe('discovery watch loop', () => {
  it('labels first-seen mints only once per process across three cycles', async () => {
    const lines: string[] = [];
    const controller = new AbortController();
    let cycle = 0;
    const feed: DiscoveryFeedProvider = {
      source: 'dexscreener_profile',
      fetchRecords: () => {
        cycle += 1;
        if (cycle <= 2) {
          return Promise.resolve([record(WRAPPED_SOL_MINT), record(USDC_MINT)]);
        }
        return Promise.resolve([record(WRAPPED_SOL_MINT), record(USDC_MINT), record(BONK_MINT)]);
      },
    };

    await watchDiscovery({
      config: discoveryConfig(),
      feeds: [feed],
      intervalMs: 10,
      signal: controller.signal,
      write: (line) => {
        lines.push(line);
        if (line.includes('Checkpoint: 03')) {
          const checkpoints = lines.filter((item) => item.includes('Checkpoint: 03')).length;
          if (checkpoints >= 3) {
            controller.abort();
          }
        }
      },
      now: () => new Date('2026-08-16T22:00:00.000Z'),
    });

    const newLines = lines.filter((line) => line.includes('NEW to this process'));
    expect(lines.filter((line) => line.startsWith('--- ')).length).toBe(3);
    expect(newLines).toHaveLength(3);
    expect(newLines.some((line) => line.includes('Candidate 1'))).toBe(true);
    expect(newLines.some((line) => line.includes('Candidate 2'))).toBe(true);
    expect(newLines.some((line) => line.includes('Candidate 3'))).toBe(true);
    expect(lines.some((line) => line.includes(BONK_MINT))).toBe(true);
    expect(lines.some((line) => line.includes('new to this running discovery:watch process, not newly minted or launched'))).toBe(
      true,
    );
    expect(lines.join('\n')).not.toMatch(/newly launched token/i);
  });

  it('stops cleanly when the abort signal fires', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      watchDiscovery({
        config: discoveryConfig(),
        feeds: [
          {
            source: 'dexscreener_profile',
            fetchRecords: () => Promise.resolve([record(WRAPPED_SOL_MINT)]),
          },
        ],
        intervalMs: 50,
        signal: controller.signal,
        write: () => {
          throw new Error('watch should not print after abort');
        },
      }),
    ).resolves.toBeUndefined();
  });
});
