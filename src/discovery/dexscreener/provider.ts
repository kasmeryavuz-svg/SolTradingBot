import type { DiscoveryFeedProvider } from '../provider.js';
import { createDexScreenerDiscoveryClient, type FetchLike } from './client.js';
import { parseBoostFeed, parseProfileFeed } from './normalize.js';

export function createDexScreenerProfileFeed(options: {
  timeoutMs: number;
  fetchImpl?: FetchLike;
}): DiscoveryFeedProvider {
  const client = createDexScreenerDiscoveryClient(options);
  return {
    source: 'dexscreener_profile',
    fetchRecords: async () => parseProfileFeed(await client.fetchLatestProfiles()),
  };
}

export function createDexScreenerBoostFeed(options: {
  timeoutMs: number;
  fetchImpl?: FetchLike;
}): DiscoveryFeedProvider {
  const client = createDexScreenerDiscoveryClient(options);
  return {
    source: 'dexscreener_boost',
    fetchRecords: async () => parseBoostFeed(await client.fetchLatestBoosts()),
  };
}
