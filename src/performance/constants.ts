import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { BACKTEST_SPEC_VERSION } from '../backtest/constants.js';
import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { EXIT_SPEC_VERSION } from '../exit/constants.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PAPER_SPEC_VERSION } from '../paper/constants.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_SPEC_VERSION } from '../position/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import { STRATEGY_VERSION } from '../strategy/constants.js';

export const PERFORMANCE_SPEC_VERSION = 'a12_v1';
export const PERFORMANCE_SPEC_NAME = 'gross_closed_paper_trade_analytics';

export const REQUIRED_PERFORMANCE_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_PERFORMANCE_STRATEGY_VERSION = STRATEGY_VERSION;
export const REQUIRED_PERFORMANCE_PAPER_SPEC_VERSION = PAPER_SPEC_VERSION;
export const REQUIRED_PERFORMANCE_POSITION_SPEC_VERSION = POSITION_SPEC_VERSION;
export const REQUIRED_PERFORMANCE_EXIT_SPEC_VERSION = EXIT_SPEC_VERSION;
export const REQUIRED_PERFORMANCE_BACKTEST_SPEC_VERSION = BACKTEST_SPEC_VERSION;

export const REQUIRED_SCHEMA_VERSION = 7;
export const PERFORMANCE_TRADE_LIMIT_MAX = 100;
export const ENTRY_REFERENCE_NOTIONAL_USD = POSITION_ENTRY_NOTIONAL_USD;

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

export const REQUIRED_TABLES = [
  'tokens',
  'market_snapshots',
  'strategy_evaluations',
  'paper_evaluations',
  'position_evaluations',
  'paper_positions',
  'paper_open_positions',
  'exit_evaluations',
  'paper_position_exits',
] as const;

export const REQUIRED_COLUMNS: Record<(typeof REQUIRED_TABLES)[number], readonly string[]> = {
  tokens: ['id', 'mint'],
  market_snapshots: ['id', 'token_id', 'pair_address', 'price_usd', 'collected_at'],
  strategy_evaluations: [
    'id',
    'token_id',
    'strategy_version',
    'strategy_definition_fingerprint',
    'feature_set_version',
    'source_identity',
    'decision',
    'evaluated_at',
    'as_of',
  ],
  paper_evaluations: [
    'id',
    'token_id',
    'strategy_evaluation_id',
    'paper_spec_version',
    'paper_definition_fingerprint',
    'strategy_definition_fingerprint',
    'feature_set_version',
    'pair_address',
    'source_identity',
    'paper_action',
    'strategy_decision',
    'simulated_entry_price_usd',
    'reference_price_usd',
    'evaluated_at',
    'as_of',
    'market_collected_at',
  ],
  position_evaluations: [
    'id',
    'token_id',
    'paper_evaluation_id',
    'position_action',
    'position_source_identity',
    'source_identity',
    'paper_action',
    'prior_open_position_id',
    'prior_open_position_source_identity',
    'entry_price_usd',
    'entry_notional_usd',
    'quantity_tokens',
    'position_spec_version',
    'position_definition_fingerprint',
  ],
  paper_positions: [
    'id',
    'token_id',
    'pair_address',
    'opened_at',
    'entry_market_collected_at',
    'entry_price_usd',
    'entry_notional_usd',
    'quantity_tokens',
    'position_spec_version',
    'position_definition_fingerprint',
    'source_identity',
    'opening_paper_source_identity',
    'opening_paper_evaluation_id',
    'position_evaluation_id',
  ],
  paper_open_positions: ['token_id', 'position_id'],
  exit_evaluations: [
    'id',
    'token_id',
    'position_id',
    'market_snapshot_id',
    'exit_spec_version',
    'exit_definition_fingerprint',
    'position_definition_fingerprint',
    'position_source_identity',
    'pair_address',
    'exit_action',
    'exit_reason',
    'simulated_exit_price_usd',
    'closed_quantity_tokens',
    'observed_price_usd',
    'entry_price_usd',
    'stop_trigger_price_usd',
    'take_profit_trigger_price_usd',
    'holding_age_ms',
    'max_holding_ms',
    'market_collected_at',
    'evaluated_at',
    'as_of',
    'source_identity',
  ],
  paper_position_exits: [
    'id',
    'token_id',
    'position_id',
    'exit_evaluation_id',
    'exit_spec_version',
    'exit_definition_fingerprint',
    'position_definition_fingerprint',
    'pair_address',
    'exited_at',
    'exit_market_collected_at',
    'exit_price_usd',
    'quantity_tokens',
    'closing_position_source_identity',
    'source_identity',
  ],
};

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== FROZEN_C06_V1_FEATURE_SET_VERSION) {
  throw new Error('Checkpoint 12 requires feature set c06_v1.');
}

const requiredStrategy: string = STRATEGY_VERSION;
if (requiredStrategy !== 's07_v1') {
  throw new Error('Checkpoint 12 requires strategy s07_v1.');
}

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 12 requires the frozen s07_v1 strategy definition fingerprint.');
}

const requiredBacktest: string = BACKTEST_SPEC_VERSION;
if (requiredBacktest !== 'b08_v1') {
  throw new Error('Checkpoint 12 requires backtest spec b08_v1.');
}

if (BACKTEST_DEFINITION_FINGERPRINT !== FROZEN_B08_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 12 requires the frozen b08_v1 backtest definition fingerprint.');
}

const requiredPaper: string = PAPER_SPEC_VERSION;
if (requiredPaper !== 'p09_v1') {
  throw new Error('Checkpoint 12 requires paper spec p09_v1.');
}

if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 12 requires the frozen p09_v1 paper definition fingerprint.');
}

const requiredPosition: string = POSITION_SPEC_VERSION;
if (requiredPosition !== 'pm10_v1') {
  throw new Error('Checkpoint 12 requires position spec pm10_v1.');
}

if (POSITION_DEFINITION_FINGERPRINT !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 12 requires the frozen pm10_v1 position definition fingerprint.');
}

const requiredExit: string = EXIT_SPEC_VERSION;
if (requiredExit !== 'x11_v1') {
  throw new Error('Checkpoint 12 requires exit spec x11_v1.');
}

if (EXIT_DEFINITION_FINGERPRINT !== FROZEN_X11_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 12 requires the frozen x11_v1 exit definition fingerprint.');
}

const requiredNotional: number = ENTRY_REFERENCE_NOTIONAL_USD;
if (requiredNotional !== 100) {
  throw new Error('Checkpoint 12 requires the frozen $100 paper reference notional.');
}
