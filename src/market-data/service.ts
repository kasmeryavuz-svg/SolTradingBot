import type { MarketDataConfig } from '../config/types.js';
import { createDexScreenerProvider } from './dexscreener/index.js';
import type { MarketDataProvider } from './provider.js';
import type { MarketSnapshot } from './types.js';

export async function collectWatchlistSnapshots(
  provider: MarketDataProvider,
  tokenMints: readonly string[],
): Promise<MarketSnapshot[]> {
  const snapshots: MarketSnapshot[] = [];

  for (const tokenMint of tokenMints) {
    snapshots.push(await provider.getSnapshot(tokenMint));
  }

  return snapshots;
}

export function createDefaultMarketDataProvider(config: MarketDataConfig): MarketDataProvider {
  return createDexScreenerProvider({ timeoutMs: config.timeoutMs });
}
