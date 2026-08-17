import { describe, expect, it } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { formatExitHistoryLines, formatExitStepLines } from '../src/exit/format.js';
import { evaluateExitAction } from '../src/exit/evaluator.js';
import { exitMarketSnapshot, openedExitPosition } from './exit-fixtures.js';

describe('exit formatter', () => {
  it('prints a simulated close without PnL or sell language', () => {
    const position = openedExitPosition();
    const evaluation = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: 90 }),
    });
    const lines = formatExitStepLines({
      kind: 'evaluated',
      tokenMint: WRAPPED_SOL_MINT,
      exitEvaluation: evaluation,
      recorded: {
        exitEvaluationId: 1,
        marketSnapshotId: 2,
        paperPositionExitId: 1,
        openPositionRemoved: true,
        tokenMint: WRAPPED_SOL_MINT,
        sourceIdentity: evaluation.sourceIdentity,
        inserted: true,
        marketInserted: true,
        exitDefinitionInserted: true,
      },
      currentOpenPosition: null,
    }).join('\n');

    expect(lines).toContain('Checkpoint 11 — Paper Exit Engine');
    expect(lines).toContain('CLOSE_POSITION');
    expect(lines).toContain('stop_loss_threshold');
    expect(lines).toContain('simulated paper close');
    expect(lines).toContain('experimental baseline');
    expect(lines).toContain('No fees, slippage, or PnL are calculated in Checkpoint 11.');
    expect(lines).toContain('not optimized, profitable, or financial advice');
    expect(lines).not.toMatch(/realized|unrealized|profit USD|loss USD|equity|win rate/i);
    expect(lines).not.toMatch(/\bSELL\b|\bBUY\b/);
  });

  it('prints a zero simulated exit price instead of coercing it to n/a', () => {
    const position = openedExitPosition();
    const evaluation = evaluateExitAction({
      openPosition: position,
      marketSnapshot: exitMarketSnapshot(position, { priceUsd: 0 }),
    });
    const lines = formatExitStepLines({
      kind: 'evaluated',
      tokenMint: WRAPPED_SOL_MINT,
      exitEvaluation: evaluation,
      currentOpenPosition: null,
    }).join('\n');
    expect(evaluation.simulatedExitPriceUsd).toBe(0);
    expect(lines).toContain('Observed price: $0.000');
    expect(lines).toContain('Simulated exit price: $0.000');
    expect(lines).not.toMatch(/Observed price: n\/a/);
    expect(lines).not.toMatch(/Simulated exit price: n\/a/);
  });

  it('prints the no-open-position no-op without implying a network call', () => {
    const lines = formatExitStepLines({
      kind: 'no_open_position',
      tokenMint: WRAPPED_SOL_MINT,
    }).join('\n');
    expect(lines).toContain('No open paper position');
    expect(lines).toContain('No exact-pair market request was made.');
    expect(lines).toContain('No exit evaluation was stored.');
  });

  it('prints empty history without PnL', () => {
    const lines = formatExitHistoryLines(WRAPPED_SOL_MINT, null).join('\n');
    expect(lines).toContain('No exit history found for this mint.');
    expect(lines).not.toMatch(/PnL|profit|loss|equity/i);
  });
});
