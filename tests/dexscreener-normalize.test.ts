import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { snapshotFromDexScreenerPayload } from '../src/market-data/dexscreener/index.js';
import { parsePairCreatedAt } from '../src/market-data/dexscreener/normalize.js';
import { MarketDataError } from '../src/market-data/types.js';

const COLLECTED_AT = '2026-08-16T22:00:00.000Z';

function dexPair(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    chainId: 'solana',
    dexId: 'raydium',
    pairAddress: 'pair-sol-usdc',
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

describe('DEX Screener snapshot normalization', () => {
  it('parses a successful DEX Screener response', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);

    expect(snapshot.chain).toBe('solana');
    expect(snapshot.tokenMint).toBe(WRAPPED_SOL_MINT);
    expect(snapshot.tokenSymbol).toBe('SOL');
    expect(snapshot.tokenName).toBe('Wrapped SOL');
    expect(snapshot.dexId).toBe('raydium');
    expect(snapshot.pairAddress).toBe('pair-sol-usdc');
    expect(snapshot.quoteTokenMint).toBe(USDC_MINT);
    expect(snapshot.quoteTokenSymbol).toBe('USDC');
    expect(snapshot.collectedAt).toBe(COLLECTED_AT);
  });

  it('normalizes the USD price', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.priceUsd).toBe(180.25);
  });

  it('normalizes liquidity', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.liquidityUsd).toBe(4_500_000);
  });

  it('normalizes 5m volume', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.volume5mUsd).toBe(12_000);
  });

  it('normalizes 1h volume', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.volume1hUsd).toBe(80_000);
  });

  it('normalizes 24h volume', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.volume24hUsd).toBe(900_000);
  });

  it('normalizes buys and sells', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.buys5m).toBe(11);
    expect(snapshot.sells5m).toBe(7);
    expect(snapshot.buys1h).toBe(40);
    expect(snapshot.sells1h).toBe(33);
  });

  it('normalizes price changes', () => {
    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.priceChange5mPct).toBe(0.5);
    expect(snapshot.priceChange1hPct).toBe(-1.25);
    expect(snapshot.priceChange24hPct).toBe(3.5);
  });

  it('keeps market cap separate from FDV', () => {
    const snapshot = snapshotFromDexScreenerPayload(
      [dexPair({ marketCap: 111, fdv: 222 })],
      WRAPPED_SOL_MINT,
      COLLECTED_AT,
    );

    expect(snapshot.marketCapUsd).toBe(111);
    expect(snapshot.fdvUsd).toBe(222);
  });

  it('does not substitute FDV when market cap is missing', () => {
    const snapshot = snapshotFromDexScreenerPayload(
      [dexPair({ marketCap: undefined, fdv: 222 })],
      WRAPPED_SOL_MINT,
      COLLECTED_AT,
    );

    expect(snapshot.marketCapUsd).toBeNull();
    expect(snapshot.fdvUsd).toBe(222);
  });

  it('converts pair creation timestamps to ISO strings', () => {
    expect(parsePairCreatedAt(1_609_459_200_000)).toBe('2021-01-01T00:00:00.000Z');

    const snapshot = snapshotFromDexScreenerPayload([dexPair()], WRAPPED_SOL_MINT, COLLECTED_AT);
    expect(snapshot.pairCreatedAt).toBe('2021-01-01T00:00:00.000Z');
  });

  it('stores missing optional values as null', () => {
    const snapshot = snapshotFromDexScreenerPayload(
      [
        dexPair({
          priceChange: undefined,
          liquidity: {},
          volume: {},
          txns: {},
          marketCap: undefined,
          fdv: undefined,
          pairCreatedAt: undefined,
          quoteToken: { address: USDC_MINT },
        }),
      ],
      WRAPPED_SOL_MINT,
      COLLECTED_AT,
    );

    expect(snapshot.liquidityUsd).toBeNull();
    expect(snapshot.volume5mUsd).toBeNull();
    expect(snapshot.volume1hUsd).toBeNull();
    expect(snapshot.volume24hUsd).toBeNull();
    expect(snapshot.buys5m).toBeNull();
    expect(snapshot.sells5m).toBeNull();
    expect(snapshot.priceChange5mPct).toBeNull();
    expect(snapshot.marketCapUsd).toBeNull();
    expect(snapshot.fdvUsd).toBeNull();
    expect(snapshot.pairCreatedAt).toBeNull();
    expect(snapshot.quoteTokenSymbol).toBeNull();
  });

  it('fails cleanly when the provider payload is malformed', () => {
    expect(() => {
      snapshotFromDexScreenerPayload({ pairs: 'nope' }, WRAPPED_SOL_MINT, COLLECTED_AT);
    }).toThrow(MarketDataError);

    expect(() => {
      snapshotFromDexScreenerPayload({ pairs: 'nope' }, WRAPPED_SOL_MINT, COLLECTED_AT);
    }).toThrow(/unexpected response/);
  });
});
