import type { SQLOutputValue } from 'node:sqlite';
import type { DiscoverySource, MarketDataStatus } from '../../discovery/types.js';
import type { MarketSnapshot } from '../../market-data/types.js';
import { PersistenceError } from '../types.js';
import type { StoredObservation, StoredSourceResult, StoredToken } from '../types.js';

export function asNumber(value: SQLOutputValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  throw new PersistenceError('Database returned an unexpected number.');
}

export function asNullableNumber(value: SQLOutputValue | undefined): number | null {
  return value === null || value === undefined ? null : asNumber(value);
}

export function asString(value: SQLOutputValue | undefined): string {
  if (typeof value === 'string') {
    return value;
  }
  throw new PersistenceError('Database returned unexpected text.');
}

export function asNullableString(value: SQLOutputValue | undefined): string | null {
  return value === null || value === undefined ? null : asString(value);
}

export function mapTokenRow(row: Record<string, SQLOutputValue>): StoredToken {
  return {
    id: asNumber(row['id']),
    chain: 'solana',
    mint: asString(row['mint']),
    firstObservedAt: asString(row['first_observed_at']),
    lastObservedAt: asString(row['last_observed_at']),
    createdAt: asString(row['created_at']),
  };
}

export function mapSourceResultRow(row: Record<string, SQLOutputValue>): StoredSourceResult {
  return {
    source: asString(row['source']) as DiscoverySource,
    ok: asNumber(row['ok']) === 1,
    recordCount: asNumber(row['record_count']),
    error: asNullableString(row['error']),
  };
}

export function mapObservationRow(
  row: Record<string, SQLOutputValue>,
  sources: DiscoverySource[],
): StoredObservation {
  return {
    id: asNumber(row['id']),
    runId: asNumber(row['run_id']),
    tokenMint: asString(row['mint']),
    observedAt: asString(row['observed_at']),
    sources,
    dexScreenerUrl: asNullableString(row['dex_screener_url']),
    description: asNullableString(row['description']),
    profileUpdatedAt: asNullableString(row['profile_updated_at']),
    boostAmount: asNullableNumber(row['boost_amount']),
    boostTotalAmount: asNullableNumber(row['boost_total_amount']),
    marketDataStatus: asString(row['market_data_status']) as MarketDataStatus,
  };
}

export function mapSnapshotRow(
  row: Record<string, SQLOutputValue>,
  tokenMint: string,
): MarketSnapshot {
  return {
    chain: 'solana',
    tokenMint,
    tokenName: asNullableString(row['token_name']),
    tokenSymbol: asNullableString(row['token_symbol']),
    dexId: asString(row['dex_id']),
    pairAddress: asString(row['pair_address']),
    quoteTokenMint: asNullableString(row['quote_token_mint']),
    quoteTokenSymbol: asNullableString(row['quote_token_symbol']),
    priceUsd: asNullableNumber(row['price_usd']),
    liquidityUsd: asNullableNumber(row['liquidity_usd']),
    volume5mUsd: asNullableNumber(row['volume_5m_usd']),
    volume1hUsd: asNullableNumber(row['volume_1h_usd']),
    volume24hUsd: asNullableNumber(row['volume_24h_usd']),
    buys5m: asNullableNumber(row['buys_5m']),
    sells5m: asNullableNumber(row['sells_5m']),
    buys1h: asNullableNumber(row['buys_1h']),
    sells1h: asNullableNumber(row['sells_1h']),
    priceChange5mPct: asNullableNumber(row['price_change_5m_pct']),
    priceChange1hPct: asNullableNumber(row['price_change_1h_pct']),
    priceChange24hPct: asNullableNumber(row['price_change_24h_pct']),
    marketCapUsd: asNullableNumber(row['market_cap_usd']),
    fdvUsd: asNullableNumber(row['fdv_usd']),
    pairCreatedAt: asNullableString(row['pair_created_at']),
    collectedAt: asString(row['collected_at']),
  };
}
