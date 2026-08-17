import { FEATURE_SET_VERSION } from '../features/definitions.js';
import type { FeatureName } from '../features/definitions.js';

export const STRATEGY_VERSION = 's07_v1';
export const STRATEGY_NAME = 'conservative_flow_momentum_baseline';
export const REQUIRED_FEATURE_SET_VERSION = FEATURE_SET_VERSION;

export const MIN_PRICE_USD_EXCLUSIVE = 0;
export const MIN_LIQUIDITY_USD = 50_000;
export const MIN_PAIR_AGE_SECONDS = 900;
export const MAX_PAIR_AGE_SECONDS = 604_800;
export const MAX_MARKET_AGE_SECONDS = 120;
export const MIN_TRADES_5M = 20;
export const MIN_VOLUME_TO_LIQUIDITY_5M_RATIO = 0.05;
export const MIN_BUY_SHARE_5M_BPS = 5_500;
export const MIN_NET_BUYS_5M = 5;
export const MIN_PRICE_CHANGE_5M_PCT = 1;
export const MAX_PRICE_CHANGE_5M_PCT = 20;

export const STRATEGY_THRESHOLDS = {
  MIN_PRICE_USD_EXCLUSIVE,
  MIN_LIQUIDITY_USD,
  MIN_PAIR_AGE_SECONDS,
  MAX_PAIR_AGE_SECONDS,
  MAX_MARKET_AGE_SECONDS,
  MIN_TRADES_5M,
  MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
  MIN_BUY_SHARE_5M_BPS,
  MIN_NET_BUYS_5M,
  MIN_PRICE_CHANGE_5M_PCT,
  MAX_PRICE_CHANGE_5M_PCT,
} as const;

export const BLOCKING_RISK_FEATURES = [
  'risk_finding_mint_authority_active',
  'risk_finding_freeze_authority_active',
  'risk_finding_permanent_delegate_active',
  'risk_finding_non_transferable',
  'risk_finding_transfer_hook_active',
  'risk_finding_default_account_state_frozen',
  'risk_finding_transfer_fee_configured',
] as const satisfies readonly FeatureName[];
