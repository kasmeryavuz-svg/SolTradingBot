import { FeatureEngineError } from './types.js';
import type { FeatureValue, FeatureValueKind } from './types.js';
import type { FeatureName } from './definitions.js';
import { requireFeatureDefinition } from './definitions.js';

export const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
export const BASIS_POINTS_PER_UNIT = 10_000;

export function availableNumber(name: FeatureName, value: number): FeatureValue {
  return availableValue(name, 'number', value);
}

export function availableInteger(name: FeatureName, value: number): FeatureValue {
  return availableValue(name, 'integer', value);
}

export function availableBoolean(name: FeatureName, value: boolean): FeatureValue {
  return availableValue(name, 'boolean', value);
}

export function unavailable(name: FeatureName, reason: string): FeatureValue {
  const definition = requireFeatureDefinition(name);
  return {
    name,
    kind: definition.kind,
    status: 'unavailable',
    value: null,
    unavailableReason: reason,
  };
}

export function isFiniteNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonNegativeFinite(value: number | null): value is number {
  return isFiniteNumber(value) && value >= 0;
}

export function isNonNegativeSafeInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function isSafeInteger(value: number | null): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

export function requireSolanaChain(chain: string, message: string): void {
  if (chain !== 'solana') {
    throw new FeatureEngineError(message);
  }
}

export function requireUtcTimestamp(value: string, field: string): number {
  if (!ISO_UTC_PATTERN.test(value)) {
    throw new FeatureEngineError(
      `Invalid ${field}. Expected a UTC ISO-8601 timestamp such as 2026-08-17T10:00:00.000Z.`,
    );
  }

  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) {
    throw new FeatureEngineError(`Invalid ${field}. The timestamp could not be parsed.`);
  }

  if (new Date(millis).toISOString() !== value) {
    throw new FeatureEngineError(
      `Invalid ${field}. The timestamp is not a valid UTC calendar instant.`,
    );
  }

  return millis;
}

export function secondsBetween(laterIso: string, earlierIso: string, field: string): number {
  const later = requireUtcTimestamp(laterIso, field);
  const earlier = requireUtcTimestamp(earlierIso, field);
  const millis = later - earlier;
  if (!Number.isSafeInteger(millis)) {
    throw new FeatureEngineError(`Invalid ${field}. The elapsed milliseconds are not a safe integer.`);
  }

  // Whole seconds only. Sub-second positive gaps become 0. A later timestamp
  // that is even 1ms earlier than `earlierIso` floors to a negative integer and
  // is never clamped to zero. Age features must not emit that negative value.
  const seconds = Math.floor(millis / 1000);
  if (!Number.isSafeInteger(seconds)) {
    throw new FeatureEngineError(`Invalid ${field}. The elapsed seconds are not a safe integer.`);
  }

  return seconds;
}

export function buyShareBps(buys: number, sells: number): number | null {
  const total = BigInt(buys) + BigInt(sells);
  if (total === 0n) {
    return null;
  }

  return Number((BigInt(buys) * BigInt(BASIS_POINTS_PER_UNIT)) / total);
}

export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) {
    return null;
  }

  const change = ((current - previous) / previous) * 100;
  return Number.isFinite(change) ? change : null;
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return null;
  }

  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

export function featureSourceIdentity(input: {
  featureSetVersion: string;
  tokenMint: string;
  asOf: string;
  marketCollectedAt: string;
  marketPairAddress: string;
  previousMarketCollectedAt: string | null;
  riskScannedAt: string | null;
}): string {
  return JSON.stringify({
    featureSetVersion: input.featureSetVersion,
    tokenMint: input.tokenMint,
    asOf: input.asOf,
    marketCollectedAt: input.marketCollectedAt,
    marketPairAddress: input.marketPairAddress,
    previousMarketCollectedAt: input.previousMarketCollectedAt,
    riskScannedAt: input.riskScannedAt,
  });
}

function availableValue(
  name: FeatureName,
  kind: FeatureValueKind,
  value: number | boolean,
): FeatureValue {
  const definition = requireFeatureDefinition(name);
  if (definition.kind !== kind) {
    throw new FeatureEngineError(`Feature ${name} has kind ${definition.kind}, not ${kind}.`);
  }

  if (kind === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new FeatureEngineError(`Feature ${name} must be a finite number.`);
  }

  if (kind === 'integer' && (typeof value !== 'number' || !Number.isSafeInteger(value))) {
    throw new FeatureEngineError(`Feature ${name} must be a JavaScript safe integer.`);
  }

  if (kind === 'boolean' && typeof value !== 'boolean') {
    throw new FeatureEngineError(`Feature ${name} must be a boolean.`);
  }

  return {
    name,
    kind,
    status: 'available',
    value,
    unavailableReason: null,
  };
}
