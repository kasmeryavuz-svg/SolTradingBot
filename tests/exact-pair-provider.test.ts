import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import {
  createDexScreenerExactPairProvider,
  createDexScreenerProvider,
  snapshotFromDexScreenerExactPair,
  snapshotFromDexScreenerPayload,
} from '../src/market-data/dexscreener/index.js';
import {
  OPENING_PAIR_DUPLICATE_MESSAGE,
  OPENING_PAIR_INVALID_PRICE_MESSAGE,
  OPENING_PAIR_QUOTE_SIDE_MESSAGE,
  OPENING_PAIR_UNAVAILABLE_MESSAGE,
  OPENING_PAIR_WRONG_CHAIN_MESSAGE,
  parseExactOpeningPairObservedPrice,
} from '../src/market-data/dexscreener/exact-pair.js';
import { parseFiniteNumber, parseNonNegativeNumber } from '../src/market-data/dexscreener/normalize.js';
import { MarketDataError } from '../src/market-data/types.js';

const COLLECTED_AT = '2026-08-17T10:00:00.000Z';
const OPENING_PAIR = 'opening-pair-address';
const OTHER_PAIR = 'higher-liquidity-other-pair';

function dexPair(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: OPENING_PAIR,
    baseToken: {
      address: WRAPPED_SOL_MINT,
      name: 'Wrapped SOL',
      symbol: 'SOL',
    },
    quoteToken: {
      address: USDC_MINT,
      name: 'USD Coin',
      symbol: 'USDC',
    },
    priceUsd: '100',
    liquidity: { usd: 1_000_000 },
    volume: { m5: 12_000, h1: 80_000, h24: 900_000 },
    txns: {
      m5: { buys: 11, sells: 7 },
      h1: { buys: 40, sells: 33 },
    },
    priceChange: { m5: 0.5, h1: -1.25, h24: 3.5 },
    marketCap: 80_000_000_000,
    fdv: 90_000_000_000,
    pairCreatedAt: 1_609_459_200_000,
    ...overrides,
  };
}

describe('exact opening-pair DEX provider', () => {
  it('selects the exact opening pair and ignores a higher-liquidity other pair', () => {
    const snapshot = snapshotFromDexScreenerExactPair(
      [
        dexPair({ pairAddress: OTHER_PAIR, liquidity: { usd: 99_000_000 }, priceUsd: '9' }),
        dexPair({ pairAddress: OPENING_PAIR, liquidity: { usd: 10 }, priceUsd: '42' }),
      ],
      WRAPPED_SOL_MINT,
      OPENING_PAIR,
      COLLECTED_AT,
    );
    expect(snapshot.pairAddress).toBe(OPENING_PAIR);
    expect(snapshot.priceUsd).toBe(42);
    expect(snapshot.tokenMint).toBe(WRAPPED_SOL_MINT);
  });

  it('does not fall back to a different pair for the same token', () => {
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [dexPair({ pairAddress: OTHER_PAIR, liquidity: { usd: 99_000_000 } })],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(OPENING_PAIR_UNAVAILABLE_MESSAGE);
  });

  it('rejects quote-side orientation instead of inverting prices', () => {
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [
          dexPair({
            baseToken: { address: USDC_MINT, name: 'USD Coin', symbol: 'USDC' },
            quoteToken: { address: WRAPPED_SOL_MINT, name: 'Wrapped SOL', symbol: 'SOL' },
            priceUsd: '0.005',
          }),
        ],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(OPENING_PAIR_QUOTE_SIDE_MESSAGE);
  });

  it('rejects a matching pair address on the wrong chain', () => {
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [dexPair({ chainId: 'ethereum' })],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(OPENING_PAIR_WRONG_CHAIN_MESSAGE);
  });

  it('throws when the opening pair is missing', () => {
    expect(() => {
      snapshotFromDexScreenerExactPair([], WRAPPED_SOL_MINT, OPENING_PAIR, COLLECTED_AT);
    }).toThrow(MarketDataError);
    expect(() => {
      snapshotFromDexScreenerExactPair([], WRAPPED_SOL_MINT, OPENING_PAIR, COLLECTED_AT);
    }).toThrow(OPENING_PAIR_UNAVAILABLE_MESSAGE);
  });

  it('rejects conflicting duplicate exact pair records', () => {
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [dexPair({ priceUsd: '100' }), dexPair({ priceUsd: '101' })],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(OPENING_PAIR_DUPLICATE_MESSAGE);
  });

  it('rejects duplicate exact pair records even when they are identical', () => {
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [dexPair(), dexPair()],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(OPENING_PAIR_DUPLICATE_MESSAGE);
  });

  it('normalizes an exact base-side pair, including a zero price', () => {
    const snapshot = snapshotFromDexScreenerExactPair(
      [dexPair({ priceUsd: '0' })],
      WRAPPED_SOL_MINT,
      OPENING_PAIR,
      COLLECTED_AT,
    );
    expect(snapshot.priceUsd).toBe(0);
    expect(Object.is(snapshot.priceUsd, 0)).toBe(true);
    expect(snapshot.quoteTokenMint).toBe(USDC_MINT);
    expect(parseExactOpeningPairObservedPrice(0)).toBe(0);
    expect(parseExactOpeningPairObservedPrice('0')).toBe(0);
    expect(parseExactOpeningPairObservedPrice('0.0')).toBe(0);
    expect(parseFiniteNumber(0)).toBe(0);
    expect(parseFiniteNumber('0')).toBe(0);
    expect(parseNonNegativeNumber(0)).toBe(0);
    expect(parseExactOpeningPairObservedPrice(null)).toBeNull();
    expect(parseExactOpeningPairObservedPrice('')).toBeNull();
  });

  it('rejects negative and nonfinite exact-pair prices instead of coercing them to null', () => {
    expect(() => parseExactOpeningPairObservedPrice(-1)).toThrow(OPENING_PAIR_INVALID_PRICE_MESSAGE);
    expect(() => parseExactOpeningPairObservedPrice(Number.NaN)).toThrow(OPENING_PAIR_INVALID_PRICE_MESSAGE);
    expect(() => parseExactOpeningPairObservedPrice(Number.POSITIVE_INFINITY)).toThrow(
      OPENING_PAIR_INVALID_PRICE_MESSAGE,
    );
    expect(() => parseExactOpeningPairObservedPrice(Number.NEGATIVE_INFINITY)).toThrow(
      OPENING_PAIR_INVALID_PRICE_MESSAGE,
    );
    expect(() => parseExactOpeningPairObservedPrice('Infinity')).toThrow(OPENING_PAIR_INVALID_PRICE_MESSAGE);
    expect(() => parseExactOpeningPairObservedPrice('NaN')).toThrow(OPENING_PAIR_INVALID_PRICE_MESSAGE);
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [dexPair({ priceUsd: '-0.01' })],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(OPENING_PAIR_INVALID_PRICE_MESSAGE);
    expect(() => {
      snapshotFromDexScreenerExactPair(
        [dexPair({ priceUsd: 'Infinity' })],
        WRAPPED_SOL_MINT,
        OPENING_PAIR,
        COLLECTED_AT,
      );
    }).toThrow(MarketDataError);
  });

  it('does not use best-pair selection, quote inversion, or truthy price coercion', () => {
    const exactPair = readFileSync(new URL('../src/market-data/dexscreener/exact-pair.ts', import.meta.url), 'utf8');
    const index = readFileSync(new URL('../src/market-data/dexscreener/index.ts', import.meta.url), 'utf8');
    const normalize = readFileSync(new URL('../src/market-data/dexscreener/normalize.ts', import.meta.url), 'utf8');
    const exactFn = index.slice(
      index.indexOf('export function snapshotFromDexScreenerExactPair'),
      index.indexOf('export function createDexScreenerProvider'),
    );
    expect(exactPair).not.toMatch(/selectBestPair|hasValidUsdPrice/);
    expect(exactFn).not.toMatch(/selectBestPair|hasValidUsdPrice/);
    expect(exactFn).toMatch(/selectExactOpeningPair/);
    expect(exactPair).not.toMatch(/priceUsd\s*\|\||if\s*\(!.*price/);
    expect(normalize).not.toMatch(/priceUsd\s*\|\||parseFloat\([^)]*\)\s*\|\|/);
  });

  it('leaves automatic best-pair getSnapshot behavior unchanged', () => {
    const payload = [
      dexPair({ pairAddress: OPENING_PAIR, liquidity: { usd: 10 }, priceUsd: '42' }),
      dexPair({ pairAddress: OTHER_PAIR, liquidity: { usd: 99_000_000 }, priceUsd: '9' }),
    ];
    const best = snapshotFromDexScreenerPayload(payload, WRAPPED_SOL_MINT, COLLECTED_AT);
    const exact = snapshotFromDexScreenerExactPair(payload, WRAPPED_SOL_MINT, OPENING_PAIR, COLLECTED_AT);
    expect(best.pairAddress).toBe(OTHER_PAIR);
    expect(exact.pairAddress).toBe(OPENING_PAIR);
  });

  it('exposes getSnapshotForPair on the exact-pair provider and getSnapshot on the existing provider', async () => {
    const payload = [dexPair()];
    const exact = createDexScreenerExactPairProvider({
      timeoutMs: 1000,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
        }),
      now: () => new Date(COLLECTED_AT),
    });
    const general = createDexScreenerProvider({
      timeoutMs: 1000,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(JSON.stringify(payload)),
        }),
      now: () => new Date(COLLECTED_AT),
    });
    const exactSnapshot = await exact.getSnapshotForPair(WRAPPED_SOL_MINT, OPENING_PAIR);
    const generalSnapshot = await general.getSnapshot(WRAPPED_SOL_MINT);
    expect(exactSnapshot.pairAddress).toBe(OPENING_PAIR);
    expect(generalSnapshot.pairAddress).toBe(OPENING_PAIR);
    expect('getSnapshot' in exact).toBe(false);
  });
});
