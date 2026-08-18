import { classifyGrossOutcome } from '../performance/trade.js';
import {
  meanOf,
  medianOf,
  neumaierSum,
  requireFiniteNumber,
} from '../performance/numbers.js';
import { ratePct } from '../performance/aggregate.js';
import {
  COST_BASE_ENTRY_BPS,
  COST_BASE_EXIT_BPS,
  COST_LOW_ENTRY_BPS,
  COST_LOW_EXIT_BPS,
  COST_STRESS_ENTRY_BPS,
  COST_STRESS_EXIT_BPS,
} from './constants.js';
import { grossPnlUsd, netPnlUsd } from './costs.js';
import { positiveProfitConcentration } from './concentration.js';
import { maxDrawdownPctOfReferenceBasis, maxDrawdownUsd, peakCumulativeCompletedNetPnlUsd, sortCompletedTradesByExit } from './drawdown.js';
import type {
  OptimizationCompletedTrade,
  OptimizationCoverage,
  OptimizationExitLeg,
  OptimizationUnresolvedPosition,
  ProfitFactor,
  ScenarioMetrics,
} from './types.js';
import { OptimizationError } from './types.js';

export function profitFactorFromSums(totalPositive: number, totalNegative: number): ProfitFactor {
  requireFiniteNumber(totalPositive, 'totalPositive');
  requireFiniteNumber(totalNegative, 'totalNegative');
  if (totalNegative === 0) {
    return totalPositive > 0 ? { kind: 'infinite' } : { kind: 'undefined' };
  }
  if (totalPositive === 0) {
    return { kind: 'finite', value: 0 };
  }
  return {
    kind: 'finite',
    value: requireFiniteNumber(totalPositive / Math.abs(totalNegative), 'profitFactor'),
  };
}

export function compareProfitFactorDesc(left: ProfitFactor, right: ProfitFactor): number {
  const rank = (value: ProfitFactor): number => {
    if (value.kind === 'infinite') {
      return 2;
    }
    if (value.kind === 'finite') {
      return 1;
    }
    return 0;
  };
  const leftRank = rank(left);
  const rightRank = rank(right);
  if (leftRank !== rightRank) {
    return rightRank - leftRank;
  }
  if (left.kind === 'finite' && right.kind === 'finite') {
    if (left.value > right.value) {
      return -1;
    }
    if (left.value < right.value) {
      return 1;
    }
  }
  return 0;
}

export function buildCompletedTradeEconomics(input: {
  originalQuantityTokens: number;
  entryReferencePriceUsd: number;
  legs: readonly OptimizationExitLeg[];
}): Pick<OptimizationCompletedTrade, 'grossPnlUsd' | 'netLowPnlUsd' | 'netBasePnlUsd' | 'netStressPnlUsd' | 'outcomeGross' | 'outcomeBase'> {
  const payload = {
    originalQuantityTokens: input.originalQuantityTokens,
    entryReferencePriceUsd: input.entryReferencePriceUsd,
    legs: input.legs,
  };
  const gross = grossPnlUsd(payload);
  return {
    grossPnlUsd: gross,
    netLowPnlUsd: netPnlUsd({ ...payload, entryBps: COST_LOW_ENTRY_BPS, exitBps: COST_LOW_EXIT_BPS }),
    netBasePnlUsd: netPnlUsd({ ...payload, entryBps: COST_BASE_ENTRY_BPS, exitBps: COST_BASE_EXIT_BPS }),
    netStressPnlUsd: netPnlUsd({ ...payload, entryBps: COST_STRESS_ENTRY_BPS, exitBps: COST_STRESS_EXIT_BPS }),
    outcomeGross: classifyGrossOutcome(gross),
    outcomeBase: classifyGrossOutcome(
      netPnlUsd({ ...payload, entryBps: COST_BASE_ENTRY_BPS, exitBps: COST_BASE_EXIT_BPS }),
    ),
  };
}

export function coverageFromCounts(input: {
  snapshots: number;
  uniqueTokenMints: number;
  uniquePairs: number;
  openedPositions: number;
  completedTrades: number;
  unresolvedTrades: number;
  partiallyCensoredTrades: number;
}): OptimizationCoverage {
  const opened = input.openedPositions;
  const accounted = input.completedTrades + input.unresolvedTrades + input.partiallyCensoredTrades;
  if (accounted !== opened) {
    throw new OptimizationError(
      `Coverage accounting requires opened = completed + unresolved + partially_realized_censored. opened=${String(opened)} accounted=${String(accounted)}.`,
    );
  }
  const censored = input.unresolvedTrades + input.partiallyCensoredTrades;
  return {
    ...input,
    coveragePct:
      opened === 0 ? null : requireFiniteNumber((input.completedTrades / opened) * 100, 'coveragePct'),
    censoredFraction: opened === 0 ? null : requireFiniteNumber(censored / opened, 'censoredFraction'),
  };
}

export function scenarioMetricsFromTrades(
  trades: readonly OptimizationCompletedTrade[],
  scenarioId: ScenarioMetrics['scenarioId'],
  pnlOf: (trade: OptimizationCompletedTrade) => number,
): ScenarioMetrics {
  const ordered = sortCompletedTradesByExit(trades);
  const pnls = ordered.map(pnlOf);
  const positives = pnls.filter((value) => value > 0);
  const negatives = pnls.filter((value) => value < 0);
  const holds = ordered.map((trade) => trade.holdingDurationMs);
  const concentration = positiveProfitConcentration(ordered, pnlOf);
  const drawdown = maxDrawdownUsd(ordered, pnlOf);
  const peak = peakCumulativeCompletedNetPnlUsd(ordered, pnlOf);
  const winCount = pnls.filter((value) => value > 0).length;
  const lossCount = pnls.filter((value) => value < 0).length;
  return {
    scenarioId,
    completedTrades: ordered.length,
    totalPnlUsd: pnls.length === 0 ? 0 : neumaierSum(pnls),
    expectancyUsd: meanOf(pnls),
    medianTradePnlUsd: medianOf(pnls),
    winRatePct: ratePct(winCount, ordered.length),
    lossRatePct: ratePct(lossCount, ordered.length),
    profitFactor: profitFactorFromSums(
      positives.length === 0 ? 0 : neumaierSum(positives),
      negatives.length === 0 ? 0 : neumaierSum(negatives),
    ),
    largestWinUsd: positives.length === 0 ? null : requireFiniteNumber(Math.max(...positives), 'largestWin'),
    largestLossUsd: negatives.length === 0 ? null : requireFiniteNumber(Math.min(...negatives), 'largestLoss'),
    maxDrawdownUsd: drawdown,
    maxDrawdownPctOfReferenceBasis: maxDrawdownPctOfReferenceBasis(drawdown, peak),
    averageHoldDurationMs: meanOf(holds),
    medianHoldDurationMs: medianOf(holds),
    top1PositiveConcentration: concentration.top1,
    top3PositiveConcentration: concentration.top3,
  };
}

export function allScenarioMetrics(trades: readonly OptimizationCompletedTrade[]): {
  gross: ScenarioMetrics;
  netLow: ScenarioMetrics;
  netBase: ScenarioMetrics;
  netStress: ScenarioMetrics;
} {
  return {
    gross: scenarioMetricsFromTrades(trades, 'GROSS', (trade) => trade.grossPnlUsd),
    netLow: scenarioMetricsFromTrades(trades, 'LOW', (trade) => trade.netLowPnlUsd),
    netBase: scenarioMetricsFromTrades(trades, 'BASE', (trade) => trade.netBasePnlUsd),
    netStress: scenarioMetricsFromTrades(trades, 'STRESS', (trade) => trade.netStressPnlUsd),
  };
}

export function unresolvedAndPartialCounts(positions: readonly OptimizationUnresolvedPosition[]): {
  unresolvedTrades: number;
  partiallyCensoredTrades: number;
} {
  return {
    unresolvedTrades: positions.filter((item) => item.unresolvedReason !== 'partially_realized_censored').length,
    partiallyCensoredTrades: positions.filter((item) => item.unresolvedReason === 'partially_realized_censored')
      .length,
  };
}
