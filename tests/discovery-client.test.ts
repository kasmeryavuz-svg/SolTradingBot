import { describe, expect, it } from 'vitest';
import { createDexScreenerDiscoveryClient } from '../src/discovery/dexscreener/client.js';
import { DiscoveryError } from '../src/discovery/types.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

describe('DEX Screener discovery HTTP client', () => {
  it('GETs the official latest-profile endpoint', async () => {
    const urls: string[] = [];
    const client = createDexScreenerDiscoveryClient({
      timeoutMs: 1000,
      fetchImpl: (url, init) => {
        urls.push(url);
        expect(init?.method).toBe('GET');
        return Promise.resolve(jsonResponse(200, []));
      },
    });

    await expect(client.fetchLatestProfiles()).resolves.toEqual([]);
    expect(urls).toEqual(['https://api.dexscreener.com/token-profiles/latest/v1']);
  });

  it('GETs the official latest-boost endpoint', async () => {
    const urls: string[] = [];
    const client = createDexScreenerDiscoveryClient({
      timeoutMs: 1000,
      fetchImpl: (url, init) => {
        urls.push(url);
        expect(init?.method).toBe('GET');
        return Promise.resolve(jsonResponse(200, []));
      },
    });

    await expect(client.fetchLatestBoosts()).resolves.toEqual([]);
    expect(urls).toEqual(['https://api.dexscreener.com/token-boosts/latest/v1']);
  });

  it('maps HTTP 429 to a rate-limit error', async () => {
    const client = createDexScreenerDiscoveryClient({
      timeoutMs: 1000,
      fetchImpl: () => Promise.resolve(jsonResponse(429, { error: 'slow down' })),
    });

    await expect(client.fetchLatestProfiles()).rejects.toBeInstanceOf(DiscoveryError);
    await expect(client.fetchLatestProfiles()).rejects.toThrow(/rate-limited/i);
  });

  it('fails cleanly on malformed JSON', async () => {
    const client = createDexScreenerDiscoveryClient({
      timeoutMs: 1000,
      fetchImpl: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('not-json'),
        }),
    });

    await expect(client.fetchLatestBoosts()).rejects.toThrow(/unexpected response/);
  });
});
