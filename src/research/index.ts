export {
  assertNoExtraResearchArguments,
  executeResearchCatalog,
  executeResearchCompare,
  executeResearchTrades,
  parseResearchTradesArgv,
  prepareResearchCatalogCommand,
  prepareResearchCommand,
} from './command.js';
export {
  COMMON_GATE_VERSION,
  FROZEN_A12_V1_DEFINITION_FINGERPRINT,
  FROZEN_B08_V1_DEFINITION_FINGERPRINT,
  FROZEN_C06_V1_FEATURE_SET_VERSION,
  FROZEN_P09_V1_DEFINITION_FINGERPRINT,
  FROZEN_PM10_V1_DEFINITION_FINGERPRINT,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  FROZEN_X11_V1_DEFINITION_FINGERPRINT,
  NEW_CANDIDATE_REQUIRED_DATA_PRECEDENCE,
  RESEARCH_SPEC_NAME,
  RESEARCH_SPEC_VERSION,
  RESEARCH_TRADE_LIMIT_MAX,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
export {
  canonicalResearchDefinition,
  mutateCanonicalResearchDefinition,
  type CanonicalResearchDefinition,
} from './definition.js';
export { evaluateResearchCandidate } from './evaluator.js';
export {
  decisionFromResearchRules,
  evaluateCommonMarketRiskGate,
  canonicalCommonGate,
} from './candidates/common.js';
export { evaluateQualityControl } from './candidates/quality-control.js';
export { inspectReconstructedRules, summarizeResearchDecisionDiagnostics } from './diagnostics.js';
export {
  formatResearchCatalogLines,
  formatResearchCompareLines,
  formatResearchTradeLines,
} from './format.js';
export {
  RESEARCH_DEFINITION_FINGERPRINT,
  fingerprintResearchCandidateRun,
  fingerprintResearchDataset,
  fingerprintResearchDefinition,
  orderedCompletedTradeIdentities,
  orderedUnresolvedRecords,
  researchMarketObservationIdentity,
  researchMarketTimeIdentity,
  researchPositionIdentity,
  researchRiskEvidenceIdentity,
  researchTradeIdentity,
} from './identity.js';
export {
  getResearchCandidateDescriptor,
  isResearchCandidateId,
  listResearchCandidateDescriptors,
  requireResearchCandidateId,
} from './catalog.js';
export { buildResearchCandidateReport, buildResearchCompareReport } from './report.js';
export { simulateResearchCandidate } from './simulator.js';
export { openReadOnlyResearchDatabase, openSqliteResearchDataSource } from './sqlite-source.js';
export { assignResearchSlice, buildResearchSliceMetrics } from './slices.js';
export { reconstructPointInTimeVector, sortResearchMarketEvents } from './timeline.js';
export { aggregateResearchCompletedTrades, researchTradeToAggregateInput } from './aggregate.js';
export { buildResearchCompletedTrade } from './trade.js';
export {
  ResearchError,
  RESEARCH_CANDIDATE_IDS,
  type ResearchCandidateId,
  type ResearchCandidateReport,
  type ResearchCompareReport,
  type ResearchCompletedTrade,
  type ResearchDataset,
} from './types.js';
