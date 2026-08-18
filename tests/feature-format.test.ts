import { describe, expect, it } from 'vitest';
import { formatFeatureCheckLines, formatFeatureHistoryLines } from '../src/features/format.js';
import { sampleVector } from './feature-fixtures.js';

describe('feature formatter', () => {
  it('prints factual features and never recommends a trade', () => {
    const lines = formatFeatureCheckLines(sampleVector()).join('\n');
    expect(lines).toContain('Feature Engine — FACTUAL INPUT FEATURES');
    expect(lines).toContain('Features are factual/derived inputs.');
    expect(lines).toContain('They are not BUY/SELL signals or investment recommendations.');
    const withoutDisclaimer = lines.replace(
      'They are not BUY/SELL signals or investment recommendations.',
      '',
    );
    expect(withoutDisclaimer).not.toMatch(
      /\bBUY\b|\bSELL\b|RECOMMENDED|bullish|bearish|good setup|winner/,
    );
    expect(lines).not.toMatch(/NaN|Infinity/);
    expect(lines).toContain('Checkpoint: 19');
  });

  it('shows unavailable features as n/a with a reason', () => {
    const lines = formatFeatureCheckLines(
      sampleVector({ previousMarket: null, risk: null, riskUnavailableReason: 'risk scan failed' }),
    ).join('\n');
    expect(lines).toMatch(/n\/a \(/);
    expect(lines).toContain('PARTIAL');
    expect(lines).toContain('feature:check does not query database history');
    expect(lines).toContain('risk report unavailable');
    expect(lines).not.toContain('risk scan failed');

    const withDetail = formatFeatureCheckLines(
      sampleVector({ previousMarket: null, risk: null, riskUnavailableReason: 'risk scan failed' }),
      { riskUnavailableDetail: 'rpc timed out' },
    ).join('\n');
    expect(withDetail).toContain('Risk source detail: rpc timed out');
  });

  it('handles unknown-token feature history cleanly', () => {
    const lines = formatFeatureHistoryLines('UnknownMint111111111111111111111111111', null).join(
      '\n',
    );
    expect(lines).toContain('No feature history found for this mint.');
    expect(lines).not.toMatch(/\bBUY\b|\bSELL\b|PnL|profit/);
  });
});
