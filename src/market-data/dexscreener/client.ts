import { sanitizeErrorText } from '../../utils/sanitize-rpc-url.js';
import { MarketDataError } from '../types.js';

export const DEXSCREENER_BASE_URL = 'https://api.dexscreener.com';

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type DexScreenerClient = {
  fetchTokenPairs(tokenMint: string): Promise<unknown>;
};

export function createDexScreenerClient(options: {
  timeoutMs: number;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}): DexScreenerClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEXSCREENER_BASE_URL;

  return {
    fetchTokenPairs: async (tokenMint) => {
      const url = `${baseUrl}/token-pairs/v1/solana/${encodeURIComponent(tokenMint)}`;
      const signal = AbortSignal.timeout(options.timeoutMs);

      let response: Awaited<ReturnType<FetchLike>>;
      try {
        response = await fetchImpl(url, {
          method: 'GET',
          headers: {
            accept: 'application/json',
          },
          signal,
        });
      } catch (error: unknown) {
        throw new MarketDataError(mapRequestFailure(error, options.timeoutMs));
      }

      if (!response.ok) {
        throw new MarketDataError(mapHttpStatus(response.status));
      }

      let payload: unknown;
      try {
        payload = JSON.parse(await response.text()) as unknown;
      } catch {
        throw new MarketDataError('Market data provider returned an unexpected response.');
      }

      return payload;
    },
  };
}

function mapRequestFailure(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `Market data request timed out after ${String(timeoutMs)}ms.`;
  }

  const rawMessage = error instanceof Error ? error.message : 'Market data provider is unavailable.';
  const message = sanitizeErrorText(rawMessage);

  if (/fetch failed|econnrefused|enotfound|network|socket|econnreset|undici/i.test(message)) {
    return 'Market data provider is unavailable. Check your internet connection.';
  }

  return `Market data request failed: ${message}`;
}

function mapHttpStatus(status: number): string {
  if (status === 429) {
    return 'DEX Screener rate-limited the request. Wait and try again.';
  }

  return `Market data request failed with HTTP ${String(status)}.`;
}
