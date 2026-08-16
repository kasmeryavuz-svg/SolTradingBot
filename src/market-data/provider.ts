import type { MarketSnapshot } from './types.js';

export type MarketDataProvider = {
  getSnapshot(tokenMint: string): Promise<MarketSnapshot>;
};
