import {
  calculateExitReasonBreakdown,
  calculatePayoffRatio,
  calculateProfitFactor,
  calculateWinnerConcentration,
  consecutiveOutcomeStreaks,
  emptyExitReasonBreakdown,
  maxClosedTradeCumulativePnlDrawdownUsd,
  meanOf,
  medianOf,
  ratePct,
  sortAggregateTrades,
} from '../performance/aggregate.js';
import { divideFinite, multiplyFinite, neumaierSum, requireFiniteNumber } from '../performance/numbers.js';
import type { AggregateTradeInput } from '../performance/types.js';
import type { ResearchCompletedTrade, ResearchPerformanceMetrics } from './types.js';

export function researchTradeToAggregateInput(trade: ResearchCompletedTrade): AggregateTradeInput {
  return {
    positionSourceIdentity: trade.researchPositionIdentity,
    exitEvidenceSourceIdentity: trade.researchTradeIdentity,
    exitEvaluationSourceIdentity: trade.exitMarketIdentity,
    exitedAt: trade.exitedAt,
    entryReferenceNotionalUsd: trade.entryReferenceNotionalUsd,
    grossExitValueUsd: trade.grossExitValueUsd,
    grossPnlUsd: trade.grossPnlUsd,
    grossReturnPct: trade.grossReturnPct,
    outcome: trade.outcome,
    exitReason: trade.exitReason,
  };
}

export function aggregateResearchCompletedTrades(
  trades: readonly ResearchCompletedTrade[],
): ResearchPerformanceMetrics {
  const ordered = sortAggregateTrades(trades.map(researchTradeToAggregateInput));
  const closedTradeCount = ordered.length;
  const wins = ordered.filter((trade) => trade.outcome === 'win');
  const losses = ordered.filter((trade) => trade.outcome === 'loss');
  const breakevens = ordered.filter((trade) => trade.outcome === 'breakeven');
  const winningPnls = wins.map((trade) => trade.grossPnlUsd);
  const losingPnls = losses.map((trade) => trade.grossPnlUsd);
  const allPnls = ordered.map((trade) => trade.grossPnlUsd);
  const allReturns = ordered.map((trade) => trade.grossReturnPct);
  const meanWinningGrossPnlUsd = meanOf(winningPnls);
  const meanLosingGrossPnlUsd = meanOf(losingPnls);
  const streaks = closedTradeCount === 0 ? null : consecutiveOutcomeStreaks(ordered);

  const totalReferenceNotionalUsd =
    closedTradeCount === 0 ? 0 : neumaierSum(ordered.map((trade) => trade.entryReferenceNotionalUsd));
  const totalGrossExitValueUsd =
    closedTradeCount === 0 ? 0 : neumaierSum(ordered.map((trade) => trade.grossExitValueUsd));
  const totalGrossPnlUsd = closedTradeCount === 0 ? 0 : neumaierSum(allPnls);
  const totalPositiveGrossPnlUsd = winningPnls.length === 0 ? 0 : neumaierSum(winningPnls);
  const totalNegativeGrossPnlUsd = losingPnls.length === 0 ? 0 : neumaierSum(losingPnls);

  return {
    winCount: wins.length,
    lossCount: losses.length,
    breakevenCount: breakevens.length,
    winRatePct: ratePct(wins.length, closedTradeCount),
    lossRatePct: ratePct(losses.length, closedTradeCount),
    breakevenRatePct: ratePct(breakevens.length, closedTradeCount),
    totalReferenceNotionalUsd,
    totalGrossExitValueUsd,
    totalGrossPnlUsd,
    aggregateGrossReturnPct:
      closedTradeCount === 0 || totalReferenceNotionalUsd === 0
        ? null
        : multiplyFinite(
            divideFinite(totalGrossPnlUsd, totalReferenceNotionalUsd, 'aggregate gross return ratio'),
            100,
            'aggregateGrossReturnPct',
          ),
    meanGrossPnlUsd: meanOf(allPnls),
    medianGrossPnlUsd: medianOf(allPnls),
    meanGrossReturnPct: meanOf(allReturns),
    medianGrossReturnPct: medianOf(allReturns),
    bestGrossReturnPct:
      allReturns.length === 0 ? null : requireFiniteNumber(Math.max(...allReturns), 'bestGrossReturnPct'),
    worstGrossReturnPct:
      allReturns.length === 0 ? null : requireFiniteNumber(Math.min(...allReturns), 'worstGrossReturnPct'),
    profitFactor: calculateProfitFactor(totalPositiveGrossPnlUsd, totalNegativeGrossPnlUsd),
    payoffRatio: calculatePayoffRatio(meanWinningGrossPnlUsd, meanLosingGrossPnlUsd),
    maxClosedTradeCumulativePnlDrawdownUsd:
      closedTradeCount === 0 ? null : maxClosedTradeCumulativePnlDrawdownUsd(ordered),
    maxConsecutiveWins: streaks?.maxConsecutiveWins ?? null,
    maxConsecutiveLosses: streaks?.maxConsecutiveLosses ?? null,
    exitReasonBreakdown:
      closedTradeCount === 0 ? emptyExitReasonBreakdown() : calculateExitReasonBreakdown(ordered),
    concentration: calculateWinnerConcentration(ordered),
  };
}
