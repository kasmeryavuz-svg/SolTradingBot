import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import type { FeatureInputs, FeatureName, FeatureValue, FeatureVector } from '../src/features/index.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import type { TokenRiskReport } from '../src/risk/types.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import type { StrategyEvaluation } from '../src/strategy/types.js';
import {
  FEATURE_AS_OF,
  T_09_00,
  T_09_30,
  T_09_55,
  T_10_00,
  featureInputs,
  previousSnapshot,
  sampleRisk,
  sampleSnapshot,
  sampleVector,
} from './feature-fixtures.js';

export const STRATEGY_COLLECTED_AT = '2026-08-17T09:59:55.000Z';
export const STRATEGY_EVALUATED_AT = T_10_00;

export function passingSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return sampleSnapshot({
    priceUsd: 0.001,
    liquidityUsd: 100_000,
    volume5mUsd: 20_000,
    buys5m: 60,
    sells5m: 40,
    priceChange5mPct: 5,
    pairCreatedAt: T_09_00,
    collectedAt: STRATEGY_COLLECTED_AT,
    ...overrides,
  });
}

export function passingRisk(overrides: Partial<TokenRiskReport> = {}): TokenRiskReport {
  return sampleRisk({
    scannedAt: T_09_55,
    findings: [],
    highestFindingSeverity: 'none',
    ...overrides,
  });
}

export function passingInputs(overrides: Partial<FeatureInputs> = {}): FeatureInputs {
  return featureInputs({
    market: passingSnapshot(),
    previousMarket: previousSnapshot({ collectedAt: T_09_30 }),
    risk: passingRisk(),
    riskUnavailableReason: null,
    asOf: FEATURE_AS_OF,
    ...overrides,
  });
}

export function passingVector(
  overrides: Partial<FeatureInputs> = {},
  options: { generatedAt?: string } = {},
): FeatureVector {
  const inputs = passingInputs(overrides);
  return sampleVector(inputs, { generatedAt: options.generatedAt ?? inputs.asOf });
}

export function evaluatePassing(
  overrides: Partial<FeatureInputs> = {},
  evaluatedAt: string = STRATEGY_EVALUATED_AT,
): StrategyEvaluation {
  return evaluateStrategy(passingVector(overrides), { evaluatedAt });
}

export function withFeatureValue(
  vector: FeatureVector,
  name: FeatureName,
  patch: Partial<FeatureValue>,
): FeatureVector {
  const values = vector.values.map((value) => (value.name === name ? { ...value, ...patch } : value));
  const availableFeatureCount = values.filter((value) => value.status === 'available').length;
  const unavailableFeatureCount = values.length - availableFeatureCount;
  return {
    ...vector,
    values,
    availableFeatureCount,
    unavailableFeatureCount,
    featureCompleteness: unavailableFeatureCount === 0 ? 'complete' : 'partial',
  };
}

export function withAvailableNumber(vector: FeatureVector, name: FeatureName, value: number): FeatureVector {
  return withFeatureValue(vector, name, {
    status: 'available',
    value,
    unavailableReason: null,
  });
}

export function withAvailableBoolean(vector: FeatureVector, name: FeatureName, value: boolean): FeatureVector {
  return withFeatureValue(vector, name, {
    status: 'available',
    value,
    unavailableReason: null,
  });
}

export function withUnavailable(
  vector: FeatureVector,
  name: FeatureName,
  reason = 'test unavailable',
): FeatureVector {
  return withFeatureValue(vector, name, {
    status: 'unavailable',
    value: null,
    unavailableReason: reason,
  });
}

export function passingBundle(overrides: {
  marketSnapshot?: MarketSnapshot;
  riskReport?: TokenRiskReport | null;
  featureVector?: FeatureVector;
  strategyEvaluation?: StrategyEvaluation;
} = {}) {
  const marketSnapshot = overrides.marketSnapshot ?? passingSnapshot();
  const riskReport = overrides.riskReport === undefined ? passingRisk() : overrides.riskReport;
  const featureVector =
    overrides.featureVector ??
    passingVector({
      market: marketSnapshot,
      risk: riskReport,
      previousMarket: null,
    });
  const strategyEvaluation =
    overrides.strategyEvaluation ??
    evaluateStrategy(featureVector, { evaluatedAt: featureVector.generatedAt });

  return {
    marketSnapshot,
    riskReport,
    featureVector,
    strategyEvaluation,
  };
}

export { T_09_00, T_09_30, T_09_55, T_10_00, USDC_MINT, WRAPPED_SOL_MINT };
