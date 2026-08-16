import type { DiscoveryConfig } from '../config/types.js';
import type { MarketDataProvider } from '../market-data/provider.js';
import { createDefaultMarketDataProvider } from '../market-data/service.js';
import { interleaveMints, mergeSourceRecords, uniqueMintsInOrder } from './dedupe.js';
import { createDexScreenerBoostFeed, createDexScreenerProfileFeed } from './dexscreener/index.js';
import type { DiscoveryFeedProvider } from './provider.js';
import {
  DiscoveryError,
  type DiscoveryCandidate,
  type DiscoveryRunResult,
  type DiscoverySourceResult,
  type SourceRecord,
} from './types.js';

export async function runDiscovery(options: {
  config: DiscoveryConfig;
  feeds: readonly DiscoveryFeedProvider[];
  marketData?: MarketDataProvider;
  now?: () => Date;
}): Promise<DiscoveryRunResult> {
  if (options.feeds.length === 0) {
    throw new DiscoveryError('No discovery sources are enabled.');
  }

  const observedAt = (options.now ?? (() => new Date()))().toISOString();
  const sourceResults: DiscoverySourceResult[] = [];
  const successfulRecords: SourceRecord[][] = [];

  for (const feed of options.feeds) {
    try {
      const records = await feed.fetchRecords();
      successfulRecords.push(records);
      sourceResults.push({
        source: feed.source,
        ok: true,
        recordCount: records.length,
        error: null,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      successfulRecords.push([]);
      sourceResults.push({
        source: feed.source,
        ok: false,
        recordCount: 0,
        error: message,
      });
    }
  }

  if (sourceResults.every((result) => !result.ok)) {
    throw new DiscoveryError(
      `All enabled discovery sources failed. ${sourceResults
        .map((result) => `${result.source}: ${result.error ?? 'unknown error'}`)
        .join(' ')}`,
    );
  }

  const merged = mergeSourceRecords(successfulRecords.flat(), observedAt);
  const byMint = new Map(merged.map((candidate) => [candidate.tokenMint, candidate]));
  // Cap is operational/rate-limit control only. Interleaving keeps one source
  // from permanently starving the other. This is not a quality ranking.
  const selectedMints = interleaveMints(
    successfulRecords.map((records) => uniqueMintsInOrder(records)),
    options.config.maxCandidates,
  );

  const candidates: DiscoveryCandidate[] = [];
  for (const tokenMint of selectedMints) {
    const candidate = byMint.get(tokenMint);
    if (candidate !== undefined) {
      candidates.push(candidate);
    }
  }

  if (options.config.enrichMarketData && options.marketData !== undefined) {
    await enrichCandidates(candidates, options.marketData);
  }

  return {
    candidates,
    sourceResults,
    observedAt,
  };
}

export function createDefaultDiscoveryFeeds(config: DiscoveryConfig): DiscoveryFeedProvider[] {
  const feeds: DiscoveryFeedProvider[] = [];
  if (config.includeProfiles) {
    feeds.push(createDexScreenerProfileFeed({ timeoutMs: config.timeoutMs }));
  }
  if (config.includeBoosts) {
    feeds.push(createDexScreenerBoostFeed({ timeoutMs: config.timeoutMs }));
  }
  return feeds;
}

export function createDefaultDiscoveryMarketProvider(
  timeoutMs: number,
): MarketDataProvider {
  return createDefaultMarketDataProvider({
    tokenMints: [],
    timeoutMs,
    pollIntervalMs: timeoutMs,
  });
}

async function enrichCandidates(
  candidates: DiscoveryCandidate[],
  marketData: MarketDataProvider,
): Promise<void> {
  for (const candidate of candidates) {
    try {
      candidate.marketSnapshot = await marketData.getSnapshot(candidate.tokenMint);
      candidate.marketDataStatus = 'available';
    } catch {
      candidate.marketSnapshot = null;
      candidate.marketDataStatus = 'unavailable';
    }
  }
}
