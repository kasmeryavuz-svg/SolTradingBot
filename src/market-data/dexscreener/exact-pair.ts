import { MarketDataError } from '../types.js';
import { parseFiniteNumber } from './normalize.js';
import type { DexScreenerPair } from './types.js';

export const OPENING_PAIR_UNAVAILABLE_MESSAGE =
  'Opening pair is unavailable. Exit evaluation requires the exact opening pair and does not fall back to another pair.';
export const OPENING_PAIR_QUOTE_SIDE_MESSAGE =
  'Opening pair does not have the requested token as the base token. Quote-side prices are not inverted for exit evaluation.';
export const OPENING_PAIR_DUPLICATE_MESSAGE =
  'DEX Screener returned conflicting duplicate records for the exact opening pair.';
export const OPENING_PAIR_WRONG_CHAIN_MESSAGE =
  'Opening pair is not a Solana pair. Exit evaluation does not use another chain or pair.';
export const OPENING_PAIR_INVALID_PRICE_MESSAGE =
  'Opening pair observed price is invalid. Exit evaluation requires a missing, zero, or finite non-negative USD price.';

export function parseExactOpeningPairObservedPrice(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return null;
  }

  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    throw new MarketDataError(OPENING_PAIR_INVALID_PRICE_MESSAGE);
  }
  return parsed;
}

export function selectExactOpeningPair(
  pairs: readonly DexScreenerPair[],
  tokenMint: string,
  pairAddress: string,
): DexScreenerPair {
  const addressMatches = pairs.filter((pair) => pair.pairAddress === pairAddress);
  if (addressMatches.length === 0) {
    throw new MarketDataError(OPENING_PAIR_UNAVAILABLE_MESSAGE);
  }

  const solanaMatches = addressMatches.filter((pair) => pair.chainId.toLowerCase() === 'solana');
  if (solanaMatches.length === 0) {
    throw new MarketDataError(OPENING_PAIR_WRONG_CHAIN_MESSAGE);
  }

  const baseMatches = solanaMatches.filter((pair) => pair.baseToken.address === tokenMint);
  if (baseMatches.length === 0) {
    const quoteMatches = solanaMatches.filter((pair) => pair.quoteToken?.address === tokenMint);
    if (quoteMatches.length > 0) {
      throw new MarketDataError(OPENING_PAIR_QUOTE_SIDE_MESSAGE);
    }
    throw new MarketDataError(OPENING_PAIR_UNAVAILABLE_MESSAGE);
  }

  if (baseMatches.length > 1) {
    throw new MarketDataError(OPENING_PAIR_DUPLICATE_MESSAGE);
  }

  const selected = baseMatches[0];
  if (selected === undefined) {
    throw new MarketDataError(OPENING_PAIR_UNAVAILABLE_MESSAGE);
  }
  return selected;
}
