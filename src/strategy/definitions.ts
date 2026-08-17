import { STRATEGY_RULE_CODES, type StrategyRuleDefinition } from './types.js';
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

export const STRATEGY_RULE_DEFINITIONS: readonly StrategyRuleDefinition[] = [
  {
    code: 'PRICE_POSITIVE',
    category: 'market_quality',
    description: 'Requested-token USD price must be strictly positive.',
    criterion: `market_price_usd > ${String(MIN_PRICE_USD_EXCLUSIVE)}`,
    featureNames: ['market_price_usd'],
  },
  {
    code: 'LIQUIDITY_MINIMUM',
    category: 'market_quality',
    description: 'Selected DEX pair USD liquidity must meet the s07_v1 minimum.',
    criterion: `market_liquidity_usd >= ${String(MIN_LIQUIDITY_USD)}`,
    featureNames: ['market_liquidity_usd'],
  },
  {
    code: 'PAIR_AGE_RANGE',
    category: 'data_quality',
    description: 'DEX pair age must be between 15 minutes and 7 days inclusive. This is not token or mint age.',
    criterion: `${String(MIN_PAIR_AGE_SECONDS)} <= pair_age_seconds <= ${String(MAX_PAIR_AGE_SECONDS)}`,
    featureNames: ['pair_age_seconds'],
  },
  {
    code: 'MARKET_FRESHNESS',
    category: 'data_quality',
    description: 'The current market observation must be no older than 120 seconds at asOf.',
    criterion: `0 <= market_age_seconds <= ${String(MAX_MARKET_AGE_SECONDS)}`,
    featureNames: ['market_age_seconds'],
  },
  {
    code: 'TRADES_5M_MINIMUM',
    category: 'activity',
    description: 'Observed 5-minute pair trade count (provider buys + sells) must meet the minimum.',
    criterion: `trades_5m >= ${String(MIN_TRADES_5M)}`,
    featureNames: ['trades_5m'],
  },
  {
    code: 'VOLUME_LIQUIDITY_5M_MINIMUM',
    category: 'activity',
    description: '5-minute pair USD volume relative to pair USD liquidity must meet the minimum. No upper bound.',
    criterion: `volume_to_liquidity_5m_ratio >= ${String(MIN_VOLUME_TO_LIQUIDITY_5M_RATIO)}`,
    featureNames: ['volume_to_liquidity_5m_ratio'],
  },
  {
    code: 'BUY_SHARE_5M_MINIMUM',
    category: 'flow',
    description: 'At least 55.00% of observed 5-minute trades must be provider-classified buys. This is a trade-count share, not USD volume.',
    criterion: `buy_share_5m_bps >= ${String(MIN_BUY_SHARE_5M_BPS)}`,
    featureNames: ['buy_share_5m_bps'],
  },
  {
    code: 'NET_BUYS_5M_MINIMUM',
    category: 'flow',
    description: 'Observed 5-minute net buy count (buys - sells) must meet the minimum. This is not USD order flow.',
    criterion: `net_buys_5m >= ${String(MIN_NET_BUYS_5M)}`,
    featureNames: ['net_buys_5m'],
  },
  {
    code: 'PRICE_CHANGE_5M_RANGE',
    category: 'momentum',
    description: 'Provider-observed 5-minute price change must be positive but not extreme. This does not guarantee continuation.',
    criterion: `${String(MIN_PRICE_CHANGE_5M_PCT)} <= market_price_change_5m_pct <= ${String(MAX_PRICE_CHANGE_5M_PCT)}`,
    featureNames: ['market_price_change_5m_pct'],
  },
  {
    code: 'NO_BLOCKING_RISK_FINDINGS',
    category: 'risk',
    description:
      'Selected Checkpoint 05 high-confidence structural findings must be available and absent. Token-2022 itself is not a blocker. Transfer-fee configuration is excluded because s07_v1 does not model transfer-fee execution effects.',
    criterion: `${BLOCKING_RISK_FEATURES.join(' = false AND ')} = false`,
    featureNames: BLOCKING_RISK_FEATURES,
  },
];

export const STRATEGY_REQUIRED_FEATURE_NAMES = [
  ...new Set(STRATEGY_RULE_DEFINITIONS.flatMap((definition) => definition.featureNames)),
];

export function strategyRuleRegistrySize(): number {
  return STRATEGY_RULE_DEFINITIONS.length;
}

export function requireStrategyRuleDefinition(code: (typeof STRATEGY_RULE_CODES)[number]) {
  const definition = STRATEGY_RULE_DEFINITIONS.find((item) => item.code === code);
  if (definition === undefined) {
    throw new Error(`Unknown strategy rule: ${code}`);
  }
  return definition;
}
