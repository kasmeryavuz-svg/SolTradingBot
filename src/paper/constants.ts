import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { REQUIRED_FEATURE_SET_VERSION, STRATEGY_VERSION } from '../strategy/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';

export const PAPER_SPEC_VERSION = 'p09_v1';
export const PAPER_SPEC_NAME = 'live_reference_price_entry_observation';
export const REQUIRED_PAPER_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_PAPER_STRATEGY_VERSION = STRATEGY_VERSION;
export const REQUIRED_PAPER_STRATEGY_FEATURE_SET = REQUIRED_FEATURE_SET_VERSION;
export const PAPER_EXECUTION_MODEL = 'exact_strategy_market_snapshot_reference_price' as const;
export const PAPER_COST_MODEL = 'none' as const;
export const PAPER_QUANTITY_MODEL = 'none' as const;
export const PAPER_POSITION_MODEL = 'none' as const;
export const PAPER_EXIT_MODEL = 'none' as const;
export const PAPER_HISTORY_LIMIT_MAX = 100;

export const FROZEN_S07_V1_DEFINITION_FINGERPRINT =
  'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd';

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 09 requires the frozen s07_v1 strategy definition fingerprint.');
}

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== 'c06_v1') {
  throw new Error('Checkpoint 09 requires feature set c06_v1.');
}

const requiredStrategy: string = STRATEGY_VERSION;
if (requiredStrategy !== 's07_v1') {
  throw new Error('Checkpoint 09 requires strategy s07_v1.');
}
