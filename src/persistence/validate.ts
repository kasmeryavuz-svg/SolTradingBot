import type { DiscoveryCandidate } from '../discovery/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { PersistenceError } from './types.js';

export function requireFiniteOrNull(value: number | null, field: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PersistenceError(`Invalid ${field}. Expected a finite number or null.`);
  }

  return value;
}

export function assertPersistableSnapshot(snapshot: MarketSnapshot): void {
  requireFiniteOrNull(snapshot.priceUsd, 'priceUsd');
  requireFiniteOrNull(snapshot.liquidityUsd, 'liquidityUsd');
  requireFiniteOrNull(snapshot.volume5mUsd, 'volume5mUsd');
  requireFiniteOrNull(snapshot.volume1hUsd, 'volume1hUsd');
  requireFiniteOrNull(snapshot.volume24hUsd, 'volume24hUsd');
  requireFiniteOrNull(snapshot.buys5m, 'buys5m');
  requireFiniteOrNull(snapshot.sells5m, 'sells5m');
  requireFiniteOrNull(snapshot.buys1h, 'buys1h');
  requireFiniteOrNull(snapshot.sells1h, 'sells1h');
  requireFiniteOrNull(snapshot.priceChange5mPct, 'priceChange5mPct');
  requireFiniteOrNull(snapshot.priceChange1hPct, 'priceChange1hPct');
  requireFiniteOrNull(snapshot.priceChange24hPct, 'priceChange24hPct');
  requireFiniteOrNull(snapshot.marketCapUsd, 'marketCapUsd');
  requireFiniteOrNull(snapshot.fdvUsd, 'fdvUsd');
}

export function assertPersistableCandidate(candidate: DiscoveryCandidate): void {
  requireFiniteOrNull(candidate.boostAmount, 'boostAmount');
  requireFiniteOrNull(candidate.boostTotalAmount, 'boostTotalAmount');
  if (candidate.marketSnapshot !== null) {
    assertPersistableSnapshot(candidate.marketSnapshot);
  }
}
