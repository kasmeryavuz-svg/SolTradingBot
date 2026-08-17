import type { DiscoveryCandidate } from '../discovery/types.js';
import { assertFeatureVectorInvariants, assertSourceIdentity } from '../features/invariants.js';
import { featureSourceIdentity } from '../features/numbers.js';
import { FeatureEngineError, type FeatureVector } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { assertRiskReportInvariants } from '../risk/invariants.js';
import { RAW_AMOUNT_PATTERN } from '../risk/numbers.js';
import { RiskScanError, type TokenRiskReport } from '../risk/types.js';
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

export function assertPersistableRiskReport(report: TokenRiskReport): void {
  try {
    assertRiskReportInvariants(report);
  } catch (error: unknown) {
    if (error instanceof RiskScanError) {
      throw new PersistenceError(error.message, { cause: error });
    }

    throw error;
  }
}

export function requireSafeInteger(value: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PersistenceError(`Invalid ${field}. Expected a non-negative safe integer.`);
  }

  return value;
}

export function requireSafeIntegerOrNull(value: number | null, field: string): number | null {
  return value === null ? null : requireSafeInteger(value, field);
}

export function requireBasisPointsOrNull(value: number | null, field: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new PersistenceError(`Invalid ${field}. Expected an integer from 0 to 10000.`);
  }

  return value;
}

export function requireRawAmountOrNull(value: string | null, field: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || !RAW_AMOUNT_PATTERN.test(value)) {
    throw new PersistenceError(`Invalid ${field}. Expected a non-negative decimal integer string.`);
  }

  return value;
}

export function assertPersistableFeatureVector(vector: FeatureVector): void {
  try {
    assertFeatureVectorInvariants(vector);
    assertSourceIdentity(vector, featureSourceIdentity(vector));
  } catch (error: unknown) {
    if (error instanceof FeatureEngineError) {
      throw new PersistenceError(error.message, { cause: error });
    }

    throw error;
  }
}

export function assertPersistableCandidate(candidate: DiscoveryCandidate): void {
  requireFiniteOrNull(candidate.boostAmount, 'boostAmount');
  requireFiniteOrNull(candidate.boostTotalAmount, 'boostTotalAmount');
  if (candidate.marketSnapshot !== null) {
    assertPersistableSnapshot(candidate.marketSnapshot);
  }
}
