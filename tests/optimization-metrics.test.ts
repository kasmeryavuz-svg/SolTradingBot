import { describe, expect, it } from 'vitest';
import { allScenarioMetrics, profitFactorFromSums } from '../src/optimization/metrics.js';
import { expectancyDegradation } from '../src/optimization/walk-forward.js';
import { completedTrade } from './optimization-fixtures.js';
import { addMs } from './exit-fixtures.js';
import { O17_START } from './optimization-fixtures.js';

describe('optimization metrics', () => {
  it('represents profit factor as infinite, undefined, or finite — never a giant number', () => {
    expect(profitFactorFromSums(10, 0)).toEqual({ kind: 'infinite' });
    expect(profitFactorFromSums(0, 0)).toEqual({ kind: 'undefined' });
    expect(profitFactorFromSums(10, -5)).toEqual({ kind: 'finite', value: 2 });
  });

  it('keeps GROSS and BASE net metrics distinct', () => {
    const trades = [
      completedTrade({
        grossPnlUsd: 20,
        netBasePnlUsd: 15.6,
        netLowPnlUsd: 18,
        netStressPnlUsd: 5,
        exitedAt: addMs(O17_START, 1_000),
      }),
      completedTrade({
        grossPnlUsd: -10,
        netBasePnlUsd: -12,
        netLowPnlUsd: -11,
        netStressPnlUsd: -20,
        tokenMint: 'b',
        positionIdentity: 'p2',
        exitedAt: addMs(O17_START, 2_000),
      }),
    ];
    const metrics = allScenarioMetrics(trades);
    expect(metrics.gross.totalPnlUsd).toBe(10);
    expect(metrics.netBase.totalPnlUsd).toBeCloseTo(3.6, 10);
    expect(metrics.gross.totalPnlUsd).not.toBe(metrics.netBase.totalPnlUsd);
    expect(metrics.gross.profitFactor).toEqual({ kind: 'finite', value: 2 });
  });

  it('does not divide by zero when computing train→OOS degradation', () => {
    expect(expectancyDegradation(null, 1)).toEqual({
      pct: null,
      reason: 'missing train or OOS expectancy',
    });
    expect(expectancyDegradation(0, 1).pct).toBeNull();
    expect(expectancyDegradation(-1, 1).reason).toMatch(/train expectancy <= 0/);
    expect(expectancyDegradation(10, 5).pct).toBe(50);
  });
});
