import type { FeatureName } from '../features/definitions.js';

export class StrategyError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StrategyError';
  }
}

export const STRATEGY_DECISIONS = ['entry_candidate', 'no_entry', 'insufficient_data'] as const;
export const STRATEGY_RULE_STATUSES = ['pass', 'fail', 'unavailable'] as const;
export const STRATEGY_RULE_CATEGORIES = [
  'data_quality',
  'market_quality',
  'activity',
  'flow',
  'momentum',
  'risk',
] as const;

export type StrategyDecision = (typeof STRATEGY_DECISIONS)[number];
export type StrategyRuleStatus = (typeof STRATEGY_RULE_STATUSES)[number];
export type StrategyRuleCategory = (typeof STRATEGY_RULE_CATEGORIES)[number];

export const STRATEGY_RULE_CODES = [
  'PRICE_POSITIVE',
  'LIQUIDITY_MINIMUM',
  'PAIR_AGE_RANGE',
  'MARKET_FRESHNESS',
  'TRADES_5M_MINIMUM',
  'VOLUME_LIQUIDITY_5M_MINIMUM',
  'BUY_SHARE_5M_MINIMUM',
  'NET_BUYS_5M_MINIMUM',
  'PRICE_CHANGE_5M_RANGE',
  'NO_BLOCKING_RISK_FINDINGS',
] as const;

export type StrategyRuleCode = (typeof STRATEGY_RULE_CODES)[number];

export type StrategyRuleDefinition = {
  code: StrategyRuleCode;
  category: StrategyRuleCategory;
  description: string;
  criterion: string;
  featureNames: readonly FeatureName[];
};

export type StrategyRuleResult = {
  ordinal: number;
  ruleCode: StrategyRuleCode;
  category: StrategyRuleCategory;
  status: StrategyRuleStatus;
  description: string;
  criterion: string;
  observed: string;
  reason: string;
};

export type StrategyEvaluation = {
  chain: 'solana';
  tokenMint: string;
  strategyVersion: string;
  strategyName: string;
  strategyDefinitionFingerprint: string;
  featureSetVersion: string;
  featureSourceIdentity: string;
  evaluatedAt: string;
  asOf: string;
  decision: StrategyDecision;
  passedRuleCount: number;
  failedRuleCount: number;
  unavailableRuleCount: number;
  rules: StrategyRuleResult[];
};
