import type { ClosedExitReason, TradeOutcome, WinnerConcentration } from '../performance/types.js';
import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { StrategyDecision } from '../strategy/types.js';

export class ResearchError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ResearchError';
  }
}

export const RESEARCH_CANDIDATE_IDS = [
  's07_baseline',
  'quality_control_v1',
  'time_series_momentum_v1',
  'flow_confirmed_momentum_v1',
  'runner_friendly_momentum_v1',
] as const;

export const RESEARCH_CANDIDATE_CATEGORIES = [
  'frozen_control_baseline',
  'internal_control',
  'research_inspired_entry_hypothesis',
  'ablation_hypothesis',
] as const;

export const RESEARCH_CHRONOLOGICAL_SLICES = ['early', 'middle', 'late'] as const;

export const RESEARCH_UNRESOLVED_REASONS = ['unresolved_at_dataset_end'] as const;

export type ResearchCandidateId = (typeof RESEARCH_CANDIDATE_IDS)[number];
export type ResearchCandidateCategory = (typeof RESEARCH_CANDIDATE_CATEGORIES)[number];
export type ResearchChronologicalSlice = (typeof RESEARCH_CHRONOLOGICAL_SLICES)[number];
export type ResearchUnresolvedReason = (typeof RESEARCH_UNRESOLVED_REASONS)[number];
export type ResearchDecision = StrategyDecision;

export type ResearchRuleEvidence = {
  code: string;
  status: 'pass' | 'fail' | 'unavailable';
  observed: string;
  reason: string;
};

export type ResearchCandidateEvaluation = {
  candidateId: ResearchCandidateId;
  decision: ResearchDecision;
  rules: readonly ResearchRuleEvidence[];
};

export type ResearchCandidateDescriptor = {
  candidateId: ResearchCandidateId;
  candidateVersion: string;
  candidateName: string;
  candidateCategory: ResearchCandidateCategory;
  description: string;
  requiredFeatureSetVersion: string;
  candidateDefinitionFingerprint: string;
  sourceRationale: string;
  inspirationKind: 'internal_control' | 'concept_inspired_by' | 'frozen_internal_baseline';
  externalReproduction: 'none' | 'not_a_faithful_reproduction';
};

export type ResearchDataset = {
  researchDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  rawMarketSnapshotCount: number;
  runtimeExitReferencedSnapshotCountExcluded: number;
  researchMarketSnapshotCount: number;
  uniqueTokenCount: number;
  uniquePairCount: number;
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
  datasetSpanMs: number | null;
  riskScanCount: number;
  uniqueTokensWithRiskScan: number;
  snapshotsWithFinitePriceCount: number;
  snapshotsWithNullPriceCount: number;
  includedMarketIdentities: readonly string[];
  includedMarketObservationIdentities: readonly string[];
  riskEvidenceIdentities: readonly string[];
  excludedRuntimeExitMarketIdentities: readonly string[];
  marketSnapshots: readonly MarketSnapshot[];
  riskReports: readonly RiskFeatureInput[];
};

export type ResearchCompletedTrade = {
  researchSpecVersion: string;
  researchDefinitionFingerprint: string;
  candidateId: ResearchCandidateId;
  candidateDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  tokenMint: string;
  pairAddress: string;
  researchPositionIdentity: string;
  entryMarketIdentity: string;
  exitMarketIdentity: string;
  researchTradeIdentity: string;
  openedAt: string;
  exitedAt: string;
  holdingDurationMs: number;
  entryPriceUsd: number;
  entryReferenceNotionalUsd: number;
  quantityTokens: number;
  exitPriceUsd: number;
  exitReason: ClosedExitReason;
  grossExitValueUsd: number;
  grossPnlUsd: number;
  grossReturnPct: number;
  outcome: TradeOutcome;
};

export type ResearchUnresolvedPosition = {
  researchSpecVersion: string;
  researchDefinitionFingerprint: string;
  candidateId: ResearchCandidateId;
  candidateDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  tokenMint: string;
  pairAddress: string;
  researchPositionIdentity: string;
  entryMarketIdentity: string;
  openedAt: string;
  unresolvedReason: ResearchUnresolvedReason;
  lastExactPairMarketIdentity: string | null;
  lastExactPairExitReason: string | null;
};

export type ResearchDecisionCounts = {
  evaluatedSnapshotCount: number;
  entryCandidateCount: number;
  noEntryCount: number;
  insufficientDataCount: number;
  skippedWhileOpenCount: number;
};

export type ResearchLifecycleCounts = {
  positionsOpened: number;
  completedPositions: number;
  unresolvedPositions: number;
  uniqueTokensTraded: number;
  completionRatePct: number | null;
};

export type ResearchPerformanceMetrics = {
  winCount: number;
  lossCount: number;
  breakevenCount: number;
  winRatePct: number | null;
  lossRatePct: number | null;
  breakevenRatePct: number | null;
  totalReferenceNotionalUsd: number;
  totalGrossExitValueUsd: number;
  totalGrossPnlUsd: number;
  aggregateGrossReturnPct: number | null;
  meanGrossPnlUsd: number | null;
  medianGrossPnlUsd: number | null;
  meanGrossReturnPct: number | null;
  medianGrossReturnPct: number | null;
  bestGrossReturnPct: number | null;
  worstGrossReturnPct: number | null;
  profitFactor: number | null;
  payoffRatio: number | null;
  maxClosedTradeCumulativePnlDrawdownUsd: number | null;
  maxConsecutiveWins: number | null;
  maxConsecutiveLosses: number | null;
  exitReasonBreakdown: Record<
    ClosedExitReason,
    {
      tradeCount: number;
      totalGrossPnlUsd: number;
      meanGrossPnlUsd: number | null;
      meanGrossReturnPct: number | null;
    }
  >;
  concentration: WinnerConcentration;
};

export type ResearchSliceMetrics = {
  slice: ResearchChronologicalSlice;
  completedTradeCount: number;
  totalGrossPnlUsd: number | null;
  meanGrossReturnPct: number | null;
  winRatePct: number | null;
  profitFactor: number | null;
  top1WinnerGrossPnlContributionPct: number | null;
};

export type ResearchCandidateReport = {
  candidate: ResearchCandidateDescriptor;
  researchSpecVersion: string;
  researchDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  candidateRunFingerprint: string;
  coverage: {
    researchSnapshotCount: number;
    uniqueTokenCount: number;
    uniquePairCount: number;
    firstSnapshotAt: string | null;
    lastSnapshotAt: string | null;
    datasetSpanMs: number | null;
    riskScanCount: number;
    uniqueTokensWithRiskScan: number;
    snapshotsWithFinitePriceCount: number;
    snapshotsWithNullPriceCount: number;
  };
  decisions: ResearchDecisionCounts;
  lifecycle: ResearchLifecycleCounts;
  performance: ResearchPerformanceMetrics;
  slices: readonly ResearchSliceMetrics[];
  completedTrades: readonly ResearchCompletedTrade[];
  unresolvedPositions: readonly ResearchUnresolvedPosition[];
};

export type ResearchCompareReport = {
  researchSpecVersion: string;
  researchSpecName: string;
  researchDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  rawMarketSnapshotCount: number;
  runtimeExitReferencedSnapshotCountExcluded: number;
  researchMarketSnapshotCount: number;
  uniqueTokenCount: number;
  uniquePairCount: number;
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
  datasetSpanMs: number | null;
  riskScanCount: number;
  uniqueTokensWithRiskScan: number;
  snapshotsWithFinitePriceCount: number;
  snapshotsWithNullPriceCount: number;
  candidates: readonly ResearchCandidateReport[];
};
