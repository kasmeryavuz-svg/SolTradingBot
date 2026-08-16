export class MarketDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MarketDataError';
  }
}

export type MarketSnapshot = {
  chain: 'solana';
  /** Requested token mint. The snapshot describes this token, not necessarily the pair's quote. */
  tokenMint: string;
  /** Name of the requested token only. */
  tokenName: string | null;
  /** Symbol of the requested token only. */
  tokenSymbol: string | null;
  dexId: string;
  pairAddress: string;
  /** The other asset in the selected pair. */
  quoteTokenMint: string | null;
  quoteTokenSymbol: string | null;
  /** USD price of the requested token. Never the opposite side's price. */
  priceUsd: number | null;
  /** Pair-level USD liquidity, not a token valuation. */
  liquidityUsd: number | null;
  /** Pair-level USD volume. */
  volume5mUsd: number | null;
  volume1hUsd: number | null;
  volume24hUsd: number | null;
  /** Pair-level trade counts. */
  buys5m: number | null;
  sells5m: number | null;
  buys1h: number | null;
  sells1h: number | null;
  /** Price change of the requested token. */
  priceChange5mPct: number | null;
  priceChange1hPct: number | null;
  priceChange24hPct: number | null;
  /** Market cap of the requested token. Never copied from FDV. */
  marketCapUsd: number | null;
  /** Fully diluted valuation of the requested token. Never used as market cap. */
  fdvUsd: number | null;
  pairCreatedAt: string | null;
  collectedAt: string;
};
