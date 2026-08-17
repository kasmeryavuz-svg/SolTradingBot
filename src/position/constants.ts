import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from '../paper/constants.js';
import { STRATEGY_VERSION } from '../strategy/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';

export const POSITION_SPEC_VERSION = 'pm10_v1';
export const POSITION_SPEC_NAME = 'single_open_position_fixed_usd_notional';
export const REQUIRED_POSITION_PAPER_SPEC_VERSION = PAPER_SPEC_VERSION;
export const REQUIRED_POSITION_PAPER_SPEC_NAME = PAPER_SPEC_NAME;
export const REQUIRED_POSITION_PAPER_DEFINITION_FINGERPRINT = PAPER_DEFINITION_FINGERPRINT;
export const REQUIRED_POSITION_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_POSITION_STRATEGY_VERSION = STRATEGY_VERSION;
export const POSITION_ENTRY_NOTIONAL_USD = 100;
export const POSITION_MAX_OPEN_PER_TOKEN = 1;
export const POSITION_QUANTITY_FORMULA = 'entryNotionalUsd / entryPriceUsd';
export const POSITION_HISTORY_LIMIT_MAX = 100;

export const FROZEN_S07_V1_DEFINITION_FINGERPRINT =
  'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd';
export const FROZEN_P09_V1_DEFINITION_FINGERPRINT =
  '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0';

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 10 requires the frozen s07_v1 strategy definition fingerprint.');
}

if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 10 requires the frozen p09_v1 paper definition fingerprint.');
}

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== 'c06_v1') {
  throw new Error('Checkpoint 10 requires feature set c06_v1.');
}

const requiredStrategy: string = STRATEGY_VERSION;
if (requiredStrategy !== 's07_v1') {
  throw new Error('Checkpoint 10 requires strategy s07_v1.');
}

const requiredPaper: string = PAPER_SPEC_VERSION;
if (requiredPaper !== 'p09_v1') {
  throw new Error('Checkpoint 10 requires paper spec p09_v1.');
}
