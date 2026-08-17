/**
 * Frozen 60/20/20 elapsed-time slices.
 *
 * early:  [first, first + floor(span * 0.6))
 * middle: [earlyEnd, first + floor(span * 0.8))
 * late:   [middleEnd, last]
 *
 * Boundaries are exclusive on the early and middle ends. A trade whose exit
 * timestamp equals earlyEnd is MIDDLE. A trade whose exit timestamp equals
 * middleEnd is LATE. Span 0 assigns every completed trade to EARLY.
 *
 * Simulation is continuous and is not reset at these reporting boundaries.
 * Assignment uses EXIT timestamp only.
 *
 * A 1ms span has floor(span * 0.6) = 0 and floor(span * 0.8) = 0, so the early
 * and middle intervals are empty and every completed trade is LATE. Span 0 is
 * the only case that forces EARLY.
 */
import { requireUtcTimestamp } from '../features/numbers.js';
import { calculateProfitFactor, calculateWinnerConcentration, meanOf, ratePct } from '../performance/aggregate.js';
import { neumaierSum } from '../performance/numbers.js';
import { SLICE_EARLY_ELAPSED_FRACTION, SLICE_MIDDLE_ELAPSED_FRACTION } from './constants.js';
import { researchTradeToAggregateInput } from './aggregate.js';
import type {
  ResearchChronologicalSlice,
  ResearchCompletedTrade,
  ResearchSliceMetrics,
} from './types.js';

export function assignResearchSlice(input: {
  exitedAt: string;
  firstSnapshotAt: string;
  lastSnapshotAt: string;
}): ResearchChronologicalSlice {
  const exitedMs = requireUtcTimestamp(input.exitedAt, 'exitedAt');
  const firstMs = requireUtcTimestamp(input.firstSnapshotAt, 'firstSnapshotAt');
  const lastMs = requireUtcTimestamp(input.lastSnapshotAt, 'lastSnapshotAt');
  const spanMs = lastMs - firstMs;
  if (spanMs === 0) {
    return 'early';
  }

  const earlyEndExclusive = firstMs + Math.floor(spanMs * SLICE_EARLY_ELAPSED_FRACTION);
  const middleEndExclusive =
    firstMs + Math.floor(spanMs * (SLICE_EARLY_ELAPSED_FRACTION + SLICE_MIDDLE_ELAPSED_FRACTION));

  if (exitedMs < earlyEndExclusive) {
    return 'early';
  }
  if (exitedMs < middleEndExclusive) {
    return 'middle';
  }
  return 'late';
}

export function buildResearchSliceMetrics(input: {
  trades: readonly ResearchCompletedTrade[];
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
}): ResearchSliceMetrics[] {
  const slices: ResearchChronologicalSlice[] = ['early', 'middle', 'late'];
  if (input.firstSnapshotAt === null || input.lastSnapshotAt === null) {
    return slices.map((slice) => emptySlice(slice));
  }

  const grouped: Record<ResearchChronologicalSlice, ResearchCompletedTrade[]> = {
    early: [],
    middle: [],
    late: [],
  };
  for (const trade of input.trades) {
    const slice = assignResearchSlice({
      exitedAt: trade.exitedAt,
      firstSnapshotAt: input.firstSnapshotAt,
      lastSnapshotAt: input.lastSnapshotAt,
    });
    grouped[slice].push(trade);
  }

  return slices.map((slice) => metricsForSlice(slice, grouped[slice]));
}

function metricsForSlice(
  slice: ResearchChronologicalSlice,
  trades: readonly ResearchCompletedTrade[],
): ResearchSliceMetrics {
  if (trades.length === 0) {
    return emptySlice(slice);
  }

  const aggregateInputs = trades.map(researchTradeToAggregateInput);
  const wins = trades.filter((trade) => trade.outcome === 'win');
  const winningPnls = wins.map((trade) => trade.grossPnlUsd);
  const losingPnls = trades.filter((trade) => trade.outcome === 'loss').map((trade) => trade.grossPnlUsd);
  const concentration = calculateWinnerConcentration(aggregateInputs);

  return {
    slice,
    completedTradeCount: trades.length,
    totalGrossPnlUsd: neumaierSum(trades.map((trade) => trade.grossPnlUsd)),
    meanGrossReturnPct: meanOf(trades.map((trade) => trade.grossReturnPct)),
    winRatePct: ratePct(wins.length, trades.length),
    profitFactor: calculateProfitFactor(
      winningPnls.length === 0 ? 0 : neumaierSum(winningPnls),
      losingPnls.length === 0 ? 0 : neumaierSum(losingPnls),
    ),
    top1WinnerGrossPnlContributionPct: concentration.top1WinnerGrossPnlContributionPct,
  };
}

function emptySlice(slice: ResearchChronologicalSlice): ResearchSliceMetrics {
  return {
    slice,
    completedTradeCount: 0,
    totalGrossPnlUsd: null,
    meanGrossReturnPct: null,
    winRatePct: null,
    profitFactor: null,
    top1WinnerGrossPnlContributionPct: null,
  };
}
