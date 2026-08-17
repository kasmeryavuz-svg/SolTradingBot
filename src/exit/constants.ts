import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PAPER_SPEC_VERSION } from '../paper/constants.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { POSITION_SPEC_NAME, POSITION_SPEC_VERSION } from '../position/constants.js';
import { STRATEGY_VERSION } from '../strategy/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';

export const EXIT_SPEC_VERSION = 'x11_v1';
export const EXIT_SPEC_NAME = 'fixed_threshold_full_close_baseline';
export const REQUIRED_EXIT_POSITION_SPEC_VERSION = POSITION_SPEC_VERSION;
export const REQUIRED_EXIT_POSITION_SPEC_NAME = POSITION_SPEC_NAME;
export const REQUIRED_EXIT_POSITION_DEFINITION_FINGERPRINT = POSITION_DEFINITION_FINGERPRINT;
export const REQUIRED_EXIT_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_EXIT_STRATEGY_VERSION = STRATEGY_VERSION;
export const REQUIRED_EXIT_PAPER_SPEC_VERSION = PAPER_SPEC_VERSION;

export const EXIT_STOP_LOSS_BPS = 1000;
export const EXIT_TAKE_PROFIT_BPS = 2000;
export const EXIT_MAX_HOLDING_MS = 21_600_000;
export const EXIT_CLOSE_FRACTION_BPS = 10_000;
export const EXIT_HISTORY_LIMIT_MAX = 100;

export const FROZEN_S07_V1_DEFINITION_FINGERPRINT =
  'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd';
export const FROZEN_P09_V1_DEFINITION_FINGERPRINT =
  '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0';
export const FROZEN_PM10_V1_DEFINITION_FINGERPRINT =
  '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f';

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 11 requires the frozen s07_v1 strategy definition fingerprint.');
}

if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 11 requires the frozen p09_v1 paper definition fingerprint.');
}

if (POSITION_DEFINITION_FINGERPRINT !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 11 requires the frozen pm10_v1 position definition fingerprint.');
}

const requiredFeatureSet: string = FEATURE_SET_VERSION;
if (requiredFeatureSet !== 'c06_v1') {
  throw new Error('Checkpoint 11 requires feature set c06_v1.');
}

const requiredStrategy: string = STRATEGY_VERSION;
if (requiredStrategy !== 's07_v1') {
  throw new Error('Checkpoint 11 requires strategy s07_v1.');
}

const requiredPaper: string = PAPER_SPEC_VERSION;
if (requiredPaper !== 'p09_v1') {
  throw new Error('Checkpoint 11 requires paper spec p09_v1.');
}

const requiredPosition: string = POSITION_SPEC_VERSION;
if (requiredPosition !== 'pm10_v1') {
  throw new Error('Checkpoint 11 requires position spec pm10_v1.');
}
