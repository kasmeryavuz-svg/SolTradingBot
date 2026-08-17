import { requireFeatureDefinition, type FeatureName } from '../features/definitions.js';
import type { FeatureValue, FeatureVector } from '../features/types.js';
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
} from './constants.js';
import { STRATEGY_RULE_DEFINITIONS } from './definitions.js';
import { StrategyError, type StrategyRuleResult, type StrategyRuleStatus } from './types.js';

export function evaluateStrategyRules(vector: FeatureVector): StrategyRuleResult[] {
  return STRATEGY_RULE_DEFINITIONS.map((definition, index) => {
    const outcome = evaluateNamedRule(definition.code, vector);
    return {
      ordinal: index + 1,
      ruleCode: definition.code,
      category: definition.category,
      status: outcome.status,
      description: definition.description,
      criterion: definition.criterion,
      observed: outcome.observed,
      reason: outcome.reason,
    };
  });
}

function evaluateNamedRule(
  code: (typeof STRATEGY_RULE_DEFINITIONS)[number]['code'],
  vector: FeatureVector,
): { status: StrategyRuleStatus; observed: string; reason: string } {
  switch (code) {
    case 'PRICE_POSITIVE':
      return evaluateExclusiveMinimum('market_price_usd', vector, MIN_PRICE_USD_EXCLUSIVE, {
        pass: 'market_price_usd is strictly positive.',
        fail: 'market_price_usd is not greater than 0.',
        format: formatNumberObserved,
      });
    case 'LIQUIDITY_MINIMUM':
      return evaluateMinimum('market_liquidity_usd', vector, MIN_LIQUIDITY_USD, {
        pass: 'Selected pair USD liquidity meets the s07_v1 minimum.',
        fail: `Selected pair USD liquidity is below ${String(MIN_LIQUIDITY_USD)}.`,
        format: formatNumberObserved,
      });
    case 'PAIR_AGE_RANGE':
      return evaluateInclusiveRange('pair_age_seconds', vector, MIN_PAIR_AGE_SECONDS, MAX_PAIR_AGE_SECONDS, {
        pass: 'DEX pair age is inside the s07_v1 window.',
        fail: 'DEX pair age is outside the s07_v1 window.',
        format: formatIntegerObserved,
      });
    case 'MARKET_FRESHNESS':
      return evaluateInclusiveRange('market_age_seconds', vector, 0, MAX_MARKET_AGE_SECONDS, {
        pass: 'Current market observation is fresh enough for s07_v1.',
        fail: 'Current market observation is older than the s07_v1 freshness window.',
        format: formatIntegerObserved,
      });
    case 'TRADES_5M_MINIMUM':
      return evaluateMinimum('trades_5m', vector, MIN_TRADES_5M, {
        pass: 'Observed 5-minute pair trade count meets the s07_v1 minimum.',
        fail: `Observed 5-minute pair trade count is below ${String(MIN_TRADES_5M)}.`,
        format: formatIntegerObserved,
      });
    case 'VOLUME_LIQUIDITY_5M_MINIMUM':
      return evaluateMinimum('volume_to_liquidity_5m_ratio', vector, MIN_VOLUME_TO_LIQUIDITY_5M_RATIO, {
        pass: '5-minute volume-to-pair-liquidity ratio meets the s07_v1 minimum.',
        fail: `5-minute volume-to-pair-liquidity ratio is below ${String(MIN_VOLUME_TO_LIQUIDITY_5M_RATIO)}.`,
        format: formatNumberObserved,
      });
    case 'BUY_SHARE_5M_MINIMUM':
      return evaluateMinimum('buy_share_5m_bps', vector, MIN_BUY_SHARE_5M_BPS, {
        pass: 'Observed 5-minute buy-share of trades meets the s07_v1 minimum.',
        fail: `Observed 5-minute buy-share of trades is below ${String(MIN_BUY_SHARE_5M_BPS)} bps.`,
        format: formatBuyShareObserved,
      });
    case 'NET_BUYS_5M_MINIMUM':
      return evaluateMinimum('net_buys_5m', vector, MIN_NET_BUYS_5M, {
        pass: 'Observed 5-minute net buy count meets the s07_v1 minimum.',
        fail: `Observed 5-minute net buy count is below ${String(MIN_NET_BUYS_5M)}.`,
        format: formatIntegerObserved,
      });
    case 'PRICE_CHANGE_5M_RANGE':
      return evaluateInclusiveRange(
        'market_price_change_5m_pct',
        vector,
        MIN_PRICE_CHANGE_5M_PCT,
        MAX_PRICE_CHANGE_5M_PCT,
        {
          pass: 'Provider-observed 5-minute price change is inside the s07_v1 window.',
          fail: 'Provider-observed 5-minute price change is outside the s07_v1 window.',
          format: formatNumberObserved,
        },
      );
    case 'NO_BLOCKING_RISK_FINDINGS':
      return evaluateBlockingRiskFindings(vector);
  }
}

function evaluateExclusiveMinimum(
  name: FeatureName,
  vector: FeatureVector,
  minimumExclusive: number,
  copy: { pass: string; fail: string; format: (value: number) => string },
): { status: StrategyRuleStatus; observed: string; reason: string } {
  const feature = readFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableOutcome(feature);
  }

  const value = requireAvailableNumber(feature);
  if (value > minimumExclusive) {
    return { status: 'pass', observed: copy.format(value), reason: copy.pass };
  }

  return { status: 'fail', observed: copy.format(value), reason: copy.fail };
}

function evaluateMinimum(
  name: FeatureName,
  vector: FeatureVector,
  minimumInclusive: number,
  copy: { pass: string; fail: string; format: (value: number) => string },
): { status: StrategyRuleStatus; observed: string; reason: string } {
  const feature = readFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableOutcome(feature);
  }

  const value = requireAvailableNumber(feature);
  if (value >= minimumInclusive) {
    return { status: 'pass', observed: copy.format(value), reason: copy.pass };
  }

  return { status: 'fail', observed: copy.format(value), reason: copy.fail };
}

function evaluateInclusiveRange(
  name: FeatureName,
  vector: FeatureVector,
  minimumInclusive: number,
  maximumInclusive: number,
  copy: { pass: string; fail: string; format: (value: number) => string },
): { status: StrategyRuleStatus; observed: string; reason: string } {
  const feature = readFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableOutcome(feature);
  }

  const value = requireAvailableNumber(feature);
  if (value >= minimumInclusive && value <= maximumInclusive) {
    return { status: 'pass', observed: copy.format(value), reason: copy.pass };
  }

  return { status: 'fail', observed: copy.format(value), reason: copy.fail };
}

function evaluateBlockingRiskFindings(
  vector: FeatureVector,
): { status: StrategyRuleStatus; observed: string; reason: string } {
  const observedParts: string[] = [];
  const trueBlockers: string[] = [];
  const unavailableNames: string[] = [];

  for (const name of BLOCKING_RISK_FEATURES) {
    const feature = readFeature(vector, name);
    if (feature.status === 'unavailable') {
      unavailableNames.push(name);
      observedParts.push(`${name}=unavailable`);
      continue;
    }

    const value = requireAvailableBoolean(feature);
    observedParts.push(`${name}=${value ? 'true' : 'false'}`);
    if (value) {
      trueBlockers.push(name);
    }
  }

  const observed = observedParts.join('; ');

  if (trueBlockers.length > 0) {
    const transferFeeBlocked = trueBlockers.includes('risk_finding_transfer_fee_configured');
    const reason = transferFeeBlocked
      ? 'Checkpoint 05 observed a configured or scheduled transfer-fee setup that s07_v1 does not model.'
      : `Configured s07_v1 blocking finding present: ${trueBlockers.join(', ')}.`;
    return { status: 'fail', observed, reason };
  }

  if (unavailableNames.length > 0) {
    return {
      status: 'unavailable',
      observed,
      reason: `Required blocking risk features unavailable: ${unavailableNames.join(', ')}.`,
    };
  }

  return {
    status: 'pass',
    observed,
    reason: 'no configured s07_v1 blocking findings present',
  };
}

export function readFeature(vector: FeatureVector, name: FeatureName): FeatureValue {
  const definition = requireFeatureDefinition(name);
  const value = vector.values.find((item) => item.name === name);
  if (value === undefined) {
    throw new StrategyError(`Required feature ${name} is missing from the feature vector.`);
  }
  if (value.kind !== definition.kind) {
    throw new StrategyError(`Feature ${name} has kind ${value.kind}, expected ${definition.kind}.`);
  }
  return value;
}

function requireAvailableNumber(feature: FeatureValue): number {
  if (typeof feature.value !== 'number' || !Number.isFinite(feature.value)) {
    throw new StrategyError(`Available feature ${feature.name} is not a finite number.`);
  }
  if (feature.kind === 'integer' && !Number.isSafeInteger(feature.value)) {
    throw new StrategyError(`Available feature ${feature.name} is not a safe integer.`);
  }
  return feature.value;
}

function requireAvailableBoolean(feature: FeatureValue): boolean {
  if (typeof feature.value !== 'boolean') {
    throw new StrategyError(`Available feature ${feature.name} is not a boolean.`);
  }
  return feature.value;
}

function unavailableOutcome(feature: FeatureValue): {
  status: 'unavailable';
  observed: string;
  reason: string;
} {
  return {
    status: 'unavailable',
    observed: 'unavailable',
    reason: feature.unavailableReason ?? 'feature unavailable',
  };
}

function formatIntegerObserved(value: number): string {
  return String(value);
}

function formatNumberObserved(value: number): string {
  return String(value);
}

function formatBuyShareObserved(value: number): string {
  return `${String(value)} bps`;
}
