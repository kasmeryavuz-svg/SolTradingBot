export class PerformanceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PerformanceError';
  }
}

export const TRADE_OUTCOMES = ['win', 'loss', 'breakeven'] as const;
export const CLOSED_EXIT_REASONS = [
  'stop_loss_threshold',
  'take_profit_threshold',
  'max_holding_time',
] as const;
export const REJECTED_EXIT_REASONS = [
  'market_price_unavailable',
  'exit_conditions_not_met',
] as const;
export const PERFORMANCE_DATASET_STATUSES = ['available', 'no_closed_trades'] as const;

export type TradeOutcome = (typeof TRADE_OUTCOMES)[number];
export type ClosedExitReason = (typeof CLOSED_EXIT_REASONS)[number];
export type RejectedExitReason = (typeof REJECTED_EXIT_REASONS)[number];
export type PerformanceDatasetStatus = (typeof PERFORMANCE_DATASET_STATUSES)[number];

/**
 * Generic gross paper-trade inputs for reusable performance mathematics.
 * These functions do not know about SQLite, s07, or x11.
 */
export type GrossTradeInputs = {
  entryPriceUsd: number;
  entryReferenceNotionalUsd: number;
  quantityTokens: number;
  exitPriceUsd: number;
  openedAtMs: number;
  exitedAtMs: number;
};

export type GrossTradeMetrics = {
  grossExitValueUsd: number;
  grossPnlUsd: number;
  grossReturnPct: number;
  holdingDurationMs: number;
  outcome: TradeOutcome;
};

export type AggregateTradeInput = {
  positionSourceIdentity: string;
  exitEvidenceSourceIdentity: string;
  exitEvaluationSourceIdentity: string;
  exitedAt: string;
  entryReferenceNotionalUsd: number;
  grossExitValueUsd: number;
  grossPnlUsd: number;
  grossReturnPct: number;
  outcome: TradeOutcome;
  exitReason: string;
};

export type CompletedPaperTradeEvidence = {
  tokenMint: string;
  positionPairAddress: string;
  exitPairAddress: string;
  exitEvaluationPairAddress: string;
  openingPaperPairAddress: string;
  positionId: number;
  exitEvaluationPositionId: number;
  positionTokenId: number;
  exitTokenId: number;
  exitEvaluationTokenId: number;
  openingPaperTokenId: number;
  strategyTokenId: number;
  positionEvaluationTokenId: number;
  currentlyOpen: boolean;
  openPointerTokenId: number | null;
  openedAt: string;
  entryMarketCollectedAt: string;
  entryPriceUsd: number;
  entryNotionalUsd: number;
  positionQuantityTokens: number;
  positionSpecVersion: string;
  positionDefinitionFingerprint: string;
  positionSourceIdentity: string;
  openingPaperSourceIdentity: string;
  openingPaperEvaluationSourceIdentity: string;
  openingPaperSpecVersion: string;
  openingPaperDefinitionFingerprint: string;
  openingPaperStrategyDefinitionFingerprint: string;
  openingPaperFeatureSetVersion: string;
  openingPaperAction: string;
  openingPaperStrategyDecision: string;
  openingPaperSimulatedEntryPriceUsd: number | null;
  openingPaperReferencePriceUsd: number | null;
  openingPaperEvaluatedAt: string;
  openingPaperAsOf: string;
  openingPaperMarketCollectedAt: string;
  openingPaperEvaluationId: number;
  positionEvaluationPaperEvaluationId: number;
  positionEvaluationSourceIdentity: string;
  positionEvaluationPositionSourceIdentity: string | null;
  positionEvaluationAction: string;
  positionEvaluationPaperAction: string;
  positionEvaluationPriorOpenPositionId: number | null;
  positionEvaluationPriorOpenPositionSourceIdentity: string | null;
  positionEvaluationEntryPriceUsd: number | null;
  positionEvaluationEntryNotionalUsd: number | null;
  positionEvaluationQuantityTokens: number | null;
  positionEvaluationSpecVersion: string;
  positionEvaluationDefinitionFingerprint: string;
  strategyVersion: string;
  strategyDefinitionFingerprint: string;
  strategyFeatureSetVersion: string;
  strategySourceIdentity: string;
  strategyDecision: string;
  strategyEvaluatedAt: string;
  strategyAsOf: string;
  exitEvidenceId: number;
  exitEvaluationId: number;
  exitEvidenceSpecVersion: string;
  exitEvidenceDefinitionFingerprint: string;
  exitEvidencePositionDefinitionFingerprint: string;
  exitEvaluationSpecVersion: string;
  exitEvaluationDefinitionFingerprint: string;
  exitEvaluationPositionDefinitionFingerprint: string;
  exitEvaluationPositionSourceIdentity: string;
  exitAction: string;
  exitReason: string;
  exitedAt: string;
  exitMarketCollectedAt: string;
  exitEvaluationMarketCollectedAt: string;
  exitEvaluationEvaluatedAt: string;
  exitEvaluationAsOf: string;
  exitPriceUsd: number;
  exitQuantityTokens: number;
  exitEvaluationSimulatedExitPriceUsd: number | null;
  exitEvaluationClosedQuantityTokens: number | null;
  exitEvaluationObservedPriceUsd: number | null;
  exitEvaluationEntryPriceUsd: number;
  exitEvaluationStopTriggerPriceUsd: number;
  exitEvaluationTakeProfitTriggerPriceUsd: number;
  exitEvaluationHoldingAgeMs: number;
  exitEvaluationMaxHoldingMs: number;
  exitMarketSnapshotId: number;
  exitMarketSnapshotPairAddress: string;
  exitMarketSnapshotPriceUsd: number | null;
  exitMarketSnapshotCollectedAt: string;
  closingPositionSourceIdentity: string;
  exitEvidenceSourceIdentity: string;
  exitEvaluationSourceIdentity: string;
};

export type CompletedPaperTrade = {
  performanceSpecVersion: string;
  performanceDefinitionFingerprint: string;
  tokenMint: string;
  pairAddress: string;
  positionSourceIdentity: string;
  exitEvaluationSourceIdentity: string;
  exitEvidenceSourceIdentity: string;
  openedAt: string;
  exitedAt: string;
  holdingDurationMs: number;
  entryPriceUsd: number;
  entryReferenceNotionalUsd: number;
  quantityTokens: number;
  exitPriceUsd: number;
  grossExitValueUsd: number;
  grossPnlUsd: number;
  grossReturnPct: number;
  outcome: TradeOutcome;
  exitReason: ClosedExitReason;
};

export type ExitReasonBreakdown = {
  tradeCount: number;
  totalGrossPnlUsd: number;
  meanGrossPnlUsd: number | null;
  meanGrossReturnPct: number | null;
};

export type WinnerConcentration = {
  totalPositiveGrossPnlUsd: number;
  top1WinnerGrossPnlContributionPct: number | null;
  top3WinnersGrossPnlContributionPct: number | null;
  grossPnlExcludingTop1WinnerUsd: number;
  grossPnlExcludingTop3WinnersUsd: number;
  top1WinnersRemovedCount: number;
  top3WinnersRemovedCount: number;
};

export type PerformanceDistribution = {
  meanGrossPnlUsd: number | null;
  medianGrossPnlUsd: number | null;
  meanGrossReturnPct: number | null;
  medianGrossReturnPct: number | null;
  bestGrossReturnPct: number | null;
  worstGrossReturnPct: number | null;
  meanWinningGrossPnlUsd: number | null;
  meanLosingGrossPnlUsd: number | null;
  meanWinningGrossReturnPct: number | null;
  meanLosingGrossReturnPct: number | null;
};

export type PerformanceReport = {
  dataset: {
    status: PerformanceDatasetStatus;
    performanceSpecVersion: string;
    performanceSpecName: string;
    performanceDefinitionFingerprint: string;
    datasetFingerprint: string;
    firstExitedAt: string | null;
    lastExitedAt: string | null;
    closedTradeCount: number;
  };
  counts: {
    winCount: number;
    lossCount: number;
    breakevenCount: number;
  };
  rates: {
    winRatePct: number | null;
    lossRatePct: number | null;
    breakevenRatePct: number | null;
  };
  capitalReferenceTotals: {
    totalReferenceNotionalUsd: number;
    totalGrossExitValueUsd: number;
    totalGrossPnlUsd: number;
  };
  aggregateGrossReturnPct: number | null;
  distribution: PerformanceDistribution;
  profitFactor: number | null;
  payoffRatio: number | null;
  maxClosedTradeCumulativePnlDrawdownUsd: number | null;
  streaks: {
    maxConsecutiveWins: number | null;
    maxConsecutiveLosses: number | null;
  };
  exitReasonBreakdown: Record<ClosedExitReason, ExitReasonBreakdown>;
  concentration: WinnerConcentration;
  trades: CompletedPaperTrade[];
};
