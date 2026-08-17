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
} from './aggregate.js';
import { PERFORMANCE_SPEC_NAME, PERFORMANCE_SPEC_VERSION } from './constants.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT, fingerprintPerformanceDataset } from './identity.js';
import { divideFinite, multiplyFinite, neumaierSum, requireFiniteNumber } from './numbers.js';
import { PerformanceError, type CompletedPaperTrade, type PerformanceReport } from './types.js';

export function buildPerformanceReport(trades: readonly CompletedPaperTrade[]): PerformanceReport {
  const ordered = sortAggregateTrades(trades);
  assertUniqueTradeIdentities(ordered);

  const closedTradeCount = ordered.length;
  const wins = ordered.filter((trade) => trade.outcome === 'win');
  const losses = ordered.filter((trade) => trade.outcome === 'loss');
  const breakevens = ordered.filter((trade) => trade.outcome === 'breakeven');
  const winningPnls = wins.map((trade) => trade.grossPnlUsd);
  const losingPnls = losses.map((trade) => trade.grossPnlUsd);
  const winningReturns = wins.map((trade) => trade.grossReturnPct);
  const losingReturns = losses.map((trade) => trade.grossReturnPct);
  const allPnls = ordered.map((trade) => trade.grossPnlUsd);
  const allReturns = ordered.map((trade) => trade.grossReturnPct);

  const totalReferenceNotionalUsd =
    closedTradeCount === 0
      ? 0
      : neumaierSum(ordered.map((trade) => trade.entryReferenceNotionalUsd));
  const totalGrossExitValueUsd =
    closedTradeCount === 0 ? 0 : neumaierSum(ordered.map((trade) => trade.grossExitValueUsd));
  const totalGrossPnlUsd = closedTradeCount === 0 ? 0 : neumaierSum(allPnls);
  const totalPositiveGrossPnlUsd = winningPnls.length === 0 ? 0 : neumaierSum(winningPnls);
  const totalNegativeGrossPnlUsd = losingPnls.length === 0 ? 0 : neumaierSum(losingPnls);
  const meanWinningGrossPnlUsd = meanOf(winningPnls);
  const meanLosingGrossPnlUsd = meanOf(losingPnls);
  const streaks = closedTradeCount === 0 ? null : consecutiveOutcomeStreaks(ordered);

  return {
    dataset: {
      status: closedTradeCount === 0 ? 'no_closed_trades' : 'available',
      performanceSpecVersion: PERFORMANCE_SPEC_VERSION,
      performanceSpecName: PERFORMANCE_SPEC_NAME,
      performanceDefinitionFingerprint: PERFORMANCE_DEFINITION_FINGERPRINT,
      datasetFingerprint: fingerprintPerformanceDataset({
        performanceSpecVersion: PERFORMANCE_SPEC_VERSION,
        performanceDefinitionFingerprint: PERFORMANCE_DEFINITION_FINGERPRINT,
        trades: ordered,
      }),
      firstExitedAt: ordered[0]?.exitedAt ?? null,
      lastExitedAt: ordered[closedTradeCount - 1]?.exitedAt ?? null,
      closedTradeCount,
    },
    counts: {
      winCount: wins.length,
      lossCount: losses.length,
      breakevenCount: breakevens.length,
    },
    rates: {
      winRatePct: ratePct(wins.length, closedTradeCount),
      lossRatePct: ratePct(losses.length, closedTradeCount),
      breakevenRatePct: ratePct(breakevens.length, closedTradeCount),
    },
    capitalReferenceTotals: {
      totalReferenceNotionalUsd,
      totalGrossExitValueUsd,
      totalGrossPnlUsd,
    },
    aggregateGrossReturnPct:
      closedTradeCount === 0 || totalReferenceNotionalUsd === 0
        ? null
        : multiplyFinite(
            divideFinite(
              totalGrossPnlUsd,
              totalReferenceNotionalUsd,
              'aggregate gross return ratio',
            ),
            100,
            'aggregateGrossReturnPct',
          ),
    distribution: {
      meanGrossPnlUsd: meanOf(allPnls),
      medianGrossPnlUsd: medianOf(allPnls),
      meanGrossReturnPct: meanOf(allReturns),
      medianGrossReturnPct: medianOf(allReturns),
      bestGrossReturnPct:
        allReturns.length === 0 ? null : requireFiniteNumber(Math.max(...allReturns), 'bestGrossReturnPct'),
      worstGrossReturnPct:
        allReturns.length === 0 ? null : requireFiniteNumber(Math.min(...allReturns), 'worstGrossReturnPct'),
      meanWinningGrossPnlUsd,
      meanLosingGrossPnlUsd,
      meanWinningGrossReturnPct: meanOf(winningReturns),
      meanLosingGrossReturnPct: meanOf(losingReturns),
    },
    profitFactor: calculateProfitFactor(totalPositiveGrossPnlUsd, totalNegativeGrossPnlUsd),
    payoffRatio: calculatePayoffRatio(meanWinningGrossPnlUsd, meanLosingGrossPnlUsd),
    maxClosedTradeCumulativePnlDrawdownUsd:
      closedTradeCount === 0 ? null : maxClosedTradeCumulativePnlDrawdownUsd(ordered),
    streaks: {
      maxConsecutiveWins: streaks?.maxConsecutiveWins ?? null,
      maxConsecutiveLosses: streaks?.maxConsecutiveLosses ?? null,
    },
    exitReasonBreakdown:
      closedTradeCount === 0 ? emptyExitReasonBreakdown() : calculateExitReasonBreakdown(ordered),
    concentration: calculateWinnerConcentration(ordered),
    trades: ordered,
  };
}

function assertUniqueTradeIdentities(trades: readonly CompletedPaperTrade[]): void {
  const positions = new Set<string>();
  const exits = new Set<string>();
  for (const trade of trades) {
    if (positions.has(trade.positionSourceIdentity)) {
      throw new PerformanceError(
        'Completed paper trade dataset contains duplicate position source identities.',
      );
    }
    if (exits.has(trade.exitEvidenceSourceIdentity)) {
      throw new PerformanceError(
        'Completed paper trade dataset contains duplicate exit evidence source identities.',
      );
    }
    positions.add(trade.positionSourceIdentity);
    exits.add(trade.exitEvidenceSourceIdentity);
  }
}
