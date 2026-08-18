import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { EXIT_SPEC_VERSION } from '../exit/constants.js';
import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../performance/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_QUANTITY_FORMULA } from '../position/constants.js';
import {
  FROZEN_A12_V1_DEFINITION_FINGERPRINT,
  FROZEN_B08_V1_DEFINITION_FINGERPRINT,
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  RESEARCH_SPEC_VERSION,
} from '../research/constants.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../research/identity.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';

export const OPTIMIZATION_SPEC_VERSION = 'o17_v1';
export const OPTIMIZATION_SPEC_NAME = 'anchored_walk_forward_cost_stress_strategy_optimizer';
export const OPTIMIZATION_CHECKPOINT = '17';

export const COST_SPEC_VERSION = 'cost17_v1';
export const COST_SPEC_NAME = 'all_in_research_price_friction_scenarios';

export const REQUIRED_OPTIMIZATION_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_OPTIMIZATION_RESEARCH_SPEC_VERSION = RESEARCH_SPEC_VERSION;
export const REQUIRED_OPTIMIZATION_EXIT_SPEC_VERSION = EXIT_SPEC_VERSION;
export const REQUIRED_SCHEMA_VERSION = 8;
export const FORBIDDEN_MIGRATION_009_NAME = '009';

export const OPTIMIZATION_ENTRY_REFERENCE_NOTIONAL_USD = POSITION_ENTRY_NOTIONAL_USD;
export const OPTIMIZATION_QUANTITY_FORMULA = POSITION_QUANTITY_FORMULA;

export const MAX_OPTIMIZATION_HOLD_MS = 24 * 60 * 60 * 1000;
export const CHRONOLOGICAL_SEGMENT_COUNT = 6;
export const WALK_FORWARD_FOLD_COUNT = 4;
export const ENTRY_CANDIDATE_COUNT = 8;
export const EXIT_CANDIDATE_COUNT = 5;
export const COMBINED_THEORETICAL_PAIRS = ENTRY_CANDIDATE_COUNT * EXIT_CANDIDATE_COUNT;

export const TRAIN_MIN_COMPLETED_TRADES = 20;
export const TRAIN_MAX_CENSORED_FRACTION = 0.35;

export const OOS_MIN_AGGREGATE_COMPLETED_TRADES = 40;
export const OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD = 5;
export const OOS_MAX_AGGREGATE_CENSORED_FRACTION = 0.25;

export const PROMOTION_MIN_BASE_PROFIT_FACTOR = 1.1;
export const PROMOTION_MAX_BASE_DRAWDOWN_PCT = 20;
export const PROMOTION_MIN_POSITIVE_BASE_EXPECTANCY_FOLDS = 3;
export const PROMOTION_MAX_TOP1_CONCENTRATION_PCT = 40;
export const PROMOTION_MAX_TOP3_CONCENTRATION_PCT = 70;

export const BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED_TRADES = OOS_MIN_AGGREGATE_COMPLETED_TRADES;
export const BASELINE_COMPARABLE_MIN_COMPLETED_TRADES_PER_TEST_FOLD = OOS_MIN_COMPLETED_TRADES_PER_TEST_FOLD;

export const DRAWDOWN_PCT_DENOMINATOR = 'peak_cumulative_completed_net_pnl_usd' as const;
export const CENSORED_FRACTION_NUMERATOR = 'unresolved_plus_partially_realized_censored' as const;
export const CENSORED_FRACTION_DENOMINATOR = 'opened_positions' as const;
export const PARTIAL_CENSORED_RANKING_POLICY = 'excluded_from_completed_trade_ranking_and_promotion' as const;
export const SEGMENT_BOUNDARY_CONSTRUCTION = 'integer_ms_span_divmod_6' as const;

export const COST_LOW_ENTRY_BPS = 75;
export const COST_LOW_EXIT_BPS = 75;
export const COST_BASE_ENTRY_BPS = 200;
export const COST_BASE_EXIT_BPS = 200;
export const COST_STRESS_ENTRY_BPS = 500;
export const COST_STRESS_EXIT_BPS = 500;

export const QUALITY_LIQUID_MIN_LIQUIDITY_USD = 100_000;
export const QUALITY_LIQUID_MIN_PAIR_AGE_SECONDS = 1_800;
export const QUALITY_LIQUID_MAX_PAIR_AGE_SECONDS = 604_800;
export const QUALITY_LIQUID_MIN_TRADES_5M = 30;

export const FLOW_QUALITY_MIN_LIQUIDITY_USD = 100_000;
export const FLOW_QUALITY_MIN_PAIR_AGE_SECONDS = 900;
export const FLOW_QUALITY_MAX_PAIR_AGE_SECONDS = 604_800;
export const FLOW_QUALITY_MIN_MARKET_AGE_SECONDS = 0;
export const FLOW_QUALITY_MAX_MARKET_AGE_SECONDS = 120;
export const FLOW_QUALITY_MIN_TRADES_5M = 30;
export const FLOW_QUALITY_MIN_VOLUME_TO_LIQUIDITY_5M = 0.075;
export const FLOW_QUALITY_MIN_BUY_SHARE_5M_BPS = 6_000;
export const FLOW_QUALITY_MIN_NET_BUYS_5M = 10;
export const FLOW_QUALITY_MIN_PRICE_CHANGE_5M_PCT = 1;
export const FLOW_QUALITY_MAX_PRICE_CHANGE_5M_PCT = 15;
export const FLOW_QUALITY_BUY_SHARE_1H_BPS_EXCLUSIVE = 5_000;
export const FLOW_QUALITY_NET_BUYS_1H_EXCLUSIVE = 0;

export const RUNNER_FLOW_MIN_LIQUIDITY_USD = 100_000;
export const RUNNER_FLOW_MIN_PAIR_AGE_SECONDS = 900;
export const RUNNER_FLOW_MAX_PAIR_AGE_SECONDS = 604_800;
export const RUNNER_FLOW_MIN_MARKET_AGE_SECONDS = 0;
export const RUNNER_FLOW_MAX_MARKET_AGE_SECONDS = 120;
export const RUNNER_FLOW_MIN_TRADES_5M = 30;
export const RUNNER_FLOW_MIN_VOLUME_TO_LIQUIDITY_5M = 0.1;
export const RUNNER_FLOW_MIN_BUY_SHARE_5M_BPS = 6_000;
export const RUNNER_FLOW_MIN_NET_BUYS_5M = 10;
export const RUNNER_FLOW_MIN_PRICE_CHANGE_5M_PCT = 3;
export const RUNNER_FLOW_PRICE_CHANGE_1H_EXCLUSIVE = 0;

export const TIGHT_RISK_STOP_BPS = 700;
export const TIGHT_RISK_TAKE_BPS = 1_500;
export const TIGHT_RISK_MAX_HOLDING_MS = 4 * 60 * 60 * 1000;

export const WIDER_RUNNER_STOP_BPS = 1_200;
export const WIDER_RUNNER_TAKE_BPS = 4_000;
export const WIDER_RUNNER_MAX_HOLDING_MS = 12 * 60 * 60 * 1000;

export const PARTIAL_RUNNER_INITIAL_STOP_BPS = 1_000;
export const PARTIAL_RUNNER_TAKE_BPS = 2_000;
export const PARTIAL_RUNNER_CLOSE_FRACTION = 0.5;
export const PARTIAL_RUNNER_REMAINING_FRACTION = 0.5;
export const PARTIAL_RUNNER_TRAIL_BPS = 1_200;
export const PARTIAL_RUNNER_MAX_HOLDING_MS = 12 * 60 * 60 * 1000;

export const MOONBAG_INITIAL_STOP_BPS = 1_000;
export const MOONBAG_TAKE_BPS = 2_500;
export const MOONBAG_CLOSE_FRACTION = 0.67;
export const MOONBAG_REMAINING_FRACTION = 0.33;
export const MOONBAG_TRAIL_BPS = 2_000;
export const MOONBAG_MAX_HOLDING_MS = 24 * 60 * 60 * 1000;

export const SAME_TIMESTAMP_SAME_TOKEN_LIFECYCLE =
  'first_sorted_event_only_may_mutate_lifecycle' as const;

export const FROZEN_D13_V1_DEFINITION_FINGERPRINT =
  'd4a72c37b15c334171cbd0975cbb9534c3ca836f38923654e22e3685d02c5b18';
export const FROZEN_E14_V1_DEFINITION_FINGERPRINT =
  '6c9bf5bd42a6137b21b8ed2f4c8939085c7b999add2013efbf7d63a8fc306fd0';
export const FROZEN_W15_V1_DEFINITION_FINGERPRINT =
  '2caec72e3ea5fa2c141f9d00f689a23eadaa1f29b403605595abaf6e2d0a7855';
export const FROZEN_L16_V1_DEFINITION_FINGERPRINT =
  '57a6fc872f7e51f1e4b041ed5b93413efe0779dea61a88b9dc1b4ed9f05e395d';
export const FROZEN_R125_V1_DEFINITION_FINGERPRINT =
  '61f5a9d091ce9214e440dddf029f81bb881a907f4cd9193e04ecd3238c20a83a';

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== 'c06_v1') {
  throw new Error('Checkpoint 17 requires feature set c06_v1.');
}

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen s07_v1 strategy definition fingerprint.');
}

if (BACKTEST_DEFINITION_FINGERPRINT !== FROZEN_B08_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen b08_v1 backtest definition fingerprint.');
}

if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen p09_v1 paper definition fingerprint.');
}

if (POSITION_DEFINITION_FINGERPRINT !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen pm10_v1 position definition fingerprint.');
}

if (EXIT_DEFINITION_FINGERPRINT !== FROZEN_X11_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen x11_v1 exit definition fingerprint.');
}

if (PERFORMANCE_DEFINITION_FINGERPRINT !== FROZEN_A12_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen a12_v1 performance definition fingerprint.');
}

if (RESEARCH_DEFINITION_FINGERPRINT !== FROZEN_R125_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 17 requires the frozen r125_v1 research definition fingerprint.');
}

const requiredNotional: number = OPTIMIZATION_ENTRY_REFERENCE_NOTIONAL_USD;
if (requiredNotional !== 100) {
  throw new Error('Checkpoint 17 requires the frozen $100 paper reference notional.');
}

if (MAX_OPTIMIZATION_HOLD_MS !== 86_400_000) {
  throw new Error('Checkpoint 17 requires MAX_OPTIMIZATION_HOLD_MS of 24 hours.');
}

if (COMBINED_THEORETICAL_PAIRS !== 40) {
  throw new Error('Checkpoint 17 catalog must contain 8 entries and 5 exits.');
}
