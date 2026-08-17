import { requireFeatureDefinition, type FeatureName } from '../../features/definitions.js';
import type { FeatureValue, FeatureVector } from '../../features/types.js';
import {
  BLOCKING_RISK_FEATURES,
  MAX_MARKET_AGE_SECONDS,
  MAX_PAIR_AGE_SECONDS,
  MIN_LIQUIDITY_USD,
  MIN_PAIR_AGE_SECONDS,
  MIN_PRICE_USD_EXCLUSIVE,
  MIN_TRADES_5M,
} from '../../strategy/constants.js';
import { readFeature } from '../../strategy/rules.js';
import { StrategyError } from '../../strategy/types.js';
import { COMMON_GATE_VERSION, NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE } from '../constants.js';
import { ResearchError, type ResearchDecision, type ResearchRuleEvidence } from '../types.js';

export const COMMON_GATE_REQUIRED_FEATURES = [
  'market_price_usd',
  'market_liquidity_usd',
  'pair_age_seconds',
  'market_age_seconds',
  'trades_5m',
  ...BLOCKING_RISK_FEATURES,
] as const satisfies readonly FeatureName[];

export type CanonicalCommonGate = {
  commonGateVersion: string;
  requiredFeatures: readonly string[];
  comparisons: {
    PRICE_POSITIVE: { feature: string; operator: '>'; bound: number };
    LIQUIDITY_MINIMUM: { feature: string; operator: '>='; bound: number };
    PAIR_AGE_RANGE: {
      feature: string;
      minOperator: '>=';
      min: number;
      maxOperator: '<=';
      max: number;
    };
    MARKET_FRESHNESS: {
      feature: string;
      minOperator: '>=';
      min: number;
      maxOperator: '<=';
      max: number;
    };
    TRADES_5M_MINIMUM: { feature: string; operator: '>='; bound: number };
  };
  riskBlockers: {
    features: readonly string[];
    requiredStatus: 'available';
    requiredValue: false;
    unavailableBehavior: 'insufficient_data';
    oneRulePerRequiredBlockingFeature: true;
  };
  requiredDataPrecedence: typeof NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE;
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
};

export function canonicalCommonGate(): CanonicalCommonGate {
  return {
    commonGateVersion: COMMON_GATE_VERSION,
    requiredFeatures: [...COMMON_GATE_REQUIRED_FEATURES],
    comparisons: {
      PRICE_POSITIVE: {
        feature: 'market_price_usd',
        operator: '>',
        bound: MIN_PRICE_USD_EXCLUSIVE,
      },
      LIQUIDITY_MINIMUM: {
        feature: 'market_liquidity_usd',
        operator: '>=',
        bound: MIN_LIQUIDITY_USD,
      },
      PAIR_AGE_RANGE: {
        feature: 'pair_age_seconds',
        minOperator: '>=',
        min: MIN_PAIR_AGE_SECONDS,
        maxOperator: '<=',
        max: MAX_PAIR_AGE_SECONDS,
      },
      MARKET_FRESHNESS: {
        feature: 'market_age_seconds',
        minOperator: '>=',
        min: 0,
        maxOperator: '<=',
        max: MAX_MARKET_AGE_SECONDS,
      },
      TRADES_5M_MINIMUM: {
        feature: 'trades_5m',
        operator: '>=',
        bound: MIN_TRADES_5M,
      },
    },
    riskBlockers: {
      features: [...BLOCKING_RISK_FEATURES],
      requiredStatus: 'available',
      requiredValue: false,
      unavailableBehavior: 'insufficient_data',
      oneRulePerRequiredBlockingFeature: true,
    },
    requiredDataPrecedence: NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE,
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
  };
}

export function evaluateCommonMarketRiskGate(vector: FeatureVector): ResearchRuleEvidence[] {
  return [
    evaluateExclusiveMinimum(vector, 'PRICE_POSITIVE', 'market_price_usd', MIN_PRICE_USD_EXCLUSIVE, {
      pass: 'market_price_usd is strictly positive.',
      fail: 'market_price_usd is not greater than 0.',
    }),
    evaluateInclusiveMinimum(vector, 'LIQUIDITY_MINIMUM', 'market_liquidity_usd', MIN_LIQUIDITY_USD, {
      pass: 'Selected pair USD liquidity meets the common research gate minimum.',
      fail: `Selected pair USD liquidity is below ${String(MIN_LIQUIDITY_USD)}.`,
    }),
    evaluateInclusiveRange(
      vector,
      'PAIR_AGE_RANGE',
      'pair_age_seconds',
      MIN_PAIR_AGE_SECONDS,
      MAX_PAIR_AGE_SECONDS,
      {
        pass: 'DEX pair age is inside the common research gate window.',
        fail: 'DEX pair age is outside the common research gate window.',
      },
    ),
    evaluateInclusiveRange(
      vector,
      'MARKET_FRESHNESS',
      'market_age_seconds',
      0,
      MAX_MARKET_AGE_SECONDS,
      {
        pass: 'Current market observation is fresh enough for the common research gate.',
        fail: 'Current market observation is older than the common research gate freshness window.',
      },
    ),
    evaluateInclusiveMinimum(vector, 'TRADES_5M_MINIMUM', 'trades_5m', MIN_TRADES_5M, {
      pass: 'Observed 5-minute pair trade count meets the common research gate minimum.',
      fail: `Observed 5-minute pair trade count is below ${String(MIN_TRADES_5M)}.`,
    }),
    ...evaluateBlockingRiskFindings(vector),
  ];
}

export function decisionFromResearchRules(rules: readonly ResearchRuleEvidence[]): ResearchDecision {
  if (rules.some((rule) => rule.status === 'unavailable')) {
    return 'insufficient_data';
  }
  if (rules.some((rule) => rule.status === 'fail')) {
    return 'no_entry';
  }
  return 'entry_candidate';
}

export function evaluateExclusiveMinimum(
  vector: FeatureVector,
  code: string,
  name: FeatureName,
  minimumExclusive: number,
  copy: { pass: string; fail: string },
): ResearchRuleEvidence {
  const feature = readResearchFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableEvidence(code, feature);
  }

  const value = requireAvailableNumber(feature);
  if (value > minimumExclusive) {
    return { code, status: 'pass', observed: String(value), reason: copy.pass };
  }

  return { code, status: 'fail', observed: String(value), reason: copy.fail };
}

export function evaluateInclusiveMinimum(
  vector: FeatureVector,
  code: string,
  name: FeatureName,
  minimumInclusive: number,
  copy: { pass: string; fail: string },
): ResearchRuleEvidence {
  const feature = readResearchFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableEvidence(code, feature);
  }

  const value = requireAvailableNumber(feature);
  if (value >= minimumInclusive) {
    return { code, status: 'pass', observed: String(value), reason: copy.pass };
  }

  return { code, status: 'fail', observed: String(value), reason: copy.fail };
}

export function evaluateInclusiveRange(
  vector: FeatureVector,
  code: string,
  name: FeatureName,
  minimumInclusive: number,
  maximumInclusive: number,
  copy: { pass: string; fail: string },
): ResearchRuleEvidence {
  const feature = readResearchFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableEvidence(code, feature);
  }

  const value = requireAvailableNumber(feature);
  if (value >= minimumInclusive && value <= maximumInclusive) {
    return { code, status: 'pass', observed: String(value), reason: copy.pass };
  }

  return { code, status: 'fail', observed: String(value), reason: copy.fail };
}

function evaluateBlockingRiskFindings(vector: FeatureVector): ResearchRuleEvidence[] {
  return BLOCKING_RISK_FEATURES.map((name) => evaluateRequiredBlockingRiskFalse(vector, name));
}

function evaluateRequiredBlockingRiskFalse(
  vector: FeatureVector,
  name: (typeof BLOCKING_RISK_FEATURES)[number],
): ResearchRuleEvidence {
  const code = `RISK_BLOCKER_${name}`;
  const feature = readResearchFeature(vector, name);
  if (feature.status === 'unavailable') {
    return unavailableEvidence(code, feature);
  }

  const value = requireAvailableBoolean(feature);
  if (value) {
    return {
      code,
      status: 'fail',
      observed: 'true',
      reason: `Required blocking risk feature ${name} is true.`,
    };
  }

  return {
    code,
    status: 'pass',
    observed: 'false',
    reason: `Required blocking risk feature ${name} is available and false.`,
  };
}

function readResearchFeature(vector: FeatureVector, name: FeatureName): FeatureValue {
  try {
    requireFeatureDefinition(name);
    return readFeature(vector, name);
  } catch (error: unknown) {
    if (error instanceof StrategyError) {
      throw new ResearchError(error.message, { cause: error });
    }
    throw error;
  }
}

function requireAvailableNumber(feature: FeatureValue): number {
  if (typeof feature.value !== 'number' || !Number.isFinite(feature.value)) {
    throw new ResearchError(`Available feature ${feature.name} is not a finite number.`);
  }
  if (feature.kind === 'integer' && !Number.isSafeInteger(feature.value)) {
    throw new ResearchError(`Available feature ${feature.name} is not a safe integer.`);
  }
  return feature.value;
}

function requireAvailableBoolean(feature: FeatureValue): boolean {
  if (typeof feature.value !== 'boolean') {
    throw new ResearchError(`Available feature ${feature.name} is not a boolean.`);
  }
  return feature.value;
}

function unavailableEvidence(code: string, feature: FeatureValue): ResearchRuleEvidence {
  return {
    code,
    status: 'unavailable',
    observed: 'unavailable',
    reason: feature.unavailableReason ?? 'feature unavailable',
  };
}
