import { describe, expect, it } from 'vitest';
import {
  buildPerformanceReport,
  calculateGrossExitValueUsd,
  calculateGrossPnlUsd,
  calculateGrossReturnPct,
  calculateGrossTradeMetrics,
  calculateHoldingDurationMs,
  calculatePayoffRatio,
  calculateProfitFactor,
  calculateWinnerConcentration,
  canonicalizeZero,
  classifyGrossOutcome,
  consecutiveOutcomeStreaks,
  maxClosedTradeCumulativePnlDrawdownUsd,
  neumaierSum,
} from '../src/performance/index.js';
import { PerformanceError } from '../src/performance/types.js';
import {
  addMs,
  paperTrade,
  TRADE_A,
  TRADE_B,
  TRADE_C,
  TRADE_Q,
  TRADE_ZERO,
  T_10_00,
} from './performance-fixtures.js';

describe('a12_v1 gross paper trade math', () => {
  it('calculates obvious gross exit value, PnL, return, duration, and outcomes without rounding', () => {
    expect(TRADE_A).toMatchObject({
      grossExitValueUsd: 120,
      grossPnlUsd: 20,
      grossReturnPct: (120 / 100 - 1) * 100,
      outcome: 'win',
    });
    expect(TRADE_B).toMatchObject({
      grossExitValueUsd: 90,
      grossPnlUsd: -10,
      grossReturnPct: (90 / 100 - 1) * 100,
      outcome: 'loss',
    });
    expect(TRADE_C).toMatchObject({
      grossExitValueUsd: 100,
      grossPnlUsd: 0,
      grossReturnPct: 0,
      outcome: 'breakeven',
    });
    expect(TRADE_ZERO).toMatchObject({
      grossExitValueUsd: 0,
      grossPnlUsd: -100,
      grossReturnPct: -100,
      outcome: 'loss',
    });
    expect(TRADE_Q).toMatchObject({
      quantityTokens: 2,
      entryPriceUsd: 50,
      entryReferenceNotionalUsd: 100,
      grossExitValueUsd: 200,
      grossPnlUsd: 100,
      grossReturnPct: 100,
      outcome: 'win',
    });
    expect(calculateGrossExitValueUsd(1, 0)).toBe(0);
    expect(calculateGrossPnlUsd(0, 100)).toBe(-100);
    expect(calculateGrossReturnPct(100, 0)).toBe(-100);
    expect(classifyGrossOutcome(0)).toBe('breakeven');
    expect(calculateHoldingDurationMs(1_000, 1_250)).toBe(250);
    expect(Object.is(calculateGrossReturnPct(50, 100), 100)).toBe(true);
    expect(Object.is(TRADE_A.grossReturnPct, 20)).toBe(false);
  });

  it('uses stored quantity instead of recomputing 100 / entry price', () => {
    const metrics = calculateGrossTradeMetrics({
      entryPriceUsd: 50,
      entryReferenceNotionalUsd: 100,
      quantityTokens: 3,
      exitPriceUsd: 100,
      openedAtMs: 0,
      exitedAtMs: 1,
    });
    expect(metrics.grossExitValueUsd).toBe(300);
    expect(metrics.grossPnlUsd).toBe(200);
    expect(metrics.grossReturnPct).toBe(100);
  });

  it('rejects nonfinite domain calculations', () => {
    expect(() => calculateGrossExitValueUsd(Number.POSITIVE_INFINITY, 1)).toThrow(PerformanceError);
    expect(() => calculateGrossPnlUsd(Number.NaN, 100)).toThrow(PerformanceError);
    expect(() => calculateGrossReturnPct(0, 100)).toThrow(PerformanceError);
    expect(() => calculateGrossReturnPct(-1, 100)).toThrow(PerformanceError);
    expect(() => calculateHoldingDurationMs(10, 9)).toThrow(PerformanceError);
    expect(() => classifyGrossOutcome(Number.NaN)).toThrow(PerformanceError);
  });
});

describe('a12_v1 aggregate metrics', () => {
  it('computes known-answer counts, rates, totals, mean, median, and ratios', () => {
    const report = buildPerformanceReport([TRADE_A, TRADE_B, TRADE_C]);
    expect(report.dataset.status).toBe('available');
    expect(report.dataset.closedTradeCount).toBe(3);
    expect(report.counts).toEqual({ winCount: 1, lossCount: 1, breakevenCount: 1 });
    expect(report.rates.winRatePct).toBeCloseTo(100 / 3, 12);
    expect(report.rates.lossRatePct).toBeCloseTo(100 / 3, 12);
    expect(report.rates.breakevenRatePct).toBeCloseTo(100 / 3, 12);
    expect(report.capitalReferenceTotals).toEqual({
      totalReferenceNotionalUsd: 300,
      totalGrossExitValueUsd: 310,
      totalGrossPnlUsd: 10,
    });
    expect(report.aggregateGrossReturnPct).toBeCloseTo((10 / 300) * 100, 12);
    expect(report.distribution.meanGrossPnlUsd).toBeCloseTo(10 / 3, 12);
    expect(report.distribution.medianGrossPnlUsd).toBe(0);
    expect(report.distribution.meanGrossReturnPct).toBeCloseTo(
      (TRADE_A.grossReturnPct + TRADE_B.grossReturnPct + TRADE_C.grossReturnPct) / 3,
      12,
    );
    expect(report.distribution.medianGrossReturnPct).toBe(0);
    expect(report.distribution.bestGrossReturnPct).toBe(TRADE_A.grossReturnPct);
    expect(report.distribution.worstGrossReturnPct).toBe(TRADE_B.grossReturnPct);
    expect(report.distribution.meanWinningGrossPnlUsd).toBe(20);
    expect(report.distribution.meanLosingGrossPnlUsd).toBe(-10);
    expect(report.distribution.meanWinningGrossReturnPct).toBe(TRADE_A.grossReturnPct);
    expect(report.distribution.meanLosingGrossReturnPct).toBe(TRADE_B.grossReturnPct);
    expect(report.profitFactor).toBe(20 / 10);
    expect(report.payoffRatio).toBe(20 / 10);
    expect(report.exitReasonBreakdown.take_profit_threshold.tradeCount).toBe(1);
    expect(report.exitReasonBreakdown.stop_loss_threshold.tradeCount).toBe(1);
    expect(report.exitReasonBreakdown.max_holding_time.tradeCount).toBe(1);
    expect(report.exitReasonBreakdown.max_holding_time.meanGrossPnlUsd).toBe(0);
  });

  it('uses even-count median as the unrounded midpoint of the two central values', () => {
    const report = buildPerformanceReport([TRADE_A, TRADE_B]);
    expect(report.distribution.medianGrossPnlUsd).toBe(5);
    expect(report.distribution.medianGrossReturnPct).toBe(
      (TRADE_A.grossReturnPct + TRADE_B.grossReturnPct) / 2,
    );
  });

  it('returns null subgroup means, rates, and ratios when there are no closed trades', () => {
    const report = buildPerformanceReport([]);
    expect(report.dataset.status).toBe('no_closed_trades');
    expect(report.dataset.closedTradeCount).toBe(0);
    expect(report.counts).toEqual({ winCount: 0, lossCount: 0, breakevenCount: 0 });
    expect(report.rates).toEqual({ winRatePct: null, lossRatePct: null, breakevenRatePct: null });
    expect(report.capitalReferenceTotals).toEqual({
      totalReferenceNotionalUsd: 0,
      totalGrossExitValueUsd: 0,
      totalGrossPnlUsd: 0,
    });
    expect(report.aggregateGrossReturnPct).toBeNull();
    expect(report.distribution.meanGrossPnlUsd).toBeNull();
    expect(report.distribution.medianGrossPnlUsd).toBeNull();
    expect(report.distribution.bestGrossReturnPct).toBeNull();
    expect(report.distribution.meanWinningGrossPnlUsd).toBeNull();
    expect(report.distribution.meanLosingGrossPnlUsd).toBeNull();
    expect(report.profitFactor).toBeNull();
    expect(report.payoffRatio).toBeNull();
    expect(report.maxClosedTradeCumulativePnlDrawdownUsd).toBeNull();
    expect(report.streaks).toEqual({ maxConsecutiveWins: null, maxConsecutiveLosses: null });
    expect(report.concentration.top1WinnerGrossPnlContributionPct).toBeNull();
    expect(report.dataset.firstExitedAt).toBeNull();
    expect(report.dataset.lastExitedAt).toBeNull();
  });

  it('sets profit factor to null when there are no losses, and to 0 when there are only losses', () => {
    expect(calculateProfitFactor(20, 0)).toBeNull();
    expect(calculateProfitFactor(0, -10)).toBe(0);
    expect(calculateProfitFactor(20, -10)).toBe(2);
    expect(buildPerformanceReport([TRADE_A]).profitFactor).toBeNull();
    expect(buildPerformanceReport([TRADE_B]).profitFactor).toBe(0);
    expect(calculatePayoffRatio(20, null)).toBeNull();
    expect(buildPerformanceReport([TRADE_A]).payoffRatio).toBeNull();
  });

  it('orders trades by exitedAt then immutable source identities', () => {
    const later = paperTrade({
      positionSourceIdentity: 'z-last',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 10),
      entryPriceUsd: 100,
      quantityTokens: 1,
      exitPriceUsd: 110,
    });
    const earlierB = paperTrade({
      positionSourceIdentity: 'b-identity',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 5),
      entryPriceUsd: 100,
      quantityTokens: 1,
      exitPriceUsd: 110,
    });
    const earlierA = paperTrade({
      positionSourceIdentity: 'a-identity',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 5),
      entryPriceUsd: 100,
      quantityTokens: 1,
      exitPriceUsd: 110,
    });
    const report = buildPerformanceReport([later, earlierB, earlierA]);
    expect(report.trades.map((trade) => trade.positionSourceIdentity)).toEqual([
      'a-identity',
      'b-identity',
      'z-last',
    ]);
    expect(report.dataset.firstExitedAt).toBe(addMs(T_10_00, 5));
    expect(report.dataset.lastExitedAt).toBe(addMs(T_10_00, 10));
  });
});

describe('closed-trade cumulative GROSS paper PnL drawdown', () => {
  it('matches the known +20 -10 -30 +15 +50 series with peak starting at zero', () => {
    const series = [20, -10, -30, 15, 50].map((pnl, index) =>
      paperTrade({
        positionSourceIdentity: `dd-${String(index)}`,
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, (index + 1) * 1_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 100 + pnl,
      }),
    );
    expect(series.map((trade) => trade.grossPnlUsd)).toEqual([20, -10, -30, 15, 50]);
    expect(maxClosedTradeCumulativePnlDrawdownUsd(series)).toBe(40);
    expect(buildPerformanceReport(series).maxClosedTradeCumulativePnlDrawdownUsd).toBe(40);
  });

  it('uses a zero starting peak so an opening loss is a drawdown from zero', () => {
    const series = [-10, 5].map((pnl, index) =>
      paperTrade({
        positionSourceIdentity: `loss-first-${String(index)}`,
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, (index + 1) * 1_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 100 + pnl,
      }),
    );
    expect(maxClosedTradeCumulativePnlDrawdownUsd(series)).toBe(10);
  });
});

describe('streaks', () => {
  it('resets both win and loss streaks on breakeven', () => {
    const outcomes: Array<{ pnl: number; identity: string }> = [
      { pnl: 1, identity: 'w1' },
      { pnl: 1, identity: 'w2' },
      { pnl: 0, identity: 'be' },
      { pnl: -1, identity: 'l1' },
      { pnl: -1, identity: 'l2' },
      { pnl: -1, identity: 'l3' },
      { pnl: 1, identity: 'w3' },
    ];
    const trades = outcomes.map((item, index) =>
      paperTrade({
        positionSourceIdentity: item.identity,
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, (index + 1) * 1_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 100 + item.pnl,
      }),
    );
    expect(trades.map((trade) => trade.outcome)).toEqual([
      'win',
      'win',
      'breakeven',
      'loss',
      'loss',
      'loss',
      'win',
    ]);
    expect(consecutiveOutcomeStreaks(trades)).toEqual({
      maxConsecutiveWins: 2,
      maxConsecutiveLosses: 3,
    });
  });
});

describe('winner concentration', () => {
  it('uses total positive GROSS PnL as the contribution denominator', () => {
    const trades = [
      paperTrade({
        positionSourceIdentity: 'big',
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, 1_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 180,
      }),
      paperTrade({
        positionSourceIdentity: 'small',
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, 2_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 110,
      }),
      paperTrade({
        positionSourceIdentity: 'loss',
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, 3_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 40,
      }),
    ];
    expect(trades.map((trade) => trade.grossPnlUsd)).toEqual([80, 10, -60]);
    const concentration = calculateWinnerConcentration(trades);
    expect(concentration.totalPositiveGrossPnlUsd).toBe(90);
    expect(concentration.top1WinnerGrossPnlContributionPct).toBeCloseTo((80 / 90) * 100, 12);
    expect(concentration.top3WinnersGrossPnlContributionPct).toBe(100);
    expect(concentration.grossPnlExcludingTop1WinnerUsd).toBe(30 - 80);
    expect(concentration.grossPnlExcludingTop3WinnersUsd).toBe(30 - 90);
    expect(concentration.top1WinnersRemovedCount).toBe(1);
    expect(concentration.top3WinnersRemovedCount).toBe(2);
    expect(buildPerformanceReport(trades).capitalReferenceTotals.totalGrossPnlUsd).toBe(30);
  });

  it('handles no winners, 1 winner, 2 winners, and 3+ winners', () => {
    expect(
      calculateWinnerConcentration([TRADE_B, TRADE_C]).top1WinnerGrossPnlContributionPct,
    ).toBeNull();
    expect(calculateWinnerConcentration([TRADE_B, TRADE_C]).top1WinnersRemovedCount).toBe(0);
    expect(calculateWinnerConcentration([TRADE_B, TRADE_C]).grossPnlExcludingTop1WinnerUsd).toBe(
      -10,
    );

    const one = calculateWinnerConcentration([TRADE_A, TRADE_B]);
    expect(one.top1WinnerGrossPnlContributionPct).toBe(100);
    expect(one.top3WinnersGrossPnlContributionPct).toBe(100);
    expect(one.top1WinnersRemovedCount).toBe(1);
    expect(one.top3WinnersRemovedCount).toBe(1);

    const two = calculateWinnerConcentration([TRADE_A, TRADE_Q, TRADE_B]);
    expect(two.top1WinnersRemovedCount).toBe(1);
    expect(two.top3WinnersRemovedCount).toBe(2);
    expect(two.top1WinnerGrossPnlContributionPct).toBeCloseTo((100 / 120) * 100, 12);

    const three = calculateWinnerConcentration([
      TRADE_A,
      TRADE_Q,
      paperTrade({
        positionSourceIdentity: 'mid',
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, 400_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 130,
      }),
    ]);
    expect(three.top3WinnersRemovedCount).toBe(3);
    expect(three.top3WinnersGrossPnlContributionPct).toBe(100);
  });

  it('breaks equal-sized top-winner ties with immutable trade identity, not array order', () => {
    const first = paperTrade({
      positionSourceIdentity: 'aaa',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 1_000),
      entryPriceUsd: 100,
      quantityTokens: 1,
      exitPriceUsd: 130,
    });
    const second = paperTrade({
      positionSourceIdentity: 'zzz',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 2_000),
      entryPriceUsd: 100,
      quantityTokens: 1,
      exitPriceUsd: 130,
    });
    expect(first.grossPnlUsd).toBe(second.grossPnlUsd);
    const forward = calculateWinnerConcentration([second, first]);
    const reverse = calculateWinnerConcentration([first, second]);
    expect(forward.top1WinnersRemovedCount).toBe(1);
    expect(forward.grossPnlExcludingTop1WinnerUsd).toBe(reverse.grossPnlExcludingTop1WinnerUsd);
    expect(forward.top1WinnerGrossPnlContributionPct).toBe(50);
    const report = buildPerformanceReport([second, first, TRADE_B]);
    expect(report.concentration.top1WinnersRemovedCount).toBe(1);
    expect(report.capitalReferenceTotals.totalGrossPnlUsd).toBe(50);
  });
});

describe('signed zero and numeric stability', () => {
  it('canonicalizes IEEE -0 to +0 without rounding', () => {
    expect(Object.is(-0, 0)).toBe(false);
    expect(JSON.stringify(-0)).toBe('0');
    expect(Object.is(canonicalizeZero(-0), 0)).toBe(true);
    expect(Object.is(canonicalizeZero(0), 0)).toBe(true);
    expect(classifyGrossOutcome(-0)).toBe('breakeven');
    expect(classifyGrossOutcome(0)).toBe('breakeven');
    expect(classifyGrossOutcome(Number.MIN_VALUE)).toBe('win');
    expect(classifyGrossOutcome(-Number.MIN_VALUE)).toBe('loss');
    const report = buildPerformanceReport([TRADE_C]);
    expect(Object.is(report.capitalReferenceTotals.totalGrossPnlUsd, 0)).toBe(true);
    expect(JSON.stringify({ n: report.capitalReferenceTotals.totalGrossPnlUsd })).toBe('{"n":0}');
  });

  it('uses Neumaier summation for a large + small + negative-large sequence', () => {
    expect(neumaierSum([1e16, 1, -1e16])).toBe(1);
    expect(1e16 + 1 + -1e16).toBe(0);
    const hostile = [
      { ...TRADE_A, positionSourceIdentity: 'large-pos', grossPnlUsd: 1e16, grossExitValueUsd: 100 + 1e16, outcome: 'win' as const, exitedAt: addMs(T_10_00, 1_000), exitEvidenceSourceIdentity: 'large-pos:exit', exitEvaluationSourceIdentity: 'large-pos:eval' },
      { ...TRADE_A, positionSourceIdentity: 'tiny', grossPnlUsd: 1, grossExitValueUsd: 101, outcome: 'win' as const, exitedAt: addMs(T_10_00, 2_000), exitEvidenceSourceIdentity: 'tiny:exit', exitEvaluationSourceIdentity: 'tiny:eval' },
      { ...TRADE_A, positionSourceIdentity: 'large-neg', grossPnlUsd: -1e16, grossExitValueUsd: 100 - 1e16, outcome: 'loss' as const, exitedAt: addMs(T_10_00, 3_000), exitEvidenceSourceIdentity: 'large-neg:exit', exitEvaluationSourceIdentity: 'large-neg:eval' },
    ];
    expect(buildPerformanceReport(hostile).capitalReferenceTotals.totalGrossPnlUsd).toBe(1);
  });
});

describe('closed-trade drawdown edge cases', () => {
  it('is 0 for all wins, equals the deepest cumulative loss for all losses, and ignores breakevens', () => {
    const wins = [10, 5, 1].map((pnl, index) =>
      paperTrade({
        positionSourceIdentity: `win-${String(index)}`,
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, (index + 1) * 1_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 100 + pnl,
      }),
    );
    expect(maxClosedTradeCumulativePnlDrawdownUsd(wins)).toBe(0);

    const losses = [-5, -7, -1].map((pnl, index) =>
      paperTrade({
        positionSourceIdentity: `loss-${String(index)}`,
        openedAt: T_10_00,
        exitedAt: addMs(T_10_00, (index + 1) * 1_000),
        entryPriceUsd: 100,
        quantityTokens: 1,
        exitPriceUsd: 100 + pnl,
      }),
    );
    expect(maxClosedTradeCumulativePnlDrawdownUsd(losses)).toBe(13);

    const breakevens = [TRADE_C];
    expect(maxClosedTradeCumulativePnlDrawdownUsd(breakevens)).toBe(0);
    expect(buildPerformanceReport([]).maxClosedTradeCumulativePnlDrawdownUsd).toBeNull();
  });
});

describe('ratio and median empty-set semantics', () => {
  it('keeps profit factor 0 for losses-only, null for wins-only, breakevens, and no trades', () => {
    expect(buildPerformanceReport([TRADE_A, TRADE_Q]).profitFactor).toBeNull();
    expect(buildPerformanceReport([TRADE_B, TRADE_ZERO]).profitFactor).toBe(0);
    expect(buildPerformanceReport([TRADE_C]).profitFactor).toBeNull();
    expect(buildPerformanceReport([]).profitFactor).toBeNull();
    expect(buildPerformanceReport([TRADE_A]).payoffRatio).toBeNull();
    expect(buildPerformanceReport([TRADE_B]).payoffRatio).toBeNull();
    expect(buildPerformanceReport([TRADE_A, TRADE_B]).payoffRatio).toBe(2);
    expect(buildPerformanceReport([TRADE_C]).payoffRatio).toBeNull();
    expect(buildPerformanceReport([]).aggregateGrossReturnPct).toBeNull();
  });

  it('computes odd, even, and duplicate medians without rounding', () => {
    expect(buildPerformanceReport([TRADE_A, TRADE_B, TRADE_C]).distribution.medianGrossPnlUsd).toBe(
      0,
    );
    expect(buildPerformanceReport([TRADE_A, TRADE_B]).distribution.medianGrossPnlUsd).toBe(5);
    const duplicates = [TRADE_A, paperTrade({
      positionSourceIdentity: 'dup',
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 90_000),
      entryPriceUsd: 100,
      quantityTokens: 1,
      exitPriceUsd: 120,
    })];
    expect(buildPerformanceReport(duplicates).distribution.medianGrossPnlUsd).toBe(20);
  });
});

