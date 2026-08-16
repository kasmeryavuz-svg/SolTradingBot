import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { parseTokenMintList } from '../src/market-data/watchlist.js';
import { ConfigError } from '../src/utils/parse-env.js';

describe('watchlist parsing', () => {
  it('parses a comma-separated mint list', () => {
    expect(
      parseTokenMintList(`${WRAPPED_SOL_MINT}, ${USDC_MINT}`, [], 'MARKET_DATA_TOKEN_MINTS'),
    ).toEqual([WRAPPED_SOL_MINT, USDC_MINT]);
  });

  it('deduplicates repeated mint addresses', () => {
    expect(
      parseTokenMintList(
        `${WRAPPED_SOL_MINT},${WRAPPED_SOL_MINT},${USDC_MINT},${USDC_MINT}`,
        [],
        'MARKET_DATA_TOKEN_MINTS',
      ),
    ).toEqual([WRAPPED_SOL_MINT, USDC_MINT]);
  });

  it('uses the fallback when the value is omitted', () => {
    expect(parseTokenMintList(undefined, [WRAPPED_SOL_MINT], 'MARKET_DATA_TOKEN_MINTS')).toEqual([
      WRAPPED_SOL_MINT,
    ]);
  });

  it('rejects empty entries', () => {
    expect(() => {
      parseTokenMintList(`${WRAPPED_SOL_MINT}, ,${USDC_MINT}`, [], 'MARKET_DATA_TOKEN_MINTS');
    }).toThrow(ConfigError);
  });

  it('rejects obviously malformed mint addresses', () => {
    expect(() => {
      parseTokenMintList('SOL,USDC', [], 'MARKET_DATA_TOKEN_MINTS');
    }).toThrow(/Solana token mint address/);
  });
});
