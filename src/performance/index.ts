export {
  assertNoExtraPerformanceArguments,
  executePerformanceReport,
  executePerformanceTrades,
  preparePerformanceCommand,
} from './command.js';
export {
  ENTRY_REFERENCE_NOTIONAL_USD,
  FROZEN_B08_V1_DEFINITION_FINGERPRINT,
  FROZEN_C06_V1_FEATURE_SET_VERSION,
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  PERFORMANCE_SPEC_NAME,
  PERFORMANCE_SPEC_VERSION,
  PERFORMANCE_TRADE_LIMIT_MAX,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
export {
  PERFORMANCE_DEFINITION_FINGERPRINT,
  canonicalPerformanceDefinition,
  fingerprintPerformanceDataset,
  fingerprintPerformanceDefinition,
  mutateCanonicalPerformanceDefinition,
} from './identity.js';
export {
  calculateGrossExitValueUsd,
  calculateGrossPnlUsd,
  calculateGrossReturnPct,
  calculateGrossTradeMetrics,
  calculateHoldingDurationMs,
  classifyGrossOutcome,
} from './trade.js';
export {
  calculateExitReasonBreakdown,
  calculatePayoffRatio,
  calculateProfitFactor,
  calculateWinnerConcentration,
  consecutiveOutcomeStreaks,
  maxClosedTradeCumulativePnlDrawdownUsd,
  sortAggregateTrades,
} from './aggregate.js';
export { assertCompletedTradeEvidence, normalizeCompletedPaperTrade } from './invariants.js';
export { buildPerformanceReport } from './report.js';
export { formatPerformanceReportLines, formatPerformanceTradeLines } from './format.js';
export { neumaierSum, canonicalizeZero } from './numbers.js';
export { openSqlitePerformanceDataSource } from './sqlite-source.js';
export {
  PerformanceError,
  type CompletedPaperTrade,
  type CompletedPaperTradeEvidence,
  type PerformanceReport,
} from './types.js';
