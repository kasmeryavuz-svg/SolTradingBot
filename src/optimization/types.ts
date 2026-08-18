import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { TradeOutcome } from '../performance/types.js';
import type { ResearchCandidateId, ResearchDecision, ResearchRuleEvidence } from '../research/types.js';

export class OptimizationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'OptimizationError';
  }
}

export const OPTIMIZATION_ENTRY_CANDIDATE_IDS = [
  's07_baseline',
  'quality_control_v1',
  'time_series_momentum_v1',
  'flow_confirmed_momentum_v1',
  'runner_friendly_momentum_v1',
  'quality_liquid_v1',
  'flow_quality_v1',
  'runner_flow_v1',
] as const;

export const OPTIMIZATION_EXIT_CANDIDATE_IDS = [
  'x11_baseline',
  'tight_risk_v1',
  'wider_runner_v1',
  'partial_runner_v1',
  'moonbag_runner_v1',
] as const;

export const COST_SCENARIO_IDS = ['LOW', 'BASE', 'STRESS'] as const;

export const OPTIMIZATION_UNRESOLVED_REASONS = [
  'unresolved_at_dataset_end',
  'unresolved_at_fold_end',
] as const;

export const OPTIMIZATION_PARTIAL_CENSOR_REASON = 'partially_realized_censored' as const;

export const OPTIMIZATION_EXIT_LEG_REASONS = [
  'stop_loss_threshold',
  'take_profit_threshold',
  'take_profit_partial',
  'trailing_stop',
  'max_holding_time',
] as const;

export const OPTIMIZATION_PROMOTION_STATUSES = [
  'NO_PROMOTION_INSUFFICIENT_DATA',
  'NO_PROMOTION_FAILED_ROBUSTNESS',
  'ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION',
] as const;

export const OPTIMIZATION_GATE_RESULTS = [
  'PASS',
  'FAIL',
  'NOT_ENOUGH_DATA',
  'NOT_COMPARABLE',
] as const;

export const TRAINING_SELECTION_STATUSES = [
  'selected',
  'TRAIN_INELIGIBLE',
  'NO_TRAIN_ENTRY_SELECTION',
] as const;

export type OptimizationEntryCandidateId = (typeof OPTIMIZATION_ENTRY_CANDIDATE_IDS)[number];
export type FrozenResearchEntryCandidateId = ResearchCandidateId;
export type OptimizationExitCandidateId = (typeof OPTIMIZATION_EXIT_CANDIDATE_IDS)[number];
export type CostScenarioId = (typeof COST_SCENARIO_IDS)[number];
export type OptimizationUnresolvedReason = (typeof OPTIMIZATION_UNRESOLVED_REASONS)[number];
export type OptimizationPartialCensorReason = typeof OPTIMIZATION_PARTIAL_CENSOR_REASON;
export type OptimizationExitLegReason = (typeof OPTIMIZATION_EXIT_LEG_REASONS)[number];
export type OptimizationPromotionStatus = (typeof OPTIMIZATION_PROMOTION_STATUSES)[number];
export type OptimizationGateResult = (typeof OPTIMIZATION_GATE_RESULTS)[number];

export type StructuralReadiness = {
  timePartitionsConstructible: boolean;
  walkForwardEvaluable: boolean;
  promotionDataSufficient: boolean;
};

export type RuntimeIntegrityCheck = {
  id: string;
  result: 'PASS' | 'FAIL';
  detail: string;
};

export type RuntimeIntegrityReport = {
  status: 'PASS' | 'FAIL';
  checks: readonly RuntimeIntegrityCheck[];
};

export type AggregateSelectedKind = 'none' | 'single_frozen_pair' | 'walk_forward_selection_methodology';
export type TrainingSelectionStatus = (typeof TRAINING_SELECTION_STATUSES)[number];
export type OptimizationDecision = ResearchDecision;
export type OptimizationRuleEvidence = ResearchRuleEvidence;

export type ProfitFactor =
  | { kind: 'finite'; value: number }
  | { kind: 'infinite' }
  | { kind: 'undefined' };

export type CostScenarioDefinition = {
  scenarioId: CostScenarioId;
  entryBps: number;
  exitBps: number;
  description: string;
};

export type OptimizationEntryDescriptor = {
  candidateId: OptimizationEntryCandidateId;
  candidateVersion: string;
  candidateName: string;
  description: string;
  candidateDefinitionFingerprint: string;
  frozenR125: boolean;
};

export type OptimizationExitDescriptor = {
  candidateId: OptimizationExitCandidateId;
  candidateVersion: string;
  candidateName: string;
  description: string;
  candidateDefinitionFingerprint: string;
  usesFrozenX11Evaluator: boolean;
};

export type OptimizationDataset = {
  optimizationDefinitionFingerprint: string;
  optimizationDatasetFingerprint: string;
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
  schemaVersion: number;
  migration009Present: boolean;
};

export type ChronologicalSegment = {
  segmentId: 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
  index: 1 | 2 | 3 | 4 | 5 | 6;
  startInclusiveMs: number;
  endExclusiveMs: number | null;
  endInclusiveMs: number;
  snapshotCount: number;
  uniqueTokenCount: number;
};

export type FoldBoundaries = {
  foldId: 1 | 2 | 3 | 4;
  trainSegmentIds: readonly ('S1' | 'S2' | 'S3' | 'S4' | 'S5')[];
  testSegmentId: 'S3' | 'S4' | 'S5' | 'S6';
  trainStartInclusiveMs: number;
  trainEndExclusiveMs: number;
  testStartInclusiveMs: number;
  testEndExclusiveMs: number | null;
  testEndInclusiveMs: number;
  trainLatestEntryInclusiveMs: number;
  testLatestEntryInclusiveMs: number;
  optimizationFoldFingerprint: string;
};

export type SimulationWindow = {
  kind: 'train' | 'test' | 'full_history';
  startInclusiveMs: number;
  observationEndExclusiveMs: number | null;
  observationEndInclusiveMs: number;
  latestEntryInclusiveMs: number;
};

export type OptimizationExitLeg = {
  reason: OptimizationExitLegReason;
  exitedAt: string;
  exitMarketIdentity: string;
  quantityTokens: number;
  grossExitReferenceUsd: number;
  observedPriceUsd: number;
};

export type OptimizationCompletedTrade = {
  tokenMint: string;
  pairAddress: string;
  positionIdentity: string;
  entryMarketIdentity: string;
  openedAt: string;
  exitedAt: string;
  holdingDurationMs: number;
  entryReferencePriceUsd: number;
  entryReferenceNotionalUsd: number;
  originalQuantityTokens: number;
  legs: readonly OptimizationExitLeg[];
  grossPnlUsd: number;
  netLowPnlUsd: number;
  netBasePnlUsd: number;
  netStressPnlUsd: number;
  outcomeGross: TradeOutcome;
  outcomeBase: TradeOutcome;
};

export type OptimizationUnresolvedPosition = {
  tokenMint: string;
  pairAddress: string;
  positionIdentity: string;
  entryMarketIdentity: string;
  openedAt: string;
  unresolvedReason: OptimizationUnresolvedReason | OptimizationPartialCensorReason;
  realizedLegCount: number;
  remainingQuantityTokens: number;
  lastExactPairMarketIdentity: string | null;
};

export type OptimizationDecisionCounts = {
  evaluatedSnapshotCount: number;
  entryCandidateCount: number;
  noEntryCount: number;
  insufficientDataCount: number;
  skippedWhileOpenCount: number;
};

export type ScenarioMetrics = {
  scenarioId: CostScenarioId | 'GROSS';
  completedTrades: number;
  totalPnlUsd: number;
  expectancyUsd: number | null;
  medianTradePnlUsd: number | null;
  winRatePct: number | null;
  lossRatePct: number | null;
  profitFactor: ProfitFactor;
  largestWinUsd: number | null;
  largestLossUsd: number | null;
  maxDrawdownUsd: number | null;
  maxDrawdownPctOfReferenceBasis: number | null;
  averageHoldDurationMs: number | null;
  medianHoldDurationMs: number | null;
  top1PositiveConcentration: number | null;
  top3PositiveConcentration: number | null;
};

export type OptimizationCoverage = {
  snapshots: number;
  uniqueTokenMints: number;
  uniquePairs: number;
  openedPositions: number;
  completedTrades: number;
  unresolvedTrades: number;
  partiallyCensoredTrades: number;
  coveragePct: number | null;
  censoredFraction: number | null;
};

export type TrainingCandidateMetrics = {
  candidateId: string;
  candidateDefinitionFingerprint: string;
  eligibility: 'eligible' | 'TRAIN_INELIGIBLE';
  ineligibleReason: string | null;
  coverage: OptimizationCoverage;
  gross: ScenarioMetrics;
  netLow: ScenarioMetrics;
  netBase: ScenarioMetrics;
  netStress: ScenarioMetrics;
};

export type OptimizationSimulationResult = {
  entryCandidateId: OptimizationEntryCandidateId;
  exitCandidateId: OptimizationExitCandidateId;
  entryDefinitionFingerprint: string;
  exitDefinitionFingerprint: string;
  decisions: OptimizationDecisionCounts;
  coverage: OptimizationCoverage;
  completedTrades: OptimizationCompletedTrade[];
  unresolvedPositions: OptimizationUnresolvedPosition[];
  gross: ScenarioMetrics;
  netLow: ScenarioMetrics;
  netBase: ScenarioMetrics;
  netStress: ScenarioMetrics;
  pnlByToken: readonly { tokenMint: string; grossPnlUsd: number; netBasePnlUsd: number }[];
};

export type StageSelection =
  | {
      status: 'selected';
      candidateId: string;
      candidateDefinitionFingerprint: string;
      ranked: readonly TrainingCandidateMetrics[];
    }
  | {
      status: 'NO_TRAIN_ENTRY_SELECTION';
      candidateId: null;
      candidateDefinitionFingerprint: null;
      ranked: readonly TrainingCandidateMetrics[];
    };

export type PromotionGate = {
  id: string;
  title: string;
  result: OptimizationGateResult;
  detail: string;
};

export type PaperValidationCandidate = {
  kind: 'PAPER_VALIDATION_CANDIDATE';
  entryCandidateId: OptimizationEntryCandidateId;
  entryDefinitionFingerprint: string;
  exitCandidateId: OptimizationExitCandidateId;
  exitDefinitionFingerprint: string;
  optimizationSpecVersion: string;
  optimizationDefinitionFingerprint: string;
  optimizationDatasetFingerprint: string;
  optimizationRunFingerprint: string;
};

export type DegradationReport = {
  trainingBaseExpectancyUsd: number | null;
  oosBaseExpectancyUsd: number | null;
  trainingStressExpectancyUsd: number | null;
  oosStressExpectancyUsd: number | null;
  baseDegradationPct: number | null;
  stressDegradationPct: number | null;
  baseDegradationReason: string | null;
  stressDegradationReason: string | null;
};
