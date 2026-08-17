import { createHash } from 'node:crypto';
import { requireFeatureDefinition } from '../features/definitions.js';
import { featureSourceIdentity } from '../features/numbers.js';
import type { FeatureVector } from '../features/types.js';
import {
  BLOCKING_RISK_FEATURES,
  MAX_MARKET_AGE_SECONDS,
  MAX_PAIR_AGE_SECONDS,
  MAX_PRICE_CHANGE_5M_PCT,
  MIN_BUY_SHARE_5M_BPS,
  MIN_LIQUIDITY_USD,
  MIN_NET_BUYS_5M,
  MIN_PAIR_AGE_SECONDS,
  MIN_PRICE_CHANGE_5M_PCT,
  MIN_PRICE_USD_EXCLUSIVE,
  MIN_TRADES_5M,
  MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
  REQUIRED_FEATURE_SET_VERSION,
  STRATEGY_NAME,
  STRATEGY_THRESHOLDS,
  STRATEGY_VERSION,
} from './constants.js';
import { STRATEGY_RULE_DEFINITIONS } from './definitions.js';

/**
 * Canonical s07_v1 definition fingerprint contract.
 *
 * The fingerprint is SHA-256 of JSON.stringify(canonicalStrategyDefinition()).
 * The object is constructed with an explicit key order. It is portable data:
 * same semantic definition => same digest on every machine.
 *
 * Included, because a change would silently drift persisted rule evidence or
 * decisions while keeping the same strategy version:
 * - strategyVersion, strategyName, requiredFeatureSetVersion
 * - ordered rule records: ordinal, code, category, description, criterion,
 *   featureNames, expectedKinds
 * - named thresholds
 * - comparison operators and inclusive/exclusive bounds
 * - ordered blocking risk feature names
 * - risk-aggregate precedence
 * - global decision precedence
 *
 * Excluded, because they are not definition semantics:
 * - dynamic observed values
 * - evaluation reason text (derived from definition + feature values + status)
 * - evaluatedAt, first_recorded_at, database IDs
 * - function source, compiled JS, file bytes, git SHA
 * - locale, timezone, Date.now(), randomness
 */
export type ComparisonOperator = '>' | '>=' | '<' | '<=';

export type CanonicalBoundComparison = {
  feature: string;
  kind: 'number' | 'integer';
  operator: ComparisonOperator;
  bound: number;
};

export type CanonicalRangeComparison = {
  feature: string;
  kind: 'number' | 'integer';
  minOperator: ComparisonOperator;
  min: number;
  maxOperator: ComparisonOperator;
  max: number;
};

export type CanonicalRuleDefinition = {
  ordinal: number;
  code: string;
  category: string;
  description: string;
  criterion: string;
  featureNames: string[];
  expectedKinds: string[];
};

export type CanonicalStrategyDefinition = {
  strategyVersion: string;
  strategyName: string;
  requiredFeatureSetVersion: string;
  rules: CanonicalRuleDefinition[];
  thresholds: {
    MIN_PRICE_USD_EXCLUSIVE: number;
    MIN_LIQUIDITY_USD: number;
    MIN_PAIR_AGE_SECONDS: number;
    MAX_PAIR_AGE_SECONDS: number;
    MAX_MARKET_AGE_SECONDS: number;
    MIN_TRADES_5M: number;
    MIN_VOLUME_TO_LIQUIDITY_5M_RATIO: number;
    MIN_BUY_SHARE_5M_BPS: number;
    MIN_NET_BUYS_5M: number;
    MIN_PRICE_CHANGE_5M_PCT: number;
    MAX_PRICE_CHANGE_5M_PCT: number;
  };
  comparisons: {
    PRICE_POSITIVE: CanonicalBoundComparison;
    LIQUIDITY_MINIMUM: CanonicalBoundComparison;
    PAIR_AGE_RANGE: CanonicalRangeComparison;
    MARKET_FRESHNESS: CanonicalRangeComparison;
    TRADES_5M_MINIMUM: CanonicalBoundComparison;
    VOLUME_LIQUIDITY_5M_MINIMUM: CanonicalBoundComparison;
    BUY_SHARE_5M_MINIMUM: CanonicalBoundComparison;
    NET_BUYS_5M_MINIMUM: CanonicalBoundComparison;
    PRICE_CHANGE_5M_RANGE: CanonicalRangeComparison;
  };
  riskAggregate: {
    blockingFeatures: string[];
    anyTrueBlocker: string;
    noTrueAndAnyUnavailable: string;
    allAvailableFalse: string;
  };
  decisionPrecedence: {
    anyFail: string;
    elseAnyUnavailable: string;
    elseAllPass: string;
  };
};

export type CanonicalStrategyDefinitionOverrides = {
  strategyVersion?: string;
  strategyName?: string;
  requiredFeatureSetVersion?: string;
  rules?: CanonicalRuleDefinition[];
  thresholds?: Partial<CanonicalStrategyDefinition['thresholds']>;
  comparisons?: {
    [K in keyof CanonicalStrategyDefinition['comparisons']]?: Partial<
      CanonicalStrategyDefinition['comparisons'][K]
    >;
  };
  riskAggregate?: Partial<CanonicalStrategyDefinition['riskAggregate']>;
  decisionPrecedence?: Partial<CanonicalStrategyDefinition['decisionPrecedence']>;
};

export function canonicalStrategyDefinition(
  overrides: CanonicalStrategyDefinitionOverrides = {},
): CanonicalStrategyDefinition {
  const rules = overrides.rules ?? STRATEGY_RULE_DEFINITIONS.map((definition, index) => ({
    ordinal: index + 1,
    code: definition.code,
    category: definition.category,
    description: definition.description,
    criterion: definition.criterion,
    featureNames: [...definition.featureNames],
    expectedKinds: definition.featureNames.map((name) => requireFeatureDefinition(name).kind),
  }));

  return {
    strategyVersion: overrides.strategyVersion ?? STRATEGY_VERSION,
    strategyName: overrides.strategyName ?? STRATEGY_NAME,
    requiredFeatureSetVersion: overrides.requiredFeatureSetVersion ?? REQUIRED_FEATURE_SET_VERSION,
    rules,
    thresholds: {
      MIN_PRICE_USD_EXCLUSIVE:
        overrides.thresholds?.MIN_PRICE_USD_EXCLUSIVE ?? STRATEGY_THRESHOLDS.MIN_PRICE_USD_EXCLUSIVE,
      MIN_LIQUIDITY_USD: overrides.thresholds?.MIN_LIQUIDITY_USD ?? STRATEGY_THRESHOLDS.MIN_LIQUIDITY_USD,
      MIN_PAIR_AGE_SECONDS:
        overrides.thresholds?.MIN_PAIR_AGE_SECONDS ?? STRATEGY_THRESHOLDS.MIN_PAIR_AGE_SECONDS,
      MAX_PAIR_AGE_SECONDS:
        overrides.thresholds?.MAX_PAIR_AGE_SECONDS ?? STRATEGY_THRESHOLDS.MAX_PAIR_AGE_SECONDS,
      MAX_MARKET_AGE_SECONDS:
        overrides.thresholds?.MAX_MARKET_AGE_SECONDS ?? STRATEGY_THRESHOLDS.MAX_MARKET_AGE_SECONDS,
      MIN_TRADES_5M: overrides.thresholds?.MIN_TRADES_5M ?? STRATEGY_THRESHOLDS.MIN_TRADES_5M,
      MIN_VOLUME_TO_LIQUIDITY_5M_RATIO:
        overrides.thresholds?.MIN_VOLUME_TO_LIQUIDITY_5M_RATIO ??
        STRATEGY_THRESHOLDS.MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
      MIN_BUY_SHARE_5M_BPS:
        overrides.thresholds?.MIN_BUY_SHARE_5M_BPS ?? STRATEGY_THRESHOLDS.MIN_BUY_SHARE_5M_BPS,
      MIN_NET_BUYS_5M: overrides.thresholds?.MIN_NET_BUYS_5M ?? STRATEGY_THRESHOLDS.MIN_NET_BUYS_5M,
      MIN_PRICE_CHANGE_5M_PCT:
        overrides.thresholds?.MIN_PRICE_CHANGE_5M_PCT ?? STRATEGY_THRESHOLDS.MIN_PRICE_CHANGE_5M_PCT,
      MAX_PRICE_CHANGE_5M_PCT:
        overrides.thresholds?.MAX_PRICE_CHANGE_5M_PCT ?? STRATEGY_THRESHOLDS.MAX_PRICE_CHANGE_5M_PCT,
    },
    comparisons: {
      PRICE_POSITIVE: boundComparison(
        'market_price_usd',
        'number',
        '>',
        MIN_PRICE_USD_EXCLUSIVE,
        overrides.comparisons?.PRICE_POSITIVE,
      ),
      LIQUIDITY_MINIMUM: boundComparison(
        'market_liquidity_usd',
        'number',
        '>=',
        MIN_LIQUIDITY_USD,
        overrides.comparisons?.LIQUIDITY_MINIMUM,
      ),
      PAIR_AGE_RANGE: rangeComparison(
        'pair_age_seconds',
        'integer',
        '>=',
        MIN_PAIR_AGE_SECONDS,
        '<=',
        MAX_PAIR_AGE_SECONDS,
        overrides.comparisons?.PAIR_AGE_RANGE,
      ),
      MARKET_FRESHNESS: rangeComparison(
        'market_age_seconds',
        'integer',
        '>=',
        0,
        '<=',
        MAX_MARKET_AGE_SECONDS,
        overrides.comparisons?.MARKET_FRESHNESS,
      ),
      TRADES_5M_MINIMUM: boundComparison(
        'trades_5m',
        'integer',
        '>=',
        MIN_TRADES_5M,
        overrides.comparisons?.TRADES_5M_MINIMUM,
      ),
      VOLUME_LIQUIDITY_5M_MINIMUM: boundComparison(
        'volume_to_liquidity_5m_ratio',
        'number',
        '>=',
        MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
        overrides.comparisons?.VOLUME_LIQUIDITY_5M_MINIMUM,
      ),
      BUY_SHARE_5M_MINIMUM: boundComparison(
        'buy_share_5m_bps',
        'integer',
        '>=',
        MIN_BUY_SHARE_5M_BPS,
        overrides.comparisons?.BUY_SHARE_5M_MINIMUM,
      ),
      NET_BUYS_5M_MINIMUM: boundComparison(
        'net_buys_5m',
        'integer',
        '>=',
        MIN_NET_BUYS_5M,
        overrides.comparisons?.NET_BUYS_5M_MINIMUM,
      ),
      PRICE_CHANGE_5M_RANGE: rangeComparison(
        'market_price_change_5m_pct',
        'number',
        '>=',
        MIN_PRICE_CHANGE_5M_PCT,
        '<=',
        MAX_PRICE_CHANGE_5M_PCT,
        overrides.comparisons?.PRICE_CHANGE_5M_RANGE,
      ),
    },
    riskAggregate: {
      blockingFeatures: [...(overrides.riskAggregate?.blockingFeatures ?? BLOCKING_RISK_FEATURES)],
      anyTrueBlocker: overrides.riskAggregate?.anyTrueBlocker ?? 'fail',
      noTrueAndAnyUnavailable: overrides.riskAggregate?.noTrueAndAnyUnavailable ?? 'unavailable',
      allAvailableFalse: overrides.riskAggregate?.allAvailableFalse ?? 'pass',
    },
    decisionPrecedence: {
      anyFail: overrides.decisionPrecedence?.anyFail ?? 'no_entry',
      elseAnyUnavailable: overrides.decisionPrecedence?.elseAnyUnavailable ?? 'insufficient_data',
      elseAllPass: overrides.decisionPrecedence?.elseAllPass ?? 'entry_candidate',
    },
  };
}

export function mutateCanonicalDefinition(
  mutate: (definition: CanonicalStrategyDefinition) => void,
): CanonicalStrategyDefinition {
  const definition = structuredClone(canonicalStrategyDefinition());
  mutate(definition);
  return definition;
}

export function fingerprintStrategyDefinition(
  definition: CanonicalStrategyDefinition = canonicalStrategyDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const STRATEGY_DEFINITION_FINGERPRINT = fingerprintStrategyDefinition();

export function strategySourceIdentity(input: {
  strategyVersion: string;
  strategyDefinitionFingerprint: string;
  featureSourceIdentity: string;
}): string {
  return JSON.stringify({
    strategyVersion: input.strategyVersion,
    strategyDefinitionFingerprint: input.strategyDefinitionFingerprint,
    featureSourceIdentity: input.featureSourceIdentity,
  });
}

export function strategySourceIdentityFromVector(vector: FeatureVector): string {
  return strategySourceIdentity({
    strategyVersion: STRATEGY_VERSION,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSourceIdentity: featureSourceIdentity(vector),
  });
}

function boundComparison(
  feature: string,
  kind: 'number' | 'integer',
  operator: ComparisonOperator,
  bound: number,
  override?: Partial<CanonicalBoundComparison>,
): CanonicalBoundComparison {
  return {
    feature: override?.feature ?? feature,
    kind: override?.kind ?? kind,
    operator: override?.operator ?? operator,
    bound: override?.bound ?? bound,
  };
}

function rangeComparison(
  feature: string,
  kind: 'number' | 'integer',
  minOperator: ComparisonOperator,
  min: number,
  maxOperator: ComparisonOperator,
  max: number,
  override?: Partial<CanonicalRangeComparison>,
): CanonicalRangeComparison {
  return {
    feature: override?.feature ?? feature,
    kind: override?.kind ?? kind,
    minOperator: override?.minOperator ?? minOperator,
    min: override?.min ?? min,
    maxOperator: override?.maxOperator ?? maxOperator,
    max: override?.max ?? max,
  };
}
