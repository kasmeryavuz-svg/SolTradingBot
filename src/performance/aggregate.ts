import { CLOSED_EXIT_REASONS, type ClosedExitReason } from './types.js';
import {
  compareFiniteNumbers,
  compareText,
  createNeumaierAccumulator,
  divideFinite,
  meanOf,
  medianOf,
  multiplyFinite,
  neumaierSum,
  requireFiniteNumber,
  requireUtcMillis,
  subtractFinite,
} from './numbers.js';
import {
  PerformanceError,
  type AggregateTradeInput,
  type ExitReasonBreakdown,
  type WinnerConcentration,
} from './types.js';

export function compareAggregateTrades(
  left: AggregateTradeInput,
  right: AggregateTradeInput,
): number {
  const leftExited = requireUtcMillis(left.exitedAt, 'exitedAt');
  const rightExited = requireUtcMillis(right.exitedAt, 'exitedAt');
  if (leftExited !== rightExited) {
    return leftExited < rightExited ? -1 : 1;
  }

  const position = compareText(left.positionSourceIdentity, right.positionSourceIdentity);
  if (position !== 0) {
    return position;
  }

  const evidence = compareText(left.exitEvidenceSourceIdentity, right.exitEvidenceSourceIdentity);
  if (evidence !== 0) {
    return evidence;
  }

  return compareText(left.exitEvaluationSourceIdentity, right.exitEvaluationSourceIdentity);
}

export function sortAggregateTrades<T extends AggregateTradeInput>(trades: readonly T[]): T[] {
  return [...trades].sort(compareAggregateTrades);
}

export function ratePct(count: number, total: number): number | null {
  if (total === 0) {
    return null;
  }
  return multiplyFinite(divideFinite(count, total, 'rate ratio'), 100, 'rate pct');
}

export function calculateProfitFactor(
  totalPositiveGrossPnlUsd: number,
  totalNegativeGrossPnlUsd: number,
): number | null {
  requireFiniteNumber(totalPositiveGrossPnlUsd, 'totalPositiveGrossPnlUsd');
  requireFiniteNumber(totalNegativeGrossPnlUsd, 'totalNegativeGrossPnlUsd');
  if (totalNegativeGrossPnlUsd === 0) {
    return null;
  }
  if (totalPositiveGrossPnlUsd === 0) {
    return 0;
  }
  return divideFinite(totalPositiveGrossPnlUsd, Math.abs(totalNegativeGrossPnlUsd), 'profitFactor');
}

export function calculatePayoffRatio(
  meanWinningGrossPnlUsd: number | null,
  meanLosingGrossPnlUsd: number | null,
): number | null {
  if (meanWinningGrossPnlUsd === null || meanLosingGrossPnlUsd === null) {
    return null;
  }
  if (meanLosingGrossPnlUsd === 0) {
    return null;
  }
  return divideFinite(meanWinningGrossPnlUsd, Math.abs(meanLosingGrossPnlUsd), 'payoffRatio');
}

export function maxClosedTradeCumulativePnlDrawdownUsd(
  trades: readonly AggregateTradeInput[],
): number {
  const cumulative = createNeumaierAccumulator();
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    const current = cumulative.add(trade.grossPnlUsd);
    if (current > peak) {
      peak = current;
    }
    const drawdown = subtractFinite(peak, current, 'closed-trade cumulative PnL drawdown');
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  return maxDrawdown;
}

export function consecutiveOutcomeStreaks(trades: readonly AggregateTradeInput[]): {
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
} {
  let winStreak = 0;
  let lossStreak = 0;
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;

  for (const trade of trades) {
    if (trade.outcome === 'win') {
      winStreak += 1;
      lossStreak = 0;
    } else if (trade.outcome === 'loss') {
      lossStreak += 1;
      winStreak = 0;
    } else {
      winStreak = 0;
      lossStreak = 0;
    }

    if (winStreak > maxConsecutiveWins) {
      maxConsecutiveWins = winStreak;
    }
    if (lossStreak > maxConsecutiveLosses) {
      maxConsecutiveLosses = lossStreak;
    }
  }

  return { maxConsecutiveWins, maxConsecutiveLosses };
}

export function emptyExitReasonBreakdown(): Record<ClosedExitReason, ExitReasonBreakdown> {
  return {
    stop_loss_threshold: {
      tradeCount: 0,
      totalGrossPnlUsd: 0,
      meanGrossPnlUsd: null,
      meanGrossReturnPct: null,
    },
    take_profit_threshold: {
      tradeCount: 0,
      totalGrossPnlUsd: 0,
      meanGrossPnlUsd: null,
      meanGrossReturnPct: null,
    },
    max_holding_time: {
      tradeCount: 0,
      totalGrossPnlUsd: 0,
      meanGrossPnlUsd: null,
      meanGrossReturnPct: null,
    },
  };
}

export function calculateExitReasonBreakdown(
  trades: readonly AggregateTradeInput[],
): Record<ClosedExitReason, ExitReasonBreakdown> {
  const grouped: Record<ClosedExitReason, AggregateTradeInput[]> = {
    stop_loss_threshold: [],
    take_profit_threshold: [],
    max_holding_time: [],
  };

  for (const trade of trades) {
    if (!isClosedExitReason(trade.exitReason)) {
      throw new PerformanceError(
        `Completed paper trades cannot be grouped by exit reason ${trade.exitReason}.`,
      );
    }
    grouped[trade.exitReason].push(trade);
  }

  const breakdown = emptyExitReasonBreakdown();
  for (const reason of CLOSED_EXIT_REASONS) {
    const items = grouped[reason];
    breakdown[reason] = {
      tradeCount: items.length,
      totalGrossPnlUsd: items.length === 0 ? 0 : neumaierSum(items.map((item) => item.grossPnlUsd)),
      meanGrossPnlUsd: meanOf(items.map((item) => item.grossPnlUsd)),
      meanGrossReturnPct: meanOf(items.map((item) => item.grossReturnPct)),
    };
  }
  return breakdown;
}

export function calculateWinnerConcentration(
  trades: readonly AggregateTradeInput[],
): WinnerConcentration {
  const winners = [...trades.filter((trade) => trade.outcome === 'win')].sort(compareWinnersDesc);
  const totalGrossPnlUsd =
    trades.length === 0 ? 0 : neumaierSum(trades.map((trade) => trade.grossPnlUsd));
  const totalPositiveGrossPnlUsd =
    winners.length === 0 ? 0 : neumaierSum(winners.map((trade) => trade.grossPnlUsd));

  const top1 = winners.slice(0, 1);
  const top3 = winners.slice(0, 3);
  const top1Sum = top1.length === 0 ? 0 : neumaierSum(top1.map((trade) => trade.grossPnlUsd));
  const top3Sum = top3.length === 0 ? 0 : neumaierSum(top3.map((trade) => trade.grossPnlUsd));

  return {
    totalPositiveGrossPnlUsd,
    top1WinnerGrossPnlContributionPct:
      totalPositiveGrossPnlUsd === 0
        ? null
        : multiplyFinite(
            divideFinite(top1Sum, totalPositiveGrossPnlUsd, 'top1 contribution'),
            100,
            'top1 pct',
          ),
    top3WinnersGrossPnlContributionPct:
      totalPositiveGrossPnlUsd === 0
        ? null
        : multiplyFinite(
            divideFinite(top3Sum, totalPositiveGrossPnlUsd, 'top3 contribution'),
            100,
            'top3 pct',
          ),
    grossPnlExcludingTop1WinnerUsd: subtractFinite(
      totalGrossPnlUsd,
      top1Sum,
      'gross PnL excluding top 1',
    ),
    grossPnlExcludingTop3WinnersUsd: subtractFinite(
      totalGrossPnlUsd,
      top3Sum,
      'gross PnL excluding top 3',
    ),
    top1WinnersRemovedCount: top1.length,
    top3WinnersRemovedCount: top3.length,
  };
}

function compareWinnersDesc(left: AggregateTradeInput, right: AggregateTradeInput): number {
  const pnl = compareFiniteNumbers(right.grossPnlUsd, left.grossPnlUsd);
  if (pnl !== 0) {
    return pnl;
  }
  return compareAggregateTrades(left, right);
}

function isClosedExitReason(value: string): value is ClosedExitReason {
  return (CLOSED_EXIT_REASONS as readonly string[]).includes(value);
}

export { meanOf, medianOf, neumaierSum };
