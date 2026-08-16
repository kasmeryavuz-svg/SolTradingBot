export type DexScreenerToken = {
  address: string;
  name: string | null;
  symbol: string | null;
};

export type DexScreenerPair = {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: DexScreenerToken;
  quoteToken: DexScreenerToken | null;
  priceUsd: unknown;
  liquidityUsd: unknown;
  volume5mUsd: unknown;
  volume1hUsd: unknown;
  volume24hUsd: unknown;
  buys5m: unknown;
  sells5m: unknown;
  buys1h: unknown;
  sells1h: unknown;
  priceChange5mPct: unknown;
  priceChange1hPct: unknown;
  priceChange24hPct: unknown;
  marketCapUsd: unknown;
  fdvUsd: unknown;
  pairCreatedAt: unknown;
};
