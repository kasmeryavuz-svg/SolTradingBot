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
