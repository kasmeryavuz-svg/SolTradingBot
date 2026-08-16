import { sanitizeErrorText } from '../../utils/sanitize-rpc-url.js';
import { DiscoveryError } from '../types.js';

export const DEXSCREENER_DISCOVERY_BASE_URL = 'https://api.dexscreener.com';

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; signal?: AbortSignal },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
}>;

export type DexScreenerDiscoveryClient = {
  fetchLatestProfiles(): Promise<unknown>;
  fetchLatestBoosts(): Promise<unknown>;
};

export function createDexScreenerDiscoveryClient(options: {
  timeoutMs: number;
  fetchImpl?: FetchLike;
  baseUrl?: string;
}): DexScreenerDiscoveryClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseUrl = options.baseUrl ?? DEXSCREENER_DISCOVERY_BASE_URL;

  return {
    fetchLatestProfiles: () => getJson(fetchImpl, `${baseUrl}/token-profiles/latest/v1`, options.timeoutMs),
    fetchLatestBoosts: () => getJson(fetchImpl, `${baseUrl}/token-boosts/latest/v1`, options.timeoutMs),
  };
}

async function getJson(fetchImpl: FetchLike, url: string, timeoutMs: number): Promise<unknown> {
  const signal = AbortSignal.timeout(timeoutMs);

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
    throw new DiscoveryError(mapRequestFailure(error, timeoutMs));
  }

  if (!response.ok) {
    throw new DiscoveryError(mapHttpStatus(response.status));
  }

  try {
    return JSON.parse(await response.text()) as unknown;
  } catch {
    throw new DiscoveryError('Discovery provider returned an unexpected response.');
  }
}

function mapRequestFailure(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return `Discovery request timed out after ${String(timeoutMs)}ms.`;
  }

  const rawMessage = error instanceof Error ? error.message : 'Discovery provider is unavailable.';
  const message = sanitizeErrorText(rawMessage);

  if (/fetch failed|econnrefused|enotfound|network|socket|econnreset|undici/i.test(message)) {
    return 'Discovery provider is unavailable. Check your internet connection.';
  }

  return `Discovery request failed: ${message}`;
}

function mapHttpStatus(status: number): string {
  if (status === 429) {
    return 'DEX Screener rate-limited the discovery request. Wait and try again.';
  }

  return `Discovery request failed with HTTP ${String(status)}.`;
}
