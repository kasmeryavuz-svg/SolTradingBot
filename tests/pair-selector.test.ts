import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { selectBestPair } from '../src/market-data/pair-selector.js';
import { MarketDataError } from '../src/market-data/types.js';

const OTHER_MINT = '11111111111111111111111111111111';

function pair(overrides: {
  chainId?: string;
  baseTokenMint?: string;
  quoteTokenMint?: string | null;
  priceUsd?: number | null;
  liquidityUsd?: number | null;
  id?: string;
}) {
  return {
    chainId: 'solana',
    baseTokenMint: WRAPPED_SOL_MINT,
    quoteTokenMint: USDC_MINT,
    priceUsd: 180,
    liquidityUsd: 1_000_000,
    id: 'pair',
    ...overrides,
  };
}

describe('selectBestPair', () => {
  it('selects the pair with the highest valid USD liquidity', () => {
    const selected = selectBestPair(
      [
        pair({ id: 'low', liquidityUsd: 100_000, priceUsd: 180 }),
        pair({ id: 'high', liquidityUsd: 9_000_000, priceUsd: 181 }),
        pair({ id: 'mid', liquidityUsd: 500_000, priceUsd: 179 }),
      ],
      WRAPPED_SOL_MINT,
    );

    expect(selected.id).toBe('high');
  });

  it('rejects pairs on the wrong chain', () => {
    expect(() => {
      selectBestPair(
        [pair({ chainId: 'ethereum', liquidityUsd: 99_000_000 })],
        WRAPPED_SOL_MINT,
      );
    }).toThrow(MarketDataError);
  });

  it('rejects pairs that do not include the requested token mint', () => {
    expect(() => {
      selectBestPair(
        [pair({ baseTokenMint: OTHER_MINT, quoteTokenMint: USDC_MINT, liquidityUsd: 99_000_000 })],
        WRAPPED_SOL_MINT,
      );
    }).toThrow(/requested token is the base token/);
  });

  it('returns a clear error when no usable pair exists', () => {
    expect(() => {
      selectBestPair(
        [pair({ priceUsd: null, liquidityUsd: 5_000_000 })],
        WRAPPED_SOL_MINT,
      );
    }).toThrow(MarketDataError);

    expect(() => {
      selectBestPair([], WRAPPED_SOL_MINT);
    }).toThrow(/requested token is the base token/);
  });

  it('prefers a pair where the requested mint is the base token', () => {
    const selected = selectBestPair(
      [
        pair({
          id: 'quote-side',
          baseTokenMint: OTHER_MINT,
          quoteTokenMint: USDC_MINT,
          liquidityUsd: 50_000_000,
          priceUsd: 2,
        }),
        pair({
          id: 'base-side',
          baseTokenMint: USDC_MINT,
          quoteTokenMint: WRAPPED_SOL_MINT,
          liquidityUsd: 1_000_000,
          priceUsd: 1,
        }),
      ],
      USDC_MINT,
    );

    expect(selected.id).toBe('base-side');
  });

  it('prefers a priced pair over a higher-liquidity pair with no price', () => {
    const selected = selectBestPair(
      [
        pair({ id: 'no-price', priceUsd: null, liquidityUsd: 50_000_000 }),
        pair({ id: 'priced', priceUsd: 12, liquidityUsd: 10_000 }),
      ],
      WRAPPED_SOL_MINT,
    );

    expect(selected.id).toBe('priced');
  });
});
