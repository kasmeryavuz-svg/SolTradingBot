import { isPlausibleSolanaMint } from '../../utils/solana-mint.js';
import { DiscoveryError, type DiscoveryLink, type DiscoverySource, type SourceRecord } from '../types.js';

export function parseProfileFeed(payload: unknown): SourceRecord[] {
  return parseFeed(payload, 'dexscreener_profile');
}

export function parseBoostFeed(payload: unknown): SourceRecord[] {
  return parseFeed(payload, 'dexscreener_boost');
}

function parseFeed(payload: unknown, source: DiscoverySource): SourceRecord[] {
  const items = asItemArray(payload);
  if (items === null) {
    throw new DiscoveryError('Discovery provider returned an unexpected response.');
  }

  const records: SourceRecord[] = [];
  for (const item of items) {
    const record = parseRecord(item, source);
    if (record !== null) {
      records.push(record);
    }
  }

  return records;
}

function parseRecord(value: unknown, source: DiscoverySource): SourceRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const chainId = readNonEmptyString(value['chainId']);
  if (chainId === null || chainId.toLowerCase() !== 'solana') {
    return null;
  }

  const tokenMint = readNonEmptyString(value['tokenAddress']);
  if (tokenMint === null || !isPlausibleSolanaMint(tokenMint)) {
    return null;
  }

  return {
    source,
    tokenMint,
    dexScreenerUrl: readHttpUrl(value['url']),
    description: readNonEmptyString(value['description']),
    links: parseLinks(value['links']),
    // Official latest-profile / latest-boost contracts do not document a timestamp.
    profileUpdatedAt: null,
    boostAmount: source === 'dexscreener_boost' ? parseOptionalNumber(value['amount']) : null,
    boostTotalAmount: source === 'dexscreener_boost' ? parseOptionalNumber(value['totalAmount']) : null,
  };
}

function parseLinks(value: unknown): DiscoveryLink[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const links: DiscoveryLink[] = [];
  for (const item of value) {
    if (!isRecord(item)) {
      continue;
    }
    const url = readHttpUrl(item['url']);
    if (url === null) {
      continue;
    }
    links.push({
      type: readNonEmptyString(item['type']),
      label: readNonEmptyString(item['label']),
      url,
    });
  }

  return links;
}

function parseOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asItemArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload.map((item: unknown) => item);
  }

  return null;
}

function readHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? value : null;
  } catch {
    return null;
  }
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
