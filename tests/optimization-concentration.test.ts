import { describe, expect, it } from 'vitest';
import { maxDrawdownPctOfReferenceBasis, maxDrawdownUsd, peakCumulativeCompletedNetPnlUsd } from '../src/optimization/drawdown.js';
import { positiveProfitConcentration } from '../src/optimization/concentration.js';
import { completedTrade } from './optimization-fixtures.js';
import { addMs } from './exit-fixtures.js';
import { O17_START } from './optimization-fixtures.js';

describe('concentration and drawdown', () => {
  it('computes top1/top3 as percent of positive completed PnL only', () => {
    const trades = [
      completedTrade({ netBasePnlUsd: 8, positionIdentity: 'a', exitedAt: addMs(O17_START, 1) }),
      completedTrade({ netBasePnlUsd: 1, positionIdentity: 'b', tokenMint: 'b', exitedAt: addMs(O17_START, 2) }),
      completedTrade({ netBasePnlUsd: 1, positionIdentity: 'c', tokenMint: 'c', exitedAt: addMs(O17_START, 3) }),
      completedTrade({ netBasePnlUsd: -80, positionIdentity: 'd', tokenMint: 'd', exitedAt: addMs(O17_START, 4) }),
    ];
    const concentration = positiveProfitConcentration(trades, (trade) => trade.netBasePnlUsd);
    expect(concentration.top1).toBe(80);
    expect(concentration.top3).toBe(100);
    expect(positiveProfitConcentration([], (trade) => trade.netBasePnlUsd)).toEqual({ top1: null, top3: null });
  });

  it('computes peak-to-trough drawdown in exit-time order without using a future peak', () => {
    const trades = [
      completedTrade({ netBasePnlUsd: 10, positionIdentity: 'a', exitedAt: addMs(O17_START, 1) }),
      completedTrade({ netBasePnlUsd: -30, positionIdentity: 'b', tokenMint: 'b', exitedAt: addMs(O17_START, 2) }),
      completedTrade({ netBasePnlUsd: 100, positionIdentity: 'c', tokenMint: 'c', exitedAt: addMs(O17_START, 3) }),
    ];
    expect(maxDrawdownUsd(trades, (trade) => trade.netBasePnlUsd)).toBe(30);
  });

  it('defines drawdown percent as maxDrawdownUsd / peak cumulative completed net PnL * 100', () => {
    const trades = [
      completedTrade({ netBasePnlUsd: 100, positionIdentity: 'a', exitedAt: addMs(O17_START, 1) }),
      completedTrade({ netBasePnlUsd: -40, positionIdentity: 'b', tokenMint: 'b', exitedAt: addMs(O17_START, 2) }),
    ];
    const drawdown = maxDrawdownUsd(trades, (trade) => trade.netBasePnlUsd);
    const peak = peakCumulativeCompletedNetPnlUsd(trades, (trade) => trade.netBasePnlUsd);
    expect(drawdown).toBe(40);
    expect(peak).toBe(100);
    expect(maxDrawdownPctOfReferenceBasis(drawdown, peak)).toBe(40);
    expect(maxDrawdownPctOfReferenceBasis(500, 0)).toBeNull();
  });

  it('does not shrink drawdown percent merely because more completed trades inflate a $100-notional count', () => {
    const core = [
      completedTrade({ netBasePnlUsd: 100, positionIdentity: 'peak', exitedAt: addMs(O17_START, 1) }),
      completedTrade({
        netBasePnlUsd: -500,
        positionIdentity: 'trough',
        tokenMint: 'trough',
        exitedAt: addMs(O17_START, 2),
      }),
    ];
    const padded = [
      ...core,
      ...Array.from({ length: 360 }, (_, index) =>
        completedTrade({
          netBasePnlUsd: 0,
          positionIdentity: `pad-${String(index)}`,
          tokenMint: `pad-${String(index)}`,
          exitedAt: addMs(O17_START, 3 + index),
        }),
      ),
    ];
    const corePct = maxDrawdownPctOfReferenceBasis(
      maxDrawdownUsd(core, (trade) => trade.netBasePnlUsd),
      peakCumulativeCompletedNetPnlUsd(core, (trade) => trade.netBasePnlUsd),
    );
    const paddedPct = maxDrawdownPctOfReferenceBasis(
      maxDrawdownUsd(padded, (trade) => trade.netBasePnlUsd),
      peakCumulativeCompletedNetPnlUsd(padded, (trade) => trade.netBasePnlUsd),
    );
    expect(corePct).toBe(paddedPct);
    expect(corePct).toBe(500);
  });
});
