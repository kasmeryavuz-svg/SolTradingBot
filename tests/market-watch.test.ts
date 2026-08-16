import { describe, expect, it } from 'vitest';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { startApp, TradingSafetyError } from '../src/core/index.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import { watchMarketData } from '../src/market-data/watch-loop.js';

function snapshot(tokenMint: string, symbol: string): MarketSnapshot {
  return {
    chain: 'solana',
    tokenMint,
    tokenName: symbol,
    tokenSymbol: symbol,
    dexId: 'raydium',
    pairAddress: `pair-${symbol.toLowerCase()}`,
    quoteTokenMint: USDC_MINT,
    quoteTokenSymbol: 'USDC',
    priceUsd: 1,
    liquidityUsd: 1000,
    volume5mUsd: 10,
    volume1hUsd: 20,
    volume24hUsd: 30,
    buys5m: 1,
    sells5m: 1,
    buys1h: 2,
    sells1h: 2,
    priceChange5mPct: 0,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    marketCapUsd: 100,
    fdvUsd: 200,
    pairCreatedAt: '2021-01-01T00:00:00.000Z',
    collectedAt: '2026-08-16T22:00:00.000Z',
  };
}

describe('market watch loop', () => {
  it('prints at least two polling cycles and stops on abort', async () => {
    const lines: string[] = [];
    const controller = new AbortController();
    let cycles = 0;

    await watchMarketData({
      provider: {
        getSnapshot: (tokenMint) => {
          if (tokenMint === WRAPPED_SOL_MINT) {
            cycles += 1;
            if (cycles >= 2) {
              controller.abort();
            }
            return Promise.resolve(snapshot(tokenMint, 'SOL'));
          }
          return Promise.resolve(snapshot(tokenMint, 'USDC'));
        },
      },
      tokenMints: [WRAPPED_SOL_MINT, USDC_MINT],
      intervalMs: 10,
      signal: controller.signal,
      write: (line) => {
        lines.push(line);
      },
      now: () => new Date('2026-08-16T22:00:00.000Z'),
    });

    const headers = lines.filter((line) => line.startsWith('--- '));
    expect(headers.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((line) => line.includes('Token: SOL'))).toBe(true);
    expect(lines.some((line) => line.includes('No trading capability.'))).toBe(true);
  });

  it('still rejects TRADING_ENABLED=true', async () => {
    await expect(startApp({ TRADING_ENABLED: 'true' })).rejects.toBeInstanceOf(TradingSafetyError);
  });
});
