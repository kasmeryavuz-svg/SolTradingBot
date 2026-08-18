import { divideFinite, multiplyFinite, neumaierSum } from '../performance/numbers.js';
import { sortCompletedTradesByExit } from './drawdown.js';
import type { OptimizationCompletedTrade } from './types.js';

export function positiveProfitConcentration(
  trades: readonly OptimizationCompletedTrade[],
  pnlOf: (trade: OptimizationCompletedTrade) => number,
): { top1: number | null; top3: number | null } {
  const positives = sortCompletedTradesByExit(trades)
    .map((trade) => pnlOf(trade))
    .filter((value) => value > 0)
    .sort((left, right) => right - left);
  if (positives.length === 0) {
    return { top1: null, top3: null };
  }
  const total = neumaierSum(positives);
  if (total === 0) {
    return { top1: null, top3: null };
  }
  const top1Value = positives[0];
  if (top1Value === undefined) {
    return { top1: null, top3: null };
  }
  const top1 = multiplyFinite(divideFinite(top1Value, total, 'top1 ratio'), 100, 'top1 pct');
  const top3Sum = neumaierSum(positives.slice(0, 3));
  const top3 = multiplyFinite(divideFinite(top3Sum, total, 'top3 ratio'), 100, 'top3 pct');
  return { top1, top3 };
}

export function pnlByToken(
  trades: readonly OptimizationCompletedTrade[],
): { tokenMint: string; grossPnlUsd: number; netBasePnlUsd: number }[] {
  const grouped = new Map<string, { gross: number; base: number }>();
  for (const trade of trades) {
    const current = grouped.get(trade.tokenMint) ?? { gross: 0, base: 0 };
    grouped.set(trade.tokenMint, {
      gross: current.gross + trade.grossPnlUsd,
      base: current.base + trade.netBasePnlUsd,
    });
  }
  return [...grouped.entries()]
    .sort((left, right) => (left[0] < right[0] ? -1 : 1))
    .map(([tokenMint, pnl]) => ({
      tokenMint,
      grossPnlUsd: pnl.gross,
      netBasePnlUsd: pnl.base,
    }));
}
