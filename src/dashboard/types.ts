import type { ClosedExitReason, PerformanceReport, TradeOutcome } from '../performance/types.js';
import type {
  ResearchCandidateId,
  ResearchChronologicalSlice,
  ResearchDecisionCounts,
  ResearchLifecycleCounts,
  ResearchSliceMetrics,
  ResearchUnresolvedPosition,
} from '../research/types.js';

export type DashboardClock = {
  nowIso(): string;
};

export type DashboardSectionState = 'available' | 'empty' | 'unavailable' | 'error';

export type DashboardSection<T> = {
  state: DashboardSectionState;
  reason: string | null;
  data: T | null;
};

export type DashboardSafety = {
  blockchainCapability: 'READ_ONLY';
  tradingCapability: 'DISABLED';
  walletCapability: 'NOT_IMPLEMENTED';
  signerCapability: 'NOT_IMPLEMENTED';
  executionCapability: 'NOT_IMPLEMENTED';
  researchCapability: 'AVAILABLE';
  performanceCapability: 'AVAILABLE';
  dashboardCapability: 'AVAILABLE';
  checkpoint: '13';
};

export type SanitizedDashboardConfig = {
  nodeEnv: string;
  solanaNetwork: string;
  databaseEnabled: boolean;
  databaseFilename: string | null;
  discoveryEnabled: boolean;
  configuredMarketTokenCount: number;
  checkpoint: '13';
  dashboardSpecVersion: string;
};

export type DashboardMeta = {
  dashboardSpecVersion: string;
  dashboardSpecName: string;
  dashboardDefinitionFingerprint: string;
  checkpoint: '13';
  generatedAt: string;
  observability: {
    kind: 'observability_view';
    atomicSemanticDatabaseSnapshot: false;
    sectionsRebuiltIndependentlyReadOnly: true;
  };
};

export type DashboardCoverageCounts = {
  tokens: number;
  marketSnapshots: number;
  riskScans: number;
  featureVectors: number;
  strategyEvaluations: number;
  paperEvaluations: number;
  positionEvaluations: number;
  paperPositions: number;
  paperOpenPositions: number;
  exitEvaluations: number;
  paperPositionExits: number;
};

export type DashboardDatabaseData = {
  status: 'available' | 'unavailable' | 'incompatible';
  schemaVersion: number | null;
  queryOnly: boolean | null;
  health: 'not_checked' | 'ok' | 'failed' | 'unavailable';
  counts: DashboardCoverageCounts | null;
  latestMarketCollectedAt: string | null;
  latestRiskScannedAt: string | null;
  latestStrategyEvaluatedAt: string | null;
  latestPaperEvaluatedAt: string | null;
  latestExitEvaluatedAt: string | null;
};

export type DashboardMarketRow = {
  tokenSymbol: string | null;
  tokenName: string | null;
  tokenMint: string;
  pairAddress: string;
  dexName: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume5mUsd: number | null;
  buys5m: number | null;
  sells5m: number | null;
  priceChange5mPct: number | null;
  priceChange1hPct: number | null;
  priceChange24hPct: number | null;
  collectedAt: string;
};

export type DashboardMarketData = {
  displayLimit: number;
  ordering: 'collectedAt_desc_then_tokenMint_then_pairAddress';
  rows: DashboardMarketRow[];
};

export type DashboardOpenPaperPosition = {
  tokenMint: string;
  pairAddress: string;
  openedAt: string;
  entryReferencePriceUsd: number;
  referenceNotionalUsd: number;
  quantityTokens: number;
  positionSourceIdentityAbbreviated: string;
};

export type DashboardRuntimeClosedTrade = {
  tokenMint: string;
  pairAddress: string;
  openedAt: string;
  exitedAt: string;
  entryReferencePriceUsd: number;
  referenceNotionalUsd: number;
  quantityTokens: number;
  exitPriceUsd: number;
  grossPnlUsd: number;
  grossReturnPct: number;
  outcome: TradeOutcome;
  exitReason: ClosedExitReason;
  positionSourceIdentityAbbreviated: string;
};

export type DashboardRuntimePaperData = {
  title: 'Runtime Paper Lifecycle';
  openPositions: DashboardOpenPaperPosition[];
  recentClosedTrades: DashboardRuntimeClosedTrade[];
  recentClosedTradeLimit: number;
};

export type DashboardCumulativePoint = {
  exitedAt: string;
  cumulativeGrossPnlUsd: number;
};

export type DashboardPerformanceData = {
  title: 'GROSS PAPER PERFORMANCE';
  notNet: true;
  notLive: true;
  emptyMessage: string | null;
  report: PerformanceReport;
  closedTradeCumulativeGrossPnl: DashboardCumulativePoint[];
};

export type DashboardResearchCandidateRow = {
  candidateId: ResearchCandidateId;
  candidateName: string;
  candidateDefinitionFingerprint: string;
  candidateRunFingerprint: string;
  decisions: ResearchDecisionCounts;
  lifecycle: ResearchLifecycleCounts;
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  totalGrossPnlUsd: number;
  aggregateGrossReturnPct: number | null;
  profitFactor: number | null;
  maxClosedTradeCumulativePnlDrawdownUsd: number | null;
  top1WinnerGrossPnlContributionPct: number | null;
  top3WinnersGrossPnlContributionPct: number | null;
  slices: readonly ResearchSliceMetrics[];
  unresolvedPositions: readonly ResearchUnresolvedPosition[];
};

export type DashboardResearchData = {
  title: 'STRATEGY RESEARCH LAB';
  subtitle: 'HISTORICAL GROSS PAPER REFERENCE';
  notLive: true;
  notOptimized: true;
  researchSpecVersion: string;
  researchSpecName: string;
  researchDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  researchDatasetFingerprintAbbreviated: string;
  rawMarketSnapshotCount: number;
  runtimeExitReferencedSnapshotCountExcluded: number;
  researchMarketSnapshotCount: number;
  uniqueTokenCount: number;
  uniquePairCount: number;
  riskScanCount: number;
  uniqueTokensWithRiskScan: number;
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
  datasetSpanMs: number | null;
  snapshotsWithFinitePriceCount: number;
  snapshotsWithNullPriceCount: number;
  candidateOrder: 'canonical_candidateId_registry_order';
  ranking: false;
  candidates: DashboardResearchCandidateRow[];
};

export type DashboardDataQualityData = {
  marketSnapshotCount: number | null;
  tokenCount: number | null;
  riskScanCount: number | null;
  tokensWithRisk: number | null;
  featureVectorCount: number | null;
  strategyEvaluationCount: number | null;
  runtimeCompletedTradeCount: number | null;
  researchInsufficientDataCounts: Readonly<Record<ResearchCandidateId, number>> | null;
};

export type DashboardHealthData = {
  status: 'ok' | 'failed' | 'unavailable' | 'incompatible';
  schemaVersion: number | null;
  integrityCheck: string | null;
  foreignKeyViolations: number | null;
  queryOnly: boolean | null;
  checkedAt: string;
};

export type DashboardSnapshot = {
  meta: DashboardMeta;
  safety: DashboardSafety;
  configuration: SanitizedDashboardConfig;
  database: DashboardSection<DashboardDatabaseData>;
  market: DashboardSection<DashboardMarketData>;
  runtimePaper: DashboardSection<DashboardRuntimePaperData>;
  performance: DashboardSection<DashboardPerformanceData>;
  research: DashboardSection<DashboardResearchData>;
  dataQuality: DashboardSection<DashboardDataQualityData>;
};

export type DashboardErrorBody = {
  error: {
    code: string;
    message: string;
  };
};

export type { ResearchChronologicalSlice };
