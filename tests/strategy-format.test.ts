import { describe, expect, it } from 'vitest';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import { formatStrategyCheckLines, formatStrategyHistoryLines } from '../src/strategy/format.js';
import { T_10_00 } from './feature-fixtures.js';
import {
  evaluatePassing,
  passingVector,
  withAvailableNumber,
  withUnavailable,
} from './strategy-fixtures.js';

describe('strategy formatter', () => {
  it('prints experimental classification language and never treats ENTRY_CANDIDATE as an order', () => {
    const evaluation = evaluatePassing();
    const lines = formatStrategyCheckLines(passingVector(), evaluation).join('\n');
    expect(lines).toContain('First Strategy — s07_v1');
    expect(lines).toContain('ENTRY_CANDIDATE');
    expect(lines).toContain('This is an experimental strategy classification only.');
    expect(lines).toContain('It is not evidence of profitability and does not create an order.');
    expect(lines).toContain(
      'ENTRY_CANDIDATE is a strategy classification only. No order or trade is created.',
    );
    expect(lines).toContain('Context — NOT s07_v1 decision rules');
    expect(lines).toContain('Checkpoint: 15');
    expect(lines).not.toMatch(
      /profitable strategy|winning strategy|high-win-rate|optimized|validated edge|proven alpha/i,
    );
    expect(lines).not.toMatch(/NaN|Infinity/);
  });

  it('explains NO_ENTRY as a failed rule, not a sell', () => {
    const vector = withAvailableNumber(passingVector(), 'buy_share_5m_bps', 5_000);
    const lines = formatStrategyCheckLines(
      vector,
      evaluateStrategy(vector, { evaluatedAt: T_10_00 }),
    ).join('\n');
    expect(lines).toContain('NO_ENTRY');
    expect(lines).toContain('At least one required rule failed.');
    expect(lines).toContain('NO_ENTRY is not a sell instruction.');
    expect(lines).toContain('BUY_SHARE_5M_MINIMUM');
  });

  it('lists unavailable rules for INSUFFICIENT_DATA without guessing', () => {
    const vector = withUnavailable(passingVector(), 'trades_5m', 'provider omitted trades');
    const lines = formatStrategyCheckLines(
      vector,
      evaluateStrategy(vector, { evaluatedAt: T_10_00 }),
    ).join('\n');
    expect(lines).toContain('INSUFFICIENT_DATA');
    expect(lines).toContain('TRADES_5M_MINIMUM');
    expect(lines).toContain('provider omitted trades');
    expect(lines).toContain('Classification:\n\nINSUFFICIENT_DATA');
    expect(lines).not.toContain('Classification:\n\nNO_ENTRY');
  });

  it('handles unknown-token strategy history cleanly', () => {
    const lines = formatStrategyHistoryLines('UnknownMint111111111111111111111111111', null).join(
      '\n',
    );
    expect(lines).toContain('No strategy history found for this mint.');
    expect(lines).not.toMatch(/\bPnL\b|profit factor|win rate|what happened next/i);
  });
});
