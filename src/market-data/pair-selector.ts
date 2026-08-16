import { MarketDataError } from './types.js';

export const NO_USABLE_BASE_PAIR_MESSAGE =
  'No usable Solana pair was found where the requested token is the base token. Quote-only pairs are ignored because DEX price, market cap, and FDV describe the base token.';

export type PairSelectionInput = {
  chainId: string;
  baseTokenMint: string;
  quoteTokenMint: string | null;
  priceUsd: number | null;
  liquidityUsd: number | null;
};

export function selectBestPair<T extends PairSelectionInput>(
  pairs: readonly T[],
  tokenMint: string,
): T {
  const candidates = pairs.filter(
    (pair) =>
      isSolanaPair(pair) &&
      isRequestedTokenBase(pair, tokenMint) &&
      hasValidUsdPrice(pair.priceUsd),
  );

  if (candidates.length === 0) {
    throw new MarketDataError(NO_USABLE_BASE_PAIR_MESSAGE);
  }

  const ranked = [...candidates].sort((left, right) => comparePairs(left, right));
  const selected = ranked[0];

  if (selected === undefined || !isRequestedTokenBase(selected, tokenMint)) {
    throw new MarketDataError(NO_USABLE_BASE_PAIR_MESSAGE);
  }

  return selected;
}

export function isSolanaPair(pair: PairSelectionInput): boolean {
  return pair.chainId.toLowerCase() === 'solana';
}

export function pairContainsMint(pair: PairSelectionInput, tokenMint: string): boolean {
  return pair.baseTokenMint === tokenMint || pair.quoteTokenMint === tokenMint;
}

export function isRequestedTokenBase(pair: PairSelectionInput, tokenMint: string): boolean {
  return pair.baseTokenMint === tokenMint;
}

export function hasValidUsdPrice(priceUsd: number | null): boolean {
  return priceUsd !== null && Number.isFinite(priceUsd) && priceUsd > 0;
}

export function hasPositiveLiquidity(liquidityUsd: number | null): boolean {
  return liquidityUsd !== null && Number.isFinite(liquidityUsd) && liquidityUsd > 0;
}

function comparePairs(left: PairSelectionInput, right: PairSelectionInput): number {
  const liquidityFlag =
    Number(hasPositiveLiquidity(right.liquidityUsd)) - Number(hasPositiveLiquidity(left.liquidityUsd));
  if (liquidityFlag !== 0) {
    return liquidityFlag;
  }

  return (right.liquidityUsd ?? 0) - (left.liquidityUsd ?? 0);
}
