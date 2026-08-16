import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { snapshotFromDexScreenerPayload } from '../src/market-data/dexscreener/index.js';
import {
  normalizeDexScreenerPair,
  parseDexScreenerPairs,
} from '../src/market-data/dexscreener/normalize.js';
import { NO_USABLE_BASE_PAIR_MESSAGE, selectBestPair } from '../src/market-data/pair-selector.js';
import { MarketDataError } from '../src/market-data/types.js';

const COLLECTED_AT = '2026-08-16T22:00:00.000Z';
const OTHER_MINT = '11111111111111111111111111111111';

function solUsdcPair(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chainId: 'solana',
    dexId: 'orca',
    pairAddress: 'pair-sol-base',
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
    priceUsd: '180.25',
    liquidity: { usd: 4_500_000 },
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

function usdcQuoteOnlyPair(): Record<string, unknown> {
  return solUsdcPair({
    dexId: 'pumpswap',
    pairAddress: 'pair-usdc-quote-only',
    baseToken: {
      address: OTHER_MINT,
      name: 'Other Token',
      symbol: 'OTHER',
    },
    quoteToken: {
      address: USDC_MINT,
      name: 'USD Coin',
      symbol: 'USDC',
    },
    priceUsd: '12.34',
    liquidity: { usd: 50_000_000 },
    marketCap: 1_111,
    fdv: 2_222,
    priceChange: { m5: 9.9, h1: 8.8, h24: 7.7 },
  });
}

function usdcBasePair(): Record<string, unknown> {
  return {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: 'pair-usdc-base',
    baseToken: {
      address: USDC_MINT,
      name: 'USD Coin',
      symbol: 'USDC',
    },
    quoteToken: {
      address: WRAPPED_SOL_MINT,
      name: 'Wrapped SOL',
      symbol: 'SOL',
    },
    priceUsd: '1.00',
    liquidity: { usd: 3_000_000 },
    volume: { m5: 100, h1: 200, h24: 300 },
    txns: {
      m5: { buys: 2, sells: 3 },
      h1: { buys: 4, sells: 5 },
    },
    priceChange: { m5: 0.01, h1: 0.02, h24: 0.03 },
    marketCap: 70_000_000_000,
    fdv: 71_000_000_000,
    pairCreatedAt: 1_609_459_200_000,
  };
}

describe('token orientation correctness', () => {
  it('keeps the snapshot correct when the requested token is the base token', () => {
    const snapshot = snapshotFromDexScreenerPayload([solUsdcPair()], WRAPPED_SOL_MINT, COLLECTED_AT);

    expect(snapshot.tokenMint).toBe(WRAPPED_SOL_MINT);
    expect(snapshot.tokenName).toBe('Wrapped SOL');
    expect(snapshot.tokenSymbol).toBe('SOL');
    expect(snapshot.quoteTokenMint).toBe(USDC_MINT);
    expect(snapshot.quoteTokenSymbol).toBe('USDC');
    expect(snapshot.priceUsd).toBe(180.25);
    expect(snapshot.marketCapUsd).toBe(80_000_000_000);
    expect(snapshot.fdvUsd).toBe(90_000_000_000);
    expect(snapshot.priceChange5mPct).toBe(0.5);
    expect(snapshot.liquidityUsd).toBe(4_500_000);
    expect(snapshot.volume5mUsd).toBe(12_000);
  });

  it('does not leak base-token price or metadata when the requested token is the quote token', () => {
    const [pair] = parseDexScreenerPairs([usdcQuoteOnlyPair()]);
    if (pair === undefined) {
      throw new Error('expected a parsed pair');
    }

    const snapshot = normalizeDexScreenerPair(pair, USDC_MINT, COLLECTED_AT);

    expect(snapshot.tokenMint).toBe(USDC_MINT);
    expect(snapshot.tokenName).toBe('USD Coin');
    expect(snapshot.tokenSymbol).toBe('USDC');
    expect(snapshot.tokenName).not.toBe('Other Token');
    expect(snapshot.tokenSymbol).not.toBe('OTHER');
    expect(snapshot.priceUsd).toBeNull();
    expect(snapshot.priceUsd).not.toBe(12.34);
    expect(snapshot.marketCapUsd).toBeNull();
    expect(snapshot.marketCapUsd).not.toBe(1_111);
    expect(snapshot.fdvUsd).toBeNull();
    expect(snapshot.fdvUsd).not.toBe(2_222);
    expect(snapshot.priceChange5mPct).toBeNull();
    expect(snapshot.priceChange1hPct).toBeNull();
    expect(snapshot.priceChange24hPct).toBeNull();
    expect(snapshot.liquidityUsd).toBe(50_000_000);
    expect(snapshot.volume5mUsd).toBe(12_000);
  });

  it('rejects quote-only pairs instead of inventing a requested-token price', () => {
    expect(() => {
      snapshotFromDexScreenerPayload([usdcQuoteOnlyPair()], USDC_MINT, COLLECTED_AT);
    }).toThrow(MarketDataError);

    expect(() => {
      snapshotFromDexScreenerPayload([usdcQuoteOnlyPair()], USDC_MINT, COLLECTED_AT);
    }).toThrow(NO_USABLE_BASE_PAIR_MESSAGE);

    expect(() => {
      selectBestPair(
        [
          {
            chainId: 'solana',
            baseTokenMint: OTHER_MINT,
            quoteTokenMint: USDC_MINT,
            priceUsd: 12.34,
            liquidityUsd: 50_000_000,
          },
        ],
        USDC_MINT,
      );
    }).toThrow(NO_USABLE_BASE_PAIR_MESSAGE);
  });

  it('chooses the base-oriented pair when both orientations exist', () => {
    const snapshot = snapshotFromDexScreenerPayload(
      [usdcQuoteOnlyPair(), usdcBasePair()],
      USDC_MINT,
      COLLECTED_AT,
    );

    expect(snapshot.pairAddress).toBe('pair-usdc-base');
    expect(snapshot.tokenMint).toBe(USDC_MINT);
    expect(snapshot.tokenSymbol).toBe('USDC');
    expect(snapshot.priceUsd).toBe(1);
    expect(snapshot.marketCapUsd).toBe(70_000_000_000);
    expect(snapshot.fdvUsd).toBe(71_000_000_000);
    expect(snapshot.quoteTokenSymbol).toBe('SOL');
  });

  it('does not sacrifice token-price correctness for a higher-liquidity quote-oriented pair', () => {
    const snapshot = snapshotFromDexScreenerPayload(
      [
        usdcQuoteOnlyPair(),
        {
          ...usdcBasePair(),
          liquidity: { usd: 100_000 },
        },
      ],
      USDC_MINT,
      COLLECTED_AT,
    );

    expect(snapshot.pairAddress).toBe('pair-usdc-base');
    expect(snapshot.priceUsd).toBe(1);
    expect(snapshot.tokenSymbol).toBe('USDC');
    expect(snapshot.priceUsd).not.toBe(12.34);
    expect(snapshot.liquidityUsd).toBe(100_000);
  });
});
