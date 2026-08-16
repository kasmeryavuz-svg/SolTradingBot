import { describe, expect, it } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { createDexScreenerClient } from '../src/market-data/dexscreener/client.js';
import { MarketDataError } from '../src/market-data/types.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('DEX Screener HTTP client', () => {
  it('parses a successful JSON response', async () => {
    const client = createDexScreenerClient({
      timeoutMs: 1000,
      fetchImpl: () => Promise.resolve(jsonResponse(200, [{ pairAddress: 'abc' }])),
    });

    await expect(client.fetchTokenPairs(WRAPPED_SOL_MINT)).resolves.toEqual([{ pairAddress: 'abc' }]);
  });

  it('fails cleanly on a non-2xx HTTP response', async () => {
    const client = createDexScreenerClient({
      timeoutMs: 1000,
      fetchImpl: () => Promise.resolve(jsonResponse(503, { error: 'down' })),
    });

    await expect(client.fetchTokenPairs(WRAPPED_SOL_MINT)).rejects.toBeInstanceOf(MarketDataError);
    await expect(client.fetchTokenPairs(WRAPPED_SOL_MINT)).rejects.toThrow(/HTTP 503/);
  });

  it('fails cleanly on malformed JSON', async () => {
    const client = createDexScreenerClient({
      timeoutMs: 1000,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('not-json'),
        }),
    });

    await expect(client.fetchTokenPairs(WRAPPED_SOL_MINT)).rejects.toThrow(/unexpected response/);
  });

  it('fails cleanly when the request times out', async () => {
    const client = createDexScreenerClient({
      timeoutMs: 25,
      fetchImpl: (_url, init) =>
        new Promise((_, reject) => {
          const signal = init?.signal;
          if (signal === undefined) {
            reject(new Error('missing abort signal'));
            return;
          }

          const fail = (): void => {
            reject(signal.reason instanceof Error ? signal.reason : new Error('Aborted'));
          };

          if (signal.aborted) {
            fail();
            return;
          }

          signal.addEventListener('abort', fail);
        }),
    });

    await expect(client.fetchTokenPairs(WRAPPED_SOL_MINT)).rejects.toBeInstanceOf(MarketDataError);
    await expect(client.fetchTokenPairs(WRAPPED_SOL_MINT)).rejects.toThrow(/timed out after 25ms/);
  });

  it('does not include API-key query values in timeout or HTTP errors', async () => {
    const client = createDexScreenerClient({
      timeoutMs: 1000,
      fetchImpl: () => Promise.reject(new Error('request to https://api.example/?api-key=supersecret failed')),
    });

    try {
      await client.fetchTokenPairs(WRAPPED_SOL_MINT);
      throw new Error('expected failure');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('supersecret');
    }
  });
});
