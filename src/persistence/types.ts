import type { DiscoverySource, MarketDataStatus } from '../discovery/types.js';
import type { FeatureValue, FeatureVector } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type {
  HighestFindingSeverity,
  RiskCheckResult,
  RiskFinding,
  TokenExtensionObservation,
  TokenProgramKind,
  TokenRiskReport,
} from '../risk/types.js';
import type { StrategyDecision, StrategyEvaluation, StrategyRuleResult } from '../strategy/types.js';
import type { PaperEvaluation } from '../paper/types.js';
import type { OpenPaperPosition, PositionEvaluation } from '../position/types.js';

export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PersistenceError';
  }
}

export type RecordedRun = {
  runId: number;
  observedAt: string;
  recordedAt: string;
  candidateCount: number;
  tokensInserted: number;
  tokensUpdated: number;
  observationsWritten: number;
  snapshotsWritten: number;
};

export type PersistenceIntegrity = {
  ok: boolean;
  detail: string;
};

export type PersistenceStats = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
  integrity: PersistenceIntegrity;
  tokenCount: number;
  discoveryRunCount: number;
  discoveryObservationCount: number;
  marketSnapshotCount: number;
  riskScanCount: number;
  featureVectorCount: number;
  strategyEvaluationCount: number;
  paperEvaluationCount: number;
  positionEvaluationCount: number;
  paperPositionCount: number;
  openPaperPositionCount: number;
  earliestObservationAt: string | null;
  latestObservationAt: string | null;
};

export type StoredToken = {
  id: number;
  chain: 'solana';
  mint: string;
  firstObservedAt: string;
  lastObservedAt: string;
  createdAt: string;
};

export type StoredSourceResult = {
  source: DiscoverySource;
  ok: boolean;
  recordCount: number;
  error: string | null;
};

export type StoredObservation = {
  id: number;
  runId: number;
  tokenMint: string;
  observedAt: string;
  sources: DiscoverySource[];
  dexScreenerUrl: string | null;
  description: string | null;
  profileUpdatedAt: string | null;
  boostAmount: number | null;
  boostTotalAmount: number | null;
  marketDataStatus: MarketDataStatus;
};

export type TokenHistory = {
  token: StoredToken;
  snapshots: MarketSnapshot[];
};

export type HistoryLimit = {
  requested: number;
  applied: number;
};

export type RecordedRiskScan = {
  scanId: number;
  tokenMint: string;
  scannedAt: string;
  tokenInserted: boolean;
};

export type StoredRiskScanSummary = {
  id: number;
  scannedAt: string;
  tokenProgram: TokenProgramKind;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  supplyRaw: string | null;
  top1Bps: number | null;
  top5Bps: number | null;
  highestFindingSeverity: HighestFindingSeverity;
  findingCodes: string[];
  checks: RiskCheckResult[];
  extensions: TokenExtensionObservation[];
  findings: RiskFinding[];
};

export type TokenRiskHistory = {
  token: StoredToken;
  scans: StoredRiskScanSummary[];
};

export type FeatureBundle = {
  marketSnapshot: MarketSnapshot;
  riskReport: TokenRiskReport | null;
  featureVector: FeatureVector;
};

export type RecordedFeatureBundle = {
  vectorId: number;
  tokenMint: string;
  sourceIdentity: string;
  inserted: boolean;
  tokenInserted: boolean;
  marketInserted: boolean;
  riskInserted: boolean;
};

export type StoredFeatureVectorSummary = {
  id: number;
  featureSetVersion: string;
  generatedAt: string;
  asOf: string;
  marketCollectedAt: string;
  marketPairAddress: string;
  previousMarketCollectedAt: string | null;
  riskScannedAt: string | null;
  featureCompleteness: FeatureVector['featureCompleteness'];
  availableFeatureCount: number;
  unavailableFeatureCount: number;
  sourceIdentity: string;
  values: FeatureValue[];
};

export type TokenFeatureHistory = {
  token: StoredToken;
  vectors: StoredFeatureVectorSummary[];
};

export type StrategyBundle = FeatureBundle & {
  strategyEvaluation: StrategyEvaluation;
};

export type RecordedStrategyBundle = {
  evaluationId: number;
  vectorId: number;
  tokenMint: string;
  sourceIdentity: string;
  inserted: boolean;
  featureInserted: boolean;
  tokenInserted: boolean;
  marketInserted: boolean;
  riskInserted: boolean;
  definitionInserted: boolean;
};

export type StoredStrategyEvaluationSummary = {
  id: number;
  tokenMint: string;
  strategyVersion: string;
  strategyName: string;
  strategyDefinitionFingerprint: string;
  featureSetVersion: string;
  evaluatedAt: string;
  asOf: string;
  decision: StrategyDecision;
  passedRuleCount: number;
  failedRuleCount: number;
  unavailableRuleCount: number;
  sourceIdentity: string;
  featureSourceIdentity: string;
  rules: StrategyRuleResult[];
};

export type TokenStrategyHistory = {
  token: StoredToken;
  evaluations: StoredStrategyEvaluationSummary[];
};

export type PaperBundle = StrategyBundle & {
  paperEvaluation: PaperEvaluation;
};

export type RecordedPaperBundle = {
  paperEvaluationId: number;
  strategyEvaluationId: number;
  vectorId: number;
  tokenMint: string;
  sourceIdentity: string;
  inserted: boolean;
  strategyInserted: boolean;
  featureInserted: boolean;
  marketInserted: boolean;
  riskInserted: boolean;
  tokenInserted: boolean;
  paperDefinitionInserted: boolean;
};

export type StoredPaperEvaluationSummary = {
  id: number;
  strategyEvaluationId: number;
  tokenMint: string;
  paperSpecVersion: string;
  paperSpecName: string;
  paperDefinitionFingerprint: string;
  strategyVersion: string;
  strategyDefinitionFingerprint: string;
  strategyDecision: StrategyDecision;
  featureSetVersion: string;
  asOf: string;
  evaluatedAt: string;
  pairAddress: string;
  marketCollectedAt: string;
  paperAction: PaperEvaluation['paperAction'];
  noActionReason: PaperEvaluation['noActionReason'];
  referencePriceUsd: number | null;
  simulatedEntryPriceUsd: number | null;
  executionModel: PaperEvaluation['executionModel'];
  costModel: PaperEvaluation['costModel'];
  quantityModel: PaperEvaluation['quantityModel'];
  positionModel: PaperEvaluation['positionModel'];
  exitModel: PaperEvaluation['exitModel'];
  sourceIdentity: string;
};

export type TokenPaperHistory = {
  token: StoredToken;
  evaluations: StoredPaperEvaluationSummary[];
};

export type PositionBundle = PaperBundle & {
  priorOpenPosition: StoredOpenPaperPosition | null;
  positionEvaluation: PositionEvaluation;
};

export type RecordedPositionBundle = {
  positionEvaluationId: number;
  paperEvaluationId: number;
  strategyEvaluationId: number;
  vectorId: number;
  paperPositionId: number | null;
  openPositionCreated: boolean;
  tokenMint: string;
  sourceIdentity: string;
  inserted: boolean;
  paperInserted: boolean;
  strategyInserted: boolean;
  featureInserted: boolean;
  marketInserted: boolean;
  riskInserted: boolean;
  tokenInserted: boolean;
  paperDefinitionInserted: boolean;
  positionDefinitionInserted: boolean;
};

export type StoredOpenPaperPosition = OpenPaperPosition & {
  id: number;
  positionEvaluationId: number;
  openingPaperEvaluationId: number;
};

export type StoredPositionEvaluationSummary = {
  id: number;
  paperEvaluationId: number;
  tokenMint: string;
  positionSpecVersion: string;
  positionSpecName: string;
  positionDefinitionFingerprint: string;
  paperSpecVersion: string;
  paperDefinitionFingerprint: string;
  paperSourceIdentity: string;
  asOf: string;
  evaluatedAt: string;
  paperAction: PositionEvaluation['paperAction'];
  paperNoActionReason: PositionEvaluation['paperNoActionReason'];
  priorOpenPositionId: number | null;
  priorOpenPositionSourceIdentity: string | null;
  positionAction: PositionEvaluation['positionAction'];
  positionReason: PositionEvaluation['positionReason'];
  entryPriceUsd: number | null;
  entryNotionalUsd: number | null;
  quantityTokens: number | null;
  positionSourceIdentity: string | null;
  sourceIdentity: string;
};

export type TokenPositionHistory = {
  token: StoredToken;
  evaluations: StoredPositionEvaluationSummary[];
};
