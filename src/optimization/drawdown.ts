import { compareText, requireFiniteNumber, subtractFinite } from '../performance/numbers.js';
import type { OptimizationCompletedTrade } from './types.js';

export function sortCompletedTradesByExit(trades: readonly OptimizationCompletedTrade[]): OptimizationCompletedTrade[] {
  return [...trades].sort((left, right) => {
    if (left.exitedAt !== right.exitedAt) {
      return left.exitedAt < right.exitedAt ? -1 : 1;
    }
    const token = compareText(left.tokenMint, right.tokenMint);
    if (token !== 0) {
      return token;
    }
    const pair = compareText(left.pairAddress, right.pairAddress);
    if (pair !== 0) {
      return pair;
    }
    return compareText(left.positionIdentity, right.positionIdentity);
  });
}

export function maxDrawdownUsd(
  trades: readonly OptimizationCompletedTrade[],
  pnlOf: (trade: OptimizationCompletedTrade) => number,
): number | null {
  if (trades.length === 0) {
    return null;
  }
  const ordered = sortCompletedTradesByExit(trades);
  let peak = 0;
  let maxDrawdown = 0;
  let cumulative = 0;
  for (const trade of ordered) {
    cumulative = requireFiniteNumber(cumulative + pnlOf(trade), 'cumulative pnl');
    if (cumulative > peak) {
      peak = cumulative;
    }
    const drawdown = subtractFinite(peak, cumulative, 'drawdown');
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
    }
  }
  return maxDrawdown;
}

export function peakCumulativeCompletedNetPnlUsd(
  trades: readonly OptimizationCompletedTrade[],
  pnlOf: (trade: OptimizationCompletedTrade) => number,
): number | null {
  if (trades.length === 0) {
    return null;
  }
  const ordered = sortCompletedTradesByExit(trades);
  let peak = 0;
  let cumulative = 0;
  for (const trade of ordered) {
    cumulative = requireFiniteNumber(cumulative + pnlOf(trade), 'cumulative pnl');
    if (cumulative > peak) {
      peak = cumulative;
    }
  }
  return peak;
}

/**
 * Research drawdown percent: maxDrawdownUsd / peak cumulative completed-trade
 * net PnL * 100. This is NOT bankroll/portfolio drawdown. o17 has no capital
 * constraint. The denominator is peak equity of the completed-trade PnL path,
 * so adding more completed trades does not shrink the percentage unless they
 * actually raise that peak.
 *
 * If peak <= 0, percent is null (undefined as a peak-relative quantity).
 */
export function maxDrawdownPctOfReferenceBasis(
  maxDrawdown: number | null,
  peakCumulativeCompletedNetPnlUsd: number | null,
): number | null {
  if (maxDrawdown === null || peakCumulativeCompletedNetPnlUsd === null) {
    return null;
  }
  if (!(peakCumulativeCompletedNetPnlUsd > 0)) {
    return null;
  }
  return requireFiniteNumber(
    (maxDrawdown / peakCumulativeCompletedNetPnlUsd) * 100,
    'maxDrawdownPctOfPeakCumulativePnl',
  );
}
