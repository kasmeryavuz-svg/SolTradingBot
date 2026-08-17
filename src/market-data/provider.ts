import type { MarketSnapshot } from './types.js';

export type MarketDataProvider = {
  getSnapshot(tokenMint: string): Promise<MarketSnapshot>;
};

export type ExactPairMarketDataProvider = {
  getSnapshotForPair(tokenMint: string, pairAddress: string): Promise<MarketSnapshot>;
};
