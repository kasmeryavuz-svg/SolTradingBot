import { selectBestPair, type PairSelectionInput } from '../pair-selector.js';
import type { ExactPairMarketDataProvider, MarketDataProvider } from '../provider.js';
import type { MarketSnapshot } from '../types.js';
import { createDexScreenerClient, type FetchLike } from './client.js';
import { parseExactOpeningPairObservedPrice, selectExactOpeningPair } from './exact-pair.js';
import { normalizeDexScreenerPair, parseDexScreenerPairs, parseFiniteNumber, parseNonNegativeNumber } from './normalize.js';
import type { DexScreenerPair } from './types.js';

export { createDexScreenerClient, DEXSCREENER_BASE_URL } from './client.js';
export {
  normalizeDexScreenerPair,
  parseDexScreenerPairs,
  parseFiniteNumber,
  parseNonNegativeNumber,
  parsePairCreatedAt,
} from './normalize.js';
export type { DexScreenerPair } from './types.js';

type SelectableDexPair = PairSelectionInput & { pair: DexScreenerPair };

export function snapshotFromDexScreenerPayload(
  payload: unknown,
  tokenMint: string,
  collectedAt: string,
): MarketSnapshot {
  const selected = selectBestPair(parseDexScreenerPairs(payload).map(toSelectablePair), tokenMint);
  return normalizeDexScreenerPair(selected.pair, tokenMint, collectedAt);
}

export function snapshotFromDexScreenerExactPair(
  payload: unknown,
  tokenMint: string,
  pairAddress: string,
  collectedAt: string,
): MarketSnapshot {
  const selected = selectExactOpeningPair(parseDexScreenerPairs(payload), tokenMint, pairAddress);
  const snapshot = normalizeDexScreenerPair(selected, tokenMint, collectedAt);
  return {
    ...snapshot,
    priceUsd: parseExactOpeningPairObservedPrice(selected.priceUsd),
  };
}

export function createDexScreenerProvider(options: {
  timeoutMs: number;
  fetchImpl?: FetchLike;
  now?: () => Date;
}): MarketDataProvider {
  const client = createDexScreenerClient(options);
  const now = options.now ?? (() => new Date());

  return {
    getSnapshot: async (tokenMint) => {
      const payload = await client.fetchTokenPairs(tokenMint);
      return snapshotFromDexScreenerPayload(payload, tokenMint, now().toISOString());
    },
  };
}

export function createDexScreenerExactPairProvider(options: {
  timeoutMs: number;
  fetchImpl?: FetchLike;
  now?: () => Date;
}): ExactPairMarketDataProvider {
  const client = createDexScreenerClient(options);
  const now = options.now ?? (() => new Date());

  return {
    getSnapshotForPair: async (tokenMint, pairAddress) => {
      const payload = await client.fetchTokenPairs(tokenMint);
      return snapshotFromDexScreenerExactPair(payload, tokenMint, pairAddress, now().toISOString());
    },
  };
}

function toSelectablePair(pair: DexScreenerPair): SelectableDexPair {
  return {
    chainId: pair.chainId,
    baseTokenMint: pair.baseToken.address,
    quoteTokenMint: pair.quoteToken?.address ?? null,
    priceUsd: parseFiniteNumber(pair.priceUsd),
    liquidityUsd: parseNonNegativeNumber(pair.liquidityUsd),
    pair,
  };
}
