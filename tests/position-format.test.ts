import { describe, expect, it } from 'vitest';
import { formatPositionHistoryLines, formatPositionStatusLines, formatPositionStepLines } from '../src/position/format.js';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { openedPositionFrom, positionBundle, noEntryPositionBundle } from './position-fixtures.js';

describe('position formatter', () => {
  it('prints OPEN_POSITION as a simulated paper position with the $100 modeling disclaimer', () => {
    const bundle = positionBundle();
    const opened = openedPositionFrom(bundle);
    const lines = formatPositionStepLines(
      bundle.positionEvaluation,
      {
        positionEvaluationId: 1,
        paperEvaluationId: 1,
        strategyEvaluationId: 1,
        vectorId: 1,
        paperPositionId: 1,
        openPositionCreated: true,
        tokenMint: WRAPPED_SOL_MINT,
        sourceIdentity: bundle.positionEvaluation.sourceIdentity,
        inserted: true,
        paperInserted: true,
        strategyInserted: true,
        featureInserted: true,
        marketInserted: true,
        riskInserted: true,
        tokenInserted: true,
        paperDefinitionInserted: true,
        positionDefinitionInserted: true,
      },
      {
        id: 1,
        positionEvaluationId: 1,
        openingPaperEvaluationId: 1,
        ...opened,
      },
    ).join('\n');

    expect(lines).toContain('Checkpoint 10 — Position Management');
    expect(lines).toContain('OPEN_POSITION');
    expect(lines).toContain('$100 is a fixed modeling reference, not real funds or a recommendation.');
    expect(lines).toContain('No order or blockchain transaction was created.');
    expect(lines).not.toMatch(/PnL|profit|loss|current price|market value|equity/i);
    expect(lines).not.toMatch(/\bBUY\b|\bSELL\b|profitable|winning/);
  });

  it('prints NO_CHANGE for paper NO_ACTION without implying a position', () => {
    const bundle = noEntryPositionBundle();
    const lines = formatPositionStepLines(
      bundle.positionEvaluation,
      {
        positionEvaluationId: 1,
        paperEvaluationId: 1,
        strategyEvaluationId: 1,
        vectorId: 1,
        paperPositionId: null,
        openPositionCreated: false,
        tokenMint: WRAPPED_SOL_MINT,
        sourceIdentity: bundle.positionEvaluation.sourceIdentity,
        inserted: true,
        paperInserted: true,
        strategyInserted: true,
        featureInserted: true,
        marketInserted: true,
        riskInserted: true,
        tokenInserted: true,
        paperDefinitionInserted: true,
        positionDefinitionInserted: true,
      },
      null,
    ).join('\n');

    expect(lines).toContain('NO_CHANGE');
    expect(lines).toContain('paper_strategy_no_entry');
    expect(lines).toContain('NONE');
    expect(lines).toContain('No position was opened.');
  });

  it('prints status without current price or PnL', () => {
    expect(formatPositionStatusLines(WRAPPED_SOL_MINT, null).join('\n')).toContain(
      `No open paper position for mint ${WRAPPED_SOL_MINT}`,
    );
    const opened = openedPositionFrom(positionBundle());
    const lines = formatPositionStatusLines(WRAPPED_SOL_MINT, {
      id: 1,
      positionEvaluationId: 1,
      openingPaperEvaluationId: 1,
      ...opened,
    }).join('\n');
    expect(lines).toContain('Open paper position');
    expect(lines).toContain('No current price or PnL is calculated in Checkpoint 10.');
    expect(lines).not.toMatch(/unrealized|realized|return %|Sharpe|drawdown/i);
  });

  it('prints stored history actions without recomputation language', () => {
    const lines = formatPositionHistoryLines(WRAPPED_SOL_MINT, {
      token: {
        id: 1,
        chain: 'solana',
        mint: WRAPPED_SOL_MINT,
        firstObservedAt: '2026-08-17T10:00:00.000Z',
        lastObservedAt: '2026-08-17T10:00:00.000Z',
        createdAt: '2026-08-17T10:00:00.000Z',
      },
      evaluations: [
        {
          id: 2,
          paperEvaluationId: 2,
          tokenMint: WRAPPED_SOL_MINT,
          positionSpecVersion: 'pm10_v1',
          positionSpecName: 'single_open_position_fixed_usd_notional',
          positionDefinitionFingerprint: 'abc',
          paperSpecVersion: 'p09_v1',
          paperDefinitionFingerprint: 'def',
          paperSourceIdentity: 'paper',
          asOf: '2026-08-17T10:10:00.000Z',
          evaluatedAt: '2026-08-17T10:10:00.000Z',
          paperAction: 'no_action',
          paperNoActionReason: 'strategy_no_entry',
          priorOpenPositionId: null,
          priorOpenPositionSourceIdentity: null,
          positionAction: 'no_change',
          positionReason: 'paper_strategy_no_entry',
          entryPriceUsd: null,
          entryNotionalUsd: null,
          quantityTokens: null,
          positionSourceIdentity: null,
          sourceIdentity: 'newer',
        },
      ],
    }).join('\n');
    expect(lines).toContain('NO_CHANGE');
    expect(lines).toContain('paper_strategy_no_entry');
    expect(lines).toContain('NO_ACTION');
  });
});
