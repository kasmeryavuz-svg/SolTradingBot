import { createDexScreenerBoostFeed, createDexScreenerProfileFeed } from '../discovery/dexscreener/index.js';
import type { DiscoveryFeedProvider } from '../discovery/provider.js';
import { DiscoveryError, type SourceRecord } from '../discovery/types.js';
import {
  createDexScreenerExactPairProvider,
  createDexScreenerProvider,
} from '../market-data/dexscreener/index.js';
import type { ExactPairMarketDataProvider, MarketDataProvider } from '../market-data/provider.js';
import { MarketDataError, type MarketSnapshot } from '../market-data/types.js';
import { RW0_NETWORK_TIMEOUT_MS } from './constants.js';
import { RecoveryWatcherError } from './errors.js';
import { sanitizeRecoveryErrorMessage } from './sanitizer.js';
import type { RecoveryClock } from './types.js';

export type RecoveryFetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type RecoveryProviderSet = {
  profileFeed: DiscoveryFeedProvider;
  boostFeed: DiscoveryFeedProvider;
  screeningMarket: MarketDataProvider;
  exactPairMarket: ExactPairMarketDataProvider;
};

export function createRecoveryProviderSet(options: {
  timeoutMs?: number;
  fetchImpl?: RecoveryFetchLike;
  clock?: RecoveryClock;
}): RecoveryProviderSet {
  const timeoutMs = options.timeoutMs ?? RW0_NETWORK_TIMEOUT_MS;
  const now = options.clock?.now;
  const fetchImpl = options.fetchImpl;
  return {
    profileFeed: createDexScreenerProfileFeed({
      timeoutMs,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    }),
    boostFeed: createDexScreenerBoostFeed({
      timeoutMs,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
    }),
    screeningMarket: createDexScreenerProvider({
      timeoutMs,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
      ...(now === undefined ? {} : { now }),
    }),
    exactPairMarket: createDexScreenerExactPairProvider({
      timeoutMs,
      ...(fetchImpl === undefined ? {} : { fetchImpl }),
      ...(now === undefined ? {} : { now }),
    }),
  };
}

export function isRecoverableProviderFailure(error: unknown): boolean {
  if (error instanceof MarketDataError) {
    return true;
  }
  if (error instanceof DiscoveryError) {
    return true;
  }
  if (error instanceof RecoveryWatcherError && error.code === 'provider_unavailable') {
    return true;
  }
  return false;
}

export async function fetchDiscoveryRecords(feed: DiscoveryFeedProvider): Promise<{
  ok: boolean;
  records: SourceRecord[];
  error: string | null;
}> {
  try {
    const records = await feed.fetchRecords();
    return { ok: true, records, error: null };
  } catch (error: unknown) {
    if (!isRecoverableProviderFailure(error)) {
      throw error;
    }
    return {
      ok: false,
      records: [],
      error: sanitizeRecoveryErrorMessage(error),
    };
  }
}

export async function fetchScreeningSnapshot(
  provider: MarketDataProvider,
  mint: string,
): Promise<{ ok: true; snapshot: MarketSnapshot } | { ok: false; error: string }> {
  try {
    return { ok: true, snapshot: await provider.getSnapshot(mint) };
  } catch (error: unknown) {
    if (!isRecoverableProviderFailure(error)) {
      throw error;
    }
    return { ok: false, error: sanitizeRecoveryErrorMessage(error) };
  }
}

export async function fetchExactPairSnapshot(
  provider: ExactPairMarketDataProvider,
  mint: string,
  pairAddress: string,
): Promise<{ ok: true; snapshot: MarketSnapshot } | { ok: false; error: string }> {
  try {
    return { ok: true, snapshot: await provider.getSnapshotForPair(mint, pairAddress) };
  } catch (error: unknown) {
    if (!isRecoverableProviderFailure(error)) {
      throw error;
    }
    return { ok: false, error: sanitizeRecoveryErrorMessage(error) };
  }
}
