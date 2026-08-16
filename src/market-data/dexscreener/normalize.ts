import { MarketDataError, type MarketSnapshot } from '../types.js';
import type { DexScreenerPair, DexScreenerToken } from './types.js';

export function parseDexScreenerPairs(payload: unknown): DexScreenerPair[] {
  if (!Array.isArray(payload)) {
    throw new MarketDataError('Market data provider returned an unexpected response.');
  }

  const pairs: DexScreenerPair[] = [];
  for (const item of payload) {
    const pair = parseDexScreenerPair(item);
    if (pair !== null) {
      pairs.push(pair);
    }
  }

  return pairs;
}

export function parseFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

export function parseNonNegativeNumber(value: unknown): number | null {
  const parsed = parseFiniteNumber(value);
  if (parsed === null || parsed < 0) {
    return null;
  }

  return parsed;
}

export function parsePairCreatedAt(value: unknown): string | null {
  const timestamp = parseFiniteNumber(value);
  if (timestamp === null || timestamp <= 0) {
    return null;
  }

  const milliseconds = timestamp >= 1e12 ? timestamp : timestamp >= 1e9 ? timestamp * 1000 : null;
  if (milliseconds === null) {
    return null;
  }

  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

export function normalizeDexScreenerPair(
  pair: DexScreenerPair,
  tokenMint: string,
  collectedAt: string,
): MarketSnapshot {
  const token = tokenSide(pair, tokenMint);
  const other = otherSide(pair, tokenMint);
  const tokenIsBase = pair.baseToken.address === tokenMint;

  // DEX Screener priceUsd, marketCap, fdv, and priceChange describe the base token.
  // If the requested mint is only the quote, never copy those base-token values.
  return {
    chain: 'solana',
    tokenMint,
    tokenName: token?.name ?? null,
    tokenSymbol: token?.symbol ?? null,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    quoteTokenMint: other?.address ?? null,
    quoteTokenSymbol: other?.symbol ?? null,
    priceUsd: tokenIsBase ? parseFiniteNumber(pair.priceUsd) : null,
    liquidityUsd: parseNonNegativeNumber(pair.liquidityUsd),
    volume5mUsd: parseNonNegativeNumber(pair.volume5mUsd),
    volume1hUsd: parseNonNegativeNumber(pair.volume1hUsd),
    volume24hUsd: parseNonNegativeNumber(pair.volume24hUsd),
    buys5m: parseNonNegativeNumber(pair.buys5m),
    sells5m: parseNonNegativeNumber(pair.sells5m),
    buys1h: parseNonNegativeNumber(pair.buys1h),
    sells1h: parseNonNegativeNumber(pair.sells1h),
    priceChange5mPct: tokenIsBase ? parseFiniteNumber(pair.priceChange5mPct) : null,
    priceChange1hPct: tokenIsBase ? parseFiniteNumber(pair.priceChange1hPct) : null,
    priceChange24hPct: tokenIsBase ? parseFiniteNumber(pair.priceChange24hPct) : null,
    marketCapUsd: tokenIsBase ? parseNonNegativeNumber(pair.marketCapUsd) : null,
    fdvUsd: tokenIsBase ? parseNonNegativeNumber(pair.fdvUsd) : null,
    pairCreatedAt: parsePairCreatedAt(pair.pairCreatedAt),
    collectedAt,
  };
}

function parseDexScreenerPair(value: unknown): DexScreenerPair | null {
  if (!isRecord(value)) {
    return null;
  }

  const chainId = readNonEmptyString(value['chainId']);
  const dexId = readNonEmptyString(value['dexId']);
  const pairAddress = readNonEmptyString(value['pairAddress']);
  const baseToken = parseToken(value['baseToken']);

  if (chainId === null || dexId === null || pairAddress === null || baseToken === null) {
    return null;
  }

  const liquidity = isRecord(value['liquidity']) ? value['liquidity'] : null;
  const volume = isRecord(value['volume']) ? value['volume'] : null;
  const txns = isRecord(value['txns']) ? value['txns'] : null;
  const priceChange = isRecord(value['priceChange']) ? value['priceChange'] : null;
  const txns5m = txns !== null && isRecord(txns['m5']) ? txns['m5'] : null;
  const txns1h = txns !== null && isRecord(txns['h1']) ? txns['h1'] : null;

  return {
    chainId,
    dexId,
    pairAddress,
    baseToken,
    quoteToken: parseToken(value['quoteToken']),
    priceUsd: value['priceUsd'],
    liquidityUsd: liquidity?.['usd'],
    volume5mUsd: volume?.['m5'],
    volume1hUsd: volume?.['h1'],
    volume24hUsd: volume?.['h24'],
    buys5m: txns5m?.['buys'],
    sells5m: txns5m?.['sells'],
    buys1h: txns1h?.['buys'],
    sells1h: txns1h?.['sells'],
    priceChange5mPct: priceChange?.['m5'],
    priceChange1hPct: priceChange?.['h1'],
    priceChange24hPct: priceChange?.['h24'],
    marketCapUsd: value['marketCap'],
    fdvUsd: value['fdv'],
    pairCreatedAt: value['pairCreatedAt'],
  };
}

function parseToken(value: unknown): DexScreenerToken | null {
  if (!isRecord(value)) {
    return null;
  }

  const address = readNonEmptyString(value['address']);
  if (address === null) {
    return null;
  }

  return {
    address,
    name: readNonEmptyString(value['name']),
    symbol: readNonEmptyString(value['symbol']),
  };
}

function tokenSide(pair: DexScreenerPair, tokenMint: string): DexScreenerToken | null {
  if (pair.baseToken.address === tokenMint) {
    return pair.baseToken;
  }
  if (pair.quoteToken?.address === tokenMint) {
    return pair.quoteToken;
  }
  return null;
}

function otherSide(pair: DexScreenerPair, tokenMint: string): DexScreenerToken | null {
  if (pair.baseToken.address === tokenMint) {
    return pair.quoteToken;
  }
  if (pair.quoteToken?.address === tokenMint) {
    return pair.baseToken;
  }
  return null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
