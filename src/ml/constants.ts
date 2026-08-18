import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { EXIT_MAX_HOLDING_MS, EXIT_SPEC_VERSION } from '../exit/constants.js';
import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../performance/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import {
  COST_BASE_ENTRY_BPS,
  COST_BASE_EXIT_BPS,
  COST_STRESS_ENTRY_BPS,
  COST_STRESS_EXIT_BPS,
  FROZEN_R125_V1_DEFINITION_FINGERPRINT,
  OPTIMIZATION_SPEC_VERSION,
} from '../optimization/constants.js';
import { COST_DEFINITION_FINGERPRINT } from '../optimization/costs.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT } from '../optimization/identity.js';
import { POSITION_ENTRY_NOTIONAL_USD } from '../position/constants.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../research/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../wallet-intelligence/identity.js';
import { WALLET_INTELLIGENCE_SPEC_VERSION } from '../wallet-intelligence/constants.js';

export const ML_SPEC_VERSION = 'ml19_v1';
export const ML_SPEC_NAME = 'purged_walk_forward_regularized_logistic_research_lab';
export const ML_CHECKPOINT = '19';

export const REQUIRED_ML_FEATURE_SET_VERSION = FEATURE_SET_VERSION;
export const REQUIRED_ML_EXIT_SPEC_VERSION = EXIT_SPEC_VERSION;
export const REQUIRED_ML_OPTIMIZATION_SPEC_VERSION = OPTIMIZATION_SPEC_VERSION;
export const REQUIRED_SCHEMA_VERSION = 9;
export const FORBIDDEN_MIGRATION_010_PREFIX = '010';

export const SAMPLE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
export const LABEL_MAX_HOLD_MS = EXIT_MAX_HOLDING_MS;
export const MODEL_SIGNAL_THRESHOLD = 0.65;
export const REFERENCE_NOTIONAL_USD = POSITION_ENTRY_NOTIONAL_USD;

export const LOGISTIC_LEARNING_RATE = 0.05;
export const LOGISTIC_MAX_ITERATIONS = 1000;
export const LOGISTIC_L2_LAMBDA = 0.01;
export const LOGISTIC_INTERCEPT_REGULARIZED = false;
export const LOGISTIC_PROBABILITY_EPSILON = 1e-12;
export const LOGISTIC_SIGMOID_CLIP = 35;
export const LOGISTIC_EARLY_STOP_ABSOLUTE_IMPROVEMENT = 1e-10;
export const LOGISTIC_EARLY_STOP_CONSECUTIVE_ITERATIONS = 5;

export const ZSCORE_CLIP = 10;
export const CANONICAL_NUMBER_PRECISION = 17;

export const FOLD_TRAIN_MIN_LABELED = 100;
export const FOLD_TEST_MIN_LABELED = 30;
export const FOLD_TRAIN_MIN_POSITIVES = 20;
export const FOLD_TRAIN_MIN_NEGATIVES = 20;
export const FOLD_TEST_MIN_POSITIVES = 5;
export const FOLD_TEST_MIN_NEGATIVES = 5;
export const AGGREGATE_OOS_MIN_LABELED = 120;
export const SELECTED_MIN_AGGREGATE_COMPLETED = 40;
export const SELECTED_MIN_COMPLETED_PER_FOLD = 5;

export const PROMOTION_MIN_AGGREGATE_ROC_AUC = 0.55;
export const PROMOTION_MIN_FOLDS_AUC_ABOVE_CHANCE = 3;
export const PROMOTION_MIN_BASE_PROFIT_FACTOR = 1.1;
export const PROMOTION_MAX_DRAWDOWN_PCT = 20;
export const PROMOTION_MAX_TOP1_CONCENTRATION_PCT = 40;
export const PROMOTION_MAX_TOP3_CONCENTRATION_PCT = 70;

export const BASELINE_COMPARABLE_MIN_AGGREGATE_COMPLETED = SELECTED_MIN_AGGREGATE_COMPLETED;
export const BASELINE_COMPARABLE_MIN_COMPLETED_PER_FOLD = SELECTED_MIN_COMPLETED_PER_FOLD;
export const BASELINE_ENTRY_CANDIDATE_ID = 's07_baseline' as const;
export const BASELINE_COMPARISON_POLICY =
  'same_chronological_evaluation_interval_different_frozen_entry_policies' as const;

export const MAX_CENSORING_BPS = 3500;
export const STD_DENOMINATOR = 'population_N' as const;
export const BOOLEAN_MISSING_POLICY = {
  observedFalseValue: 0,
  observedFalseMissing: 0,
  observedTrueValue: 1,
  observedTrueMissing: 0,
  missingValue: 0,
  missingIndicator: 1,
  medianImputeBooleans: false,
  standardizeMissingIndicators: false,
} as const;
export const LOGISTIC_OBJECTIVE =
  'mean_binary_log_loss + lambda * sum_j(w_j^2); intercept unregularized; lambda not divided by N' as const;
export const LOGISTIC_EARLY_STOP_RULE =
  'tiny_non_negative_train_loss_decrease_lt_tolerance_for_consecutive_iterations' as const;

export const CALIBRATION_BIN_EDGES = [0, 0.2, 0.4, 0.6, 0.8, 1] as const;
export const CALIBRATION_BIN_COUNT = 5;

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
export const FROZEN_O17_V1_DEFINITION_FINGERPRINT =
  '3c2171dc1aee3b0a31bae185e156f0a7236d56d11fe381e83364e8c326c4b979';
export const FROZEN_COST17_V1_DEFINITION_FINGERPRINT =
  'da3674208672b3f7c630ac0d3dc9e8cc0818c639fd5e69c62d9d87203757a523';
export const FROZEN_WI18_V1_DEFINITION_FINGERPRINT =
  '61e341190e1b8b19a47ed11101932acfebc904b664ee00db7cefff0284d67f32';

export const WALLET_INTELLIGENCE_USED = false;
export const WALLET_INTELLIGENCE_REASON =
  'insufficient uniformly point_in_time historical wallet intelligence';

export const MODEL_FAMILY = 'l2_regularized_logistic_regression' as const;
export const NULL_MODEL_FAMILY = 'intercept_only_train_base_rate' as const;
export const FORWARD_CANDIDATE_ID = 'ml19_v1_forward_l2_logistic';

const featureSet: string = REQUIRED_ML_FEATURE_SET_VERSION;
if (featureSet !== 'c06_v1') {
  throw new Error('Checkpoint 19 requires feature set c06_v1.');
}

const exitSpec: string = REQUIRED_ML_EXIT_SPEC_VERSION;
if (exitSpec !== 'x11_v1') {
  throw new Error('Checkpoint 19 requires exit spec x11_v1.');
}

const optimizationSpec: string = REQUIRED_ML_OPTIMIZATION_SPEC_VERSION;
if (optimizationSpec !== 'o17_v1') {
  throw new Error('Checkpoint 19 requires optimization spec o17_v1.');
}

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen s07_v1 strategy definition fingerprint.');
}

if (BACKTEST_DEFINITION_FINGERPRINT !== FROZEN_B08_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen b08_v1 backtest definition fingerprint.');
}

if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen p09_v1 paper definition fingerprint.');
}

if (POSITION_DEFINITION_FINGERPRINT !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen pm10_v1 position definition fingerprint.');
}

if (EXIT_DEFINITION_FINGERPRINT !== FROZEN_X11_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen x11_v1 exit definition fingerprint.');
}

if (PERFORMANCE_DEFINITION_FINGERPRINT !== FROZEN_A12_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen a12_v1 performance definition fingerprint.');
}

if (RESEARCH_DEFINITION_FINGERPRINT !== FROZEN_R125_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen r125_v1 research definition fingerprint.');
}

if (OPTIMIZATION_DEFINITION_FINGERPRINT !== FROZEN_O17_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen o17_v1 optimization definition fingerprint.');
}

if (COST_DEFINITION_FINGERPRINT !== FROZEN_COST17_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen cost17_v1 definition fingerprint.');
}

if (WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT !== FROZEN_WI18_V1_DEFINITION_FINGERPRINT) {
  throw new Error('Checkpoint 19 requires the frozen wi18_v1 wallet-intelligence definition fingerprint.');
}

const walletIntelligenceSpec: string = WALLET_INTELLIGENCE_SPEC_VERSION;
if (walletIntelligenceSpec !== 'wi18_v1') {
  throw new Error('Checkpoint 19 requires wallet-intelligence spec wi18_v1.');
}

if (LABEL_MAX_HOLD_MS !== SAMPLE_COOLDOWN_MS) {
  throw new Error('Checkpoint 19 requires the frozen x11 6-hour max hold as the ML label window.');
}

const threshold: number = MODEL_SIGNAL_THRESHOLD;
if (threshold !== 0.65) {
  throw new Error('Checkpoint 19 requires MODEL_SIGNAL_THRESHOLD exactly 0.65.');
}

const notional: number = REFERENCE_NOTIONAL_USD;
if (notional !== 100) {
  throw new Error('Checkpoint 19 requires the frozen $100 reference notional.');
}

const baseEntry: number = COST_BASE_ENTRY_BPS;
const baseExit: number = COST_BASE_EXIT_BPS;
if (baseEntry !== 200 || baseExit !== 200) {
  throw new Error('Checkpoint 19 requires frozen BASE costs of 200/200 bps.');
}

const stressEntry: number = COST_STRESS_ENTRY_BPS;
const stressExit: number = COST_STRESS_EXIT_BPS;
if (stressEntry !== 500 || stressExit !== 500) {
  throw new Error('Checkpoint 19 requires frozen STRESS costs of 500/500 bps.');
}
