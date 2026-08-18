import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { REQUIRED_FEATURE_SET_VERSION, STRATEGY_VERSION } from '../strategy/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';

export const BACKTEST_SPEC_VERSION = 'b08_v1';
export const BACKTEST_SPEC_NAME = 'fixed_horizon_gross_price_outcome';
export const REQUIRED_BACKTEST_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_BACKTEST_STRATEGY_VERSION = STRATEGY_VERSION;
export const REQUIRED_BACKTEST_STRATEGY_FEATURE_SET = REQUIRED_FEATURE_SET_VERSION;

export const FORWARD_HORIZON_SECONDS = 900;
export const OUTCOME_MAX_DELAY_SECONDS = 120;
export const OUTCOME_WINDOW_END_SECONDS = FORWARD_HORIZON_SECONDS + OUTCOME_MAX_DELAY_SECONDS;

export const FROZEN_S07_V1_DEFINITION_FINGERPRINT =
  'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd';

export const REQUIRED_SCHEMA_VERSION = 4;
export const COMPATIBLE_SCHEMA_VERSIONS = [4, 5, 6, 7, 8, 9] as const;

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 08 requires the frozen s07_v1 strategy definition fingerprint.');
}

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== 'c06_v1') {
  throw new Error('Checkpoint 08 requires feature set c06_v1.');
}
