import { describe, expect, it } from 'vitest';
import {
  buildPerformanceReport,
  calculateGrossTradeMetrics,
  calculatePayoffRatio,
  calculateWinnerConcentration,
  maxClosedTradeCumulativePnlDrawdownUsd,
} from '../src/performance/index.js';
import { requireUtcMillis } from '../src/performance/numbers.js';
import {
  aggregateResearchCompletedTrades,
  assignResearchSlice,
  buildResearchCompletedTrade,
  buildResearchSliceMetrics,
  researchTradeToAggregateInput,
} from '../src/research/index.js';
import { TRADE_A, TRADE_B, TRADE_C } from './performance-fixtures.js';
import { allEntrySnapshot, makeResearchDataset } from './research-fixtures.js';

describe('a12-compatible research performance math', () => {
  it('matches Checkpoint 12 generic functions exactly on the same synthetic trade', () => {
    const research = buildResearchCompletedTrade({
      researchDefinitionFingerprint: 'def',
      candidateId: 'quality_control_v1',
      candidateDefinitionFingerprint: 'cand',
      researchDatasetFingerprint: 'data',
      tokenMint: TRADE_A.tokenMint,
      pairAddress: TRADE_A.pairAddress,
      researchPositionIdentity: TRADE_A.positionSourceIdentity,
      entryMarketIdentity: 'entry',
      exitMarketIdentity: 'exit',
      openedAt: TRADE_A.openedAt,
      exitedAt: TRADE_A.exitedAt,
      entryPriceUsd: TRADE_A.entryPriceUsd,
      quantityTokens: TRADE_A.quantityTokens,
      exitPriceUsd: TRADE_A.exitPriceUsd,
      exitReason: TRADE_A.exitReason,
    });
    const generic = calculateGrossTradeMetrics({
      entryPriceUsd: TRADE_A.entryPriceUsd,
      entryReferenceNotionalUsd: TRADE_A.entryReferenceNotionalUsd,
      quantityTokens: TRADE_A.quantityTokens,
      exitPriceUsd: TRADE_A.exitPriceUsd,
      openedAtMs: requireUtcMillis(TRADE_A.openedAt, 'openedAt'),
      exitedAtMs: requireUtcMillis(TRADE_A.exitedAt, 'exitedAt'),
    });
    expect(research.grossExitValueUsd).toBe(generic.grossExitValueUsd);
    expect(research.grossPnlUsd).toBe(generic.grossPnlUsd);
    expect(research.grossReturnPct).toBe(generic.grossReturnPct);
    expect(research.outcome).toBe(generic.outcome);
    expect(research.grossExitValueUsd).toBe(TRADE_A.grossExitValueUsd);
    expect(research.grossPnlUsd).toBe(TRADE_A.grossPnlUsd);
  });

  it('matches a12 aggregate helpers for profit factor, payoff, drawdown, and concentration', () => {
    const sources = [TRADE_A, TRADE_B, TRADE_C];
    const trades = sources.map((trade, index) =>
      buildResearchCompletedTrade({
        researchDefinitionFingerprint: 'def',
        candidateId: 's07_baseline',
        candidateDefinitionFingerprint: 's07',
        researchDatasetFingerprint: 'data',
        tokenMint: trade.tokenMint,
        pairAddress: trade.pairAddress,
        researchPositionIdentity: `${trade.positionSourceIdentity}:${String(index)}`,
        entryMarketIdentity: `entry:${String(index)}`,
        exitMarketIdentity: `exit:${String(index)}`,
        openedAt: trade.openedAt,
        exitedAt: trade.exitedAt,
        entryPriceUsd: trade.entryPriceUsd,
        quantityTokens: trade.quantityTokens,
        exitPriceUsd: trade.exitPriceUsd,
        exitReason: trade.exitReason,
      }),
    );
    const research = aggregateResearchCompletedTrades(trades);
    const mapped = trades.map(researchTradeToAggregateInput);
    const a12Trades = trades.map((trade) => ({
      ...TRADE_A,
      tokenMint: trade.tokenMint,
      pairAddress: trade.pairAddress,
      positionSourceIdentity: trade.researchPositionIdentity,
      exitEvidenceSourceIdentity: trade.researchTradeIdentity,
      exitEvaluationSourceIdentity: trade.exitMarketIdentity,
      openedAt: trade.openedAt,
      exitedAt: trade.exitedAt,
      holdingDurationMs: trade.holdingDurationMs,
      entryPriceUsd: trade.entryPriceUsd,
      entryReferenceNotionalUsd: trade.entryReferenceNotionalUsd,
      quantityTokens: trade.quantityTokens,
      exitPriceUsd: trade.exitPriceUsd,
      grossExitValueUsd: trade.grossExitValueUsd,
      grossPnlUsd: trade.grossPnlUsd,
      grossReturnPct: trade.grossReturnPct,
      outcome: trade.outcome,
      exitReason: trade.exitReason,
    }));
    const a12 = buildPerformanceReport(a12Trades);
    expect(research.profitFactor).toBe(a12.profitFactor);
    expect(research.payoffRatio).toBe(a12.payoffRatio);
    expect(research.payoffRatio).toBe(
      calculatePayoffRatio(a12.distribution.meanWinningGrossPnlUsd, a12.distribution.meanLosingGrossPnlUsd),
    );
    expect(research.maxClosedTradeCumulativePnlDrawdownUsd).toBe(a12.maxClosedTradeCumulativePnlDrawdownUsd);
    expect(research.maxClosedTradeCumulativePnlDrawdownUsd).toBe(
      maxClosedTradeCumulativePnlDrawdownUsd(mapped),
    );
    expect(research.concentration).toEqual(calculateWinnerConcentration(mapped));
    expect(research.concentration).toEqual(a12.concentration);
  });
});

describe('chronological slices', () => {
  it('assigns completed trades by exit timestamp on a continuous simulation', () => {
    const first = '2026-08-17T10:00:00.000Z';
    const last = '2026-08-17T11:40:00.000Z';
    expect(assignResearchSlice({ exitedAt: '2026-08-17T10:00:00.000Z', firstSnapshotAt: first, lastSnapshotAt: last })).toBe(
      'early',
    );
    expect(assignResearchSlice({ exitedAt: '2026-08-17T11:00:00.000Z', firstSnapshotAt: first, lastSnapshotAt: last })).toBe(
      'middle',
    );
    expect(assignResearchSlice({ exitedAt: last, firstSnapshotAt: first, lastSnapshotAt: last })).toBe('late');
    expect(assignResearchSlice({ exitedAt: first, firstSnapshotAt: first, lastSnapshotAt: first })).toBe('early');
  });

  it('returns null metrics when a slice has no completed trades', () => {
    const slices = buildResearchSliceMetrics({
      trades: [],
      firstSnapshotAt: '2026-08-17T10:00:00.000Z',
      lastSnapshotAt: '2026-08-17T11:00:00.000Z',
    });
    expect(slices.every((slice) => slice.completedTradeCount === 0 && slice.totalGrossPnlUsd === null)).toBe(
      true,
    );
  });
});

describe('zero-trade and nonfinite guards', () => {
  it('aggregates an empty completed set without inventing a 0% win rate', () => {
    const metrics = aggregateResearchCompletedTrades([]);
    expect(metrics.winRatePct).toBeNull();
    expect(metrics.aggregateGrossReturnPct).toBeNull();
    expect(metrics.profitFactor).toBeNull();
  });

  it('matches a12 for one winner, one loser, all breakeven, -0, and overflow rejection', () => {
    const winner = buildResearchCompletedTrade({
      researchDefinitionFingerprint: 'def',
      candidateId: 'quality_control_v1',
      candidateDefinitionFingerprint: 'cand',
      researchDatasetFingerprint: 'data',
      tokenMint: TRADE_A.tokenMint,
      pairAddress: TRADE_A.pairAddress,
      researchPositionIdentity: 'p-win',
      entryMarketIdentity: 'e-win',
      exitMarketIdentity: 'x-win',
      openedAt: TRADE_A.openedAt,
      exitedAt: TRADE_A.exitedAt,
      entryPriceUsd: 1,
      quantityTokens: 100,
      exitPriceUsd: 1.2,
      exitReason: 'take_profit_threshold',
    });
    const loser = buildResearchCompletedTrade({
      researchDefinitionFingerprint: 'def',
      candidateId: 'quality_control_v1',
      candidateDefinitionFingerprint: 'cand',
      researchDatasetFingerprint: 'data',
      tokenMint: TRADE_A.tokenMint,
      pairAddress: TRADE_A.pairAddress,
      researchPositionIdentity: 'p-loss',
      entryMarketIdentity: 'e-loss',
      exitMarketIdentity: 'x-loss',
      openedAt: TRADE_A.openedAt,
      exitedAt: TRADE_A.exitedAt,
      entryPriceUsd: 1,
      quantityTokens: 100,
      exitPriceUsd: 0.9,
      exitReason: 'stop_loss_threshold',
    });
    const even = buildResearchCompletedTrade({
      researchDefinitionFingerprint: 'def',
      candidateId: 'quality_control_v1',
      candidateDefinitionFingerprint: 'cand',
      researchDatasetFingerprint: 'data',
      tokenMint: TRADE_A.tokenMint,
      pairAddress: TRADE_A.pairAddress,
      researchPositionIdentity: 'p-even',
      entryMarketIdentity: 'e-even',
      exitMarketIdentity: 'x-even',
      openedAt: TRADE_A.openedAt,
      exitedAt: TRADE_A.exitedAt,
      entryPriceUsd: 1,
      quantityTokens: 100,
      exitPriceUsd: 1,
      exitReason: 'max_holding_time',
    });
    expect(winner.outcome).toBe('win');
    expect(loser.outcome).toBe('loss');
    expect(even.outcome).toBe('breakeven');
    expect(Object.is(even.grossPnlUsd, -0)).toBe(false);
    expect(even.grossPnlUsd).toBe(0);
    const oneEach = aggregateResearchCompletedTrades([winner, loser]);
    expect(oneEach.winCount).toBe(1);
    expect(oneEach.lossCount).toBe(1);
    const allEven = aggregateResearchCompletedTrades([even, even]);
    expect(allEven.breakevenCount).toBe(2);
    expect(allEven.winCount).toBe(0);
    expect(allEven.totalGrossPnlUsd).toBe(0);
    expect(() =>
      buildResearchCompletedTrade({
        researchDefinitionFingerprint: 'def',
        candidateId: 'quality_control_v1',
        candidateDefinitionFingerprint: 'cand',
        researchDatasetFingerprint: 'data',
        tokenMint: TRADE_A.tokenMint,
        pairAddress: TRADE_A.pairAddress,
        researchPositionIdentity: 'p-overflow',
        entryMarketIdentity: 'e-overflow',
        exitMarketIdentity: 'x-overflow',
        openedAt: TRADE_A.openedAt,
        exitedAt: TRADE_A.exitedAt,
        entryPriceUsd: 1,
        quantityTokens: Number.MAX_VALUE,
        exitPriceUsd: Number.MAX_VALUE,
        exitReason: 'max_holding_time',
      }),
    ).toThrow();
  });

  it('rejects nonfinite or non-positive research entry prices', () => {
    expect(() =>
      buildResearchCompletedTrade({
        researchDefinitionFingerprint: 'def',
        candidateId: 'quality_control_v1',
        candidateDefinitionFingerprint: 'cand',
        researchDatasetFingerprint: 'data',
        tokenMint: 'x',
        pairAddress: 'y',
        researchPositionIdentity: 'p',
        entryMarketIdentity: 'e',
        exitMarketIdentity: 'x',
        openedAt: '2026-08-17T10:00:00.000Z',
        exitedAt: '2026-08-17T10:01:00.000Z',
        entryPriceUsd: Number.NaN,
        quantityTokens: 1,
        exitPriceUsd: 1,
        exitReason: 'max_holding_time',
      }),
    ).toThrow(/entryPriceUsd/);
    expect(makeResearchDataset([allEntrySnapshot({ priceUsd: 1 })]).researchMarketSnapshotCount).toBe(1);
  });
});
