export {
  executeHistoricalBacktest,
  parseBacktestArgv,
  prepareBacktestCommand,
} from './command.js';
export {
  BACKTEST_SPEC_NAME,
  BACKTEST_SPEC_VERSION,
  FORWARD_HORIZON_SECONDS,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  OUTCOME_MAX_DELAY_SECONDS,
  REQUIRED_BACKTEST_FEATURE_SET_VERSION,
  REQUIRED_BACKTEST_STRATEGY_VERSION,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
export { runBacktest } from './engine.js';
export { formatBacktestLines } from './format.js';
export {
  BACKTEST_DEFINITION_FINGERPRINT,
  canonicalBacktestDefinition,
  fingerprintBacktestDefinition,
  mutateCanonicalBacktestDefinition,
} from './identity.js';
export { grossForwardReturnPct, resolveCandidateOutcome } from './outcomes.js';
export { openSqliteBacktestDataSource } from './sqlite-source.js';
export { summarizeBacktestEvents } from './summary.js';
export {
  addUtcSeconds,
  outcomeWindow,
  selectLatestRisk,
  selectOutcomeSnapshot,
  selectPreviousMarket,
  sortMarketSnapshots,
} from './timeline.js';
export {
  BacktestError,
  type BacktestDataset,
  type BacktestEvent,
  type BacktestOutcome,
  type BacktestResult,
  type BacktestScope,
} from './types.js';
