import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { EXIT_SPEC_VERSION } from '../exit/constants.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PAPER_SPEC_VERSION } from '../paper/constants.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../performance/identity.js';
import { PERFORMANCE_SPEC_VERSION } from '../performance/constants.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_SPEC_VERSION } from '../position/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import { STRATEGY_VERSION } from '../strategy/constants.js';

export const RESEARCH_SPEC_VERSION = 'r125_v1';
export const RESEARCH_SPEC_NAME = 'fixed_candidate_historical_strategy_benchmark_lab';

export const REQUIRED_RESEARCH_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_RESEARCH_STRATEGY_VERSION = STRATEGY_VERSION;
export const REQUIRED_RESEARCH_PAPER_SPEC_VERSION = PAPER_SPEC_VERSION;
export const REQUIRED_RESEARCH_POSITION_SPEC_VERSION = POSITION_SPEC_VERSION;
export const REQUIRED_RESEARCH_EXIT_SPEC_VERSION = EXIT_SPEC_VERSION;
export const REQUIRED_RESEARCH_PERFORMANCE_SPEC_VERSION = PERFORMANCE_SPEC_VERSION;

export const REQUIRED_SCHEMA_VERSION = 7;
export const RESEARCH_TRADE_LIMIT_MAX = 100;
export const RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD = POSITION_ENTRY_NOTIONAL_USD;

export const COMMON_GATE_VERSION = 'r125_common_gate_v1';
export const NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE = 'unavailable_over_fail' as const;
export const S07_BASELINE_DECISION_PRECEDENCE = 'frozen_s07_fail_over_unavailable' as const;
export const SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE =
  'first_sorted_event_only_may_mutate_lifecycle' as const;

export const SLICE_EARLY_ELAPSED_FRACTION = 0.6;
export const SLICE_MIDDLE_ELAPSED_FRACTION = 0.2;
export const SLICE_LATE_ELAPSED_FRACTION = 0.2;

export const FLOW_CONFIRMED_BUY_SHARE_1H_BPS_EXCLUSIVE = 5_000;
export const FLOW_CONFIRMED_NET_BUYS_1H_EXCLUSIVE = 0;
export const TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE = 0;

export const FROZEN_C06_V1_FEATURE_SET_VERSION = 'c06_v1';
export const FROZEN_S07_V1_DEFINITION_FINGERPRINT =
  'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd';
export const FROZEN_B08_V1_DEFINITION_FINGERPRINT =
  '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf';
export const FROZEN_P09_V1_DEFINITION_FINGERPRINT =
  '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0';
export const FROZEN_PM10_V1_DEFINITION_FINGERPRINT =
  '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f';
export const FROZEN_X11_V1_DEFINITION_FINGERPRINT =
  '4678a49e73cab2f0076e376506910761f4afcabdcdee4fe3c9830c2395c2e6e6';
export const FROZEN_A12_V1_DEFINITION_FINGERPRINT =
  '9fe2b033c19d5470b972714cc37d32333ac4662ad8d30cdd97b668891454e53c';

export const REQUIRED_TABLES = [
  'tokens',
  'market_snapshots',
  'risk_scans',
  'risk_findings',
  'exit_evaluations',
] as const;

export const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], readonly string[]> = {
  tokens: ['id', 'mint'],
  market_snapshots: [
    'id',
    'token_id',
    'token_name',
    'token_symbol',
    'dex_id',
    'pair_address',
    'quote_token_mint',
    'quote_token_symbol',
    'price_usd',
    'liquidity_usd',
    'volume_5m_usd',
    'volume_1h_usd',
    'volume_24h_usd',
    'buys_5m',
    'sells_5m',
    'buys_1h',
    'sells_1h',
    'price_change_5m_pct',
    'price_change_1h_pct',
    'price_change_24h_pct',
    'market_cap_usd',
    'fdv_usd',
    'pair_created_at',
    'collected_at',
  ],
  risk_scans: [
    'id',
    'token_id',
    'scanned_at',
    'token_program',
    'data_completeness',
    'top1_bps',
    'top5_bps',
    'top10_bps',
    'top20_bps',
    'largest_accounts_count',
  ],
  risk_findings: ['scan_id', 'code', 'category', 'severity', 'confidence', 'title', 'description'],
  exit_evaluations: ['id', 'market_snapshot_id'],
};

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== FROZEN_C06_V1_FEATURE_SET_VERSION) {
  throw new Error('Phase 12.5 requires feature set c06_v1.');
}

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Phase 12.5 requires the frozen s07_v1 strategy definition fingerprint.');
}

if (BACKTEST_DEFINITION_FINGERPRINT !== FROZEN_B08_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Phase 12.5 requires the frozen b08_v1 backtest definition fingerprint.');
}

if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Phase 12.5 requires the frozen p09_v1 paper definition fingerprint.');
}

if (POSITION_DEFINITION_FINGERPRINT !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Phase 12.5 requires the frozen pm10_v1 position definition fingerprint.');
}

if (EXIT_DEFINITION_FINGERPRINT !== FROZEN_X11_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Phase 12.5 requires the frozen x11_v1 exit definition fingerprint.');
}

if (PERFORMANCE_DEFINITION_FINGERPRINT !== FROZEN_A12_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Phase 12.5 requires the frozen a12_v1 performance definition fingerprint.');
}

const requiredStrategy: string = STRATEGY_VERSION;
if (requiredStrategy !== 's07_v1') {
  throw new Error('Phase 12.5 requires strategy s07_v1.');
}

const requiredPaper: string = PAPER_SPEC_VERSION;
if (requiredPaper !== 'p09_v1') {
  throw new Error('Phase 12.5 requires paper spec p09_v1.');
}

const requiredPosition: string = POSITION_SPEC_VERSION;
if (requiredPosition !== 'pm10_v1') {
  throw new Error('Phase 12.5 requires position spec pm10_v1.');
}

const requiredExit: string = EXIT_SPEC_VERSION;
if (requiredExit !== 'x11_v1') {
  throw new Error('Phase 12.5 requires exit spec x11_v1.');
}

const requiredPerformance: string = PERFORMANCE_SPEC_VERSION;
if (requiredPerformance !== 'a12_v1') {
  throw new Error('Phase 12.5 requires performance spec a12_v1.');
}

const requiredNotional: number = POSITION_ENTRY_NOTIONAL_USD;
if (requiredNotional !== 100) {
  throw new Error('Phase 12.5 requires the frozen $100 paper reference notional.');
}

if (
  SLICE_EARLY_ELAPSED_FRACTION + SLICE_MIDDLE_ELAPSED_FRACTION + SLICE_LATE_ELAPSED_FRACTION !==
  1
) {
  throw new Error('Phase 12.5 chronological slice fractions must sum to 1.');
}
