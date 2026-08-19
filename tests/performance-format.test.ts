import { describe, expect, it } from 'vitest';
import {
  buildPerformanceReport,
  formatPerformanceReportLines,
  formatPerformanceTradeLines,
} from '../src/performance/index.js';
import { TRADE_A, TRADE_B, TRADE_C } from './performance-fixtures.js';

describe('performance formatter', () => {
  it('puts GROSS PAPER / NOT LIVE warnings at the top and stays descriptive', () => {
    const lines = formatPerformanceReportLines(buildPerformanceReport([TRADE_A, TRADE_B])).join(
      '\n',
    );
    expect(lines.startsWith('GROSS PAPER ANALYTICS\nNOT LIVE / NOT NET PERFORMANCE')).toBe(true);
    expect(lines).toContain('Gross paper results are not evidence of live profitability.');
    expect(lines).toContain('no DEX trading fees');
    expect(lines).toContain('no slippage');
    expect(lines).toContain('exit price is an observed reference price, not a guaranteed fill');
    expect(lines).toContain('fixed $100 reference trade size is not a bankroll model');
    expect(lines).toContain('Aggregate GROSS return on summed trade reference notional');
    expect(lines).toContain(
      'It is NOT portfolio drawdown, equity drawdown, account drawdown, or capital drawdown.',
    );
    expect(lines).toContain('This is not a strategy optimization rule.');
    expect(lines).toContain('Checkpoint: 20');
    expect(lines).not.toMatch(
      /Strategy is profitable|Strategy has an edge|Expected profit is|Safe to go live/i,
    );
    expect(lines).not.toMatch(/winning strategy|make money|earn money/i);
    expect(formatPerformanceReportLines(buildPerformanceReport([TRADE_C])).join('\n')).not.toMatch(
      /-\$0|-0%/,
    );
  });

  it('does not interpret a no-trade dataset as 0% performance', () => {
    const lines = formatPerformanceReportLines(buildPerformanceReport([])).join('\n');
    expect(lines).toContain('Status: no_closed_trades');
    expect(lines).toContain('Closed trades: 0');
    expect(lines).toContain('No performance conclusion is available.');
    expect(lines).not.toMatch(/Win rate: 0%|0% win rate|strategy broke even/i);
    expect(lines).not.toContain('Win rate: 0');
  });

  it('lists newest completed trades first without claiming net profit', () => {
    const report = buildPerformanceReport([TRADE_A, TRADE_B]);
    const lines = formatPerformanceTradeLines(report, 1).join('\n');
    expect(lines.startsWith('GROSS PAPER ANALYTICS')).toBe(true);
    expect(lines).toContain('Displaying 1 of 2 closed trades');
    expect(lines).toContain('Position source: pos-b');
    expect(lines).toContain('GROSS paper PnL');
    expect(lines).not.toMatch(/net profit|live profitability is proven/i);
  });
});
