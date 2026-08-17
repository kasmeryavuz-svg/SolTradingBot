import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { FEATURE_DEFINITIONS, FEATURE_SET_VERSION, featureRegistrySize } from './definitions.js';
import { featureSourceIdentity, requireSolanaChain, requireUtcTimestamp } from './numbers.js';
import { FeatureEngineError } from './types.js';
import type { FeatureValue, FeatureVector } from './types.js';

export function assertFeatureVectorInvariants(vector: FeatureVector): void {
  requireSolanaChain(vector.chain, 'Feature vector chain must be solana.');

  if (!isPlausibleSolanaMint(vector.tokenMint)) {
    throw new FeatureEngineError('Feature vector token mint is invalid.');
  }

  if (vector.featureSetVersion !== FEATURE_SET_VERSION) {
    throw new FeatureEngineError(`Unknown feature-set version: ${vector.featureSetVersion}.`);
  }

  const generatedAtMs = requireUtcTimestamp(vector.generatedAt, 'generatedAt');
  const asOfMs = requireUtcTimestamp(vector.asOf, 'asOf');
  const marketCollectedAtMs = requireUtcTimestamp(vector.marketCollectedAt, 'marketCollectedAt');
  if (generatedAtMs < asOfMs) {
    throw new FeatureEngineError('generatedAt must be at or after asOf.');
  }
  if (marketCollectedAtMs > asOfMs) {
    throw new FeatureEngineError('marketCollectedAt must be at or before asOf.');
  }
  if (vector.previousMarketCollectedAt !== null) {
    const previousMs = requireUtcTimestamp(vector.previousMarketCollectedAt, 'previousMarketCollectedAt');
    if (previousMs >= marketCollectedAtMs) {
      throw new FeatureEngineError('previousMarketCollectedAt must be strictly before marketCollectedAt.');
    }
  }
  if (vector.riskScannedAt !== null) {
    const riskMs = requireUtcTimestamp(vector.riskScannedAt, 'riskScannedAt');
    if (riskMs > asOfMs) {
      throw new FeatureEngineError('riskScannedAt must be at or before asOf.');
    }
  }

  if (vector.values.length !== featureRegistrySize()) {
    throw new FeatureEngineError('Feature vector must contain exactly one value per registered feature.');
  }

  if (vector.availableFeatureCount + vector.unavailableFeatureCount !== featureRegistrySize()) {
    throw new FeatureEngineError('availableFeatureCount + unavailableFeatureCount must equal the registry size.');
  }

  const available = vector.values.filter((value) => value.status === 'available').length;
  const unavailable = vector.values.length - available;
  if (vector.availableFeatureCount !== available || vector.unavailableFeatureCount !== unavailable) {
    throw new FeatureEngineError('Feature completeness counts do not match the stored values.');
  }

  const expectedCompleteness = unavailable === 0 ? 'complete' : 'partial';
  if (vector.featureCompleteness !== expectedCompleteness) {
    throw new FeatureEngineError('featureCompleteness does not match available feature statuses.');
  }

  const names = new Set<string>();
  for (const [index, definition] of FEATURE_DEFINITIONS.entries()) {
    const value = vector.values[index];
    if (value === undefined || value.name !== definition.name) {
      throw new FeatureEngineError('Feature values must follow the c06_v1 registry order.');
    }
    if (names.has(value.name)) {
      throw new FeatureEngineError('Feature vector contains duplicate feature names.');
    }
    names.add(value.name);
    assertFeatureValue(value, definition.kind);
  }
}

export function assertSourceIdentity(vector: FeatureVector, sourceIdentity: string): void {
  const expected = featureSourceIdentity(vector);
  if (sourceIdentity !== expected) {
    throw new FeatureEngineError('sourceIdentity does not match the feature vector metadata.');
  }
}

export function featureValuesEqual(left: readonly FeatureValue[], right: readonly FeatureValue[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      value.name === other.name &&
      value.kind === other.kind &&
      value.status === other.status &&
      Object.is(value.value, other.value) &&
      value.unavailableReason === other.unavailableReason
    );
  });
}

function assertFeatureValue(value: FeatureValue, expectedKind: FeatureValue['kind']): void {
  if (value.kind !== expectedKind) {
    throw new FeatureEngineError(`Feature ${value.name} has the wrong kind.`);
  }

  if (value.status === 'unavailable') {
    if (value.value !== null || value.unavailableReason === null || value.unavailableReason.trim() === '') {
      throw new FeatureEngineError(`Unavailable feature ${value.name} must have a null value and a reason.`);
    }
    return;
  }

  if (value.unavailableReason !== null) {
    throw new FeatureEngineError(`Available feature ${value.name} cannot have an unavailable reason.`);
  }

  if (value.kind === 'number') {
    if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
      throw new FeatureEngineError(`Available number feature ${value.name} must be finite.`);
    }
    return;
  }

  if (value.kind === 'integer') {
    if (typeof value.value !== 'number' || !Number.isSafeInteger(value.value)) {
      throw new FeatureEngineError(`Available integer feature ${value.name} must be a safe integer.`);
    }
    return;
  }

  if (typeof value.value !== 'boolean') {
    throw new FeatureEngineError(`Available boolean feature ${value.name} must be true or false.`);
  }
}
