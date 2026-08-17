import { describe, expect, it } from 'vitest';
import { formatRiskCheckLines, formatRiskHistoryLines } from '../src/risk/format.js';
import { formatBasisPoints } from '../src/risk/numbers.js';
import { FINDING_CODES } from '../src/risk/constants.js';
import { sampleReport } from './risk-fixtures.js';

describe('risk formatter', () => {
  it('formats basis points as percentages and never prints NaN or Infinity', () => {
    expect(formatBasisPoints(2542)).toBe('25.42%');
    expect(formatBasisPoints(5000)).toBe('50.00%');
    const lines = formatRiskCheckLines(sampleReport());
    expect(lines.join('\n')).not.toMatch(/NaN%|Infinity%/);
  });

  it('says token accounts, not beneficial owners, and never recommends a trade', () => {
    const lines = formatRiskCheckLines(sampleReport({
      findings: [{
        code: FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_ELEVATED,
        category: 'concentration',
        severity: 'medium',
        confidence: 'low',
        title: 'Largest token-account concentration is elevated',
        description: 'The largest token account contains approximately 20.00% of current supply.',
      }],
      highestFindingSeverity: 'medium',
    })).join('\n');

    expect(lines).toMatch(/token accounts, not verified beneficial owners/i);
    expect(lines).not.toMatch(/\bBUY\b|\bSELL\b|RECOMMENDED|GUARANTEED SAFE|GOOD TOKEN|BAD TOKEN/);
    expect(lines).not.toMatch(/scam detector|honeypot detector|safe-token detector/i);
    expect(lines).toContain('Highest finding severity: MEDIUM');
    expect(lines).not.toContain('Token risk: HIGH');
    expect(lines).not.toContain('Risk score:');
    expect(lines).toContain('Top N is the share held by the first min(N, observed) ranked token accounts.');
    expect(lines).toContain('Observed token accounts: 1');
    expect(lines).toMatch(/first 1 of 1 observed token accounts/);
    expect(lines).not.toMatch(/largest holder|top holder|wallet holder|owner concentration/i);
  });

  it('prints NONE and the safety disclaimer when no findings trigger', () => {
    const lines = formatRiskCheckLines(sampleReport()).join('\n');
    expect(lines).toContain('Highest finding severity: NONE');
    expect(lines).toContain(
      'No configured Checkpoint 05 risk indicators triggered. This does not prove the token is safe.',
    );
    expect(lines).toContain('none of the risk indicators implemented in Checkpoint 05 triggered.'.replace(
      'none',
      'None',
    ));
  });

  it('describes TransferFeeConfig as configured or scheduled, not currently charged', () => {
    const lines = formatRiskCheckLines(sampleReport({
      extensions: [{
        name: 'TransferFeeConfig',
        rawName: 'transferFeeConfig',
        authority: null,
        programId: null,
        state: 'older_bps=80;older_max=500|newer_bps=0;newer_max=0',
        transferFeeBasisPoints: 80,
        maximumFeeRaw: '500',
        olderTransferFeeBasisPoints: 80,
        newerTransferFeeBasisPoints: 0,
        olderMaximumFeeRaw: '500',
        newerMaximumFeeRaw: '0',
        parsed: true,
        classified: true,
      }],
    })).join('\n');

    expect(lines).toMatch(/configured\/scheduled metadata/);
    expect(lines).toMatch(/not proven currently effective/);
    expect(lines).not.toMatch(/current fee|currently charged/i);
  });

  it('handles unknown-token history cleanly', () => {
    const lines = formatRiskHistoryLines('UnknownMint111111111111111111111111111', null).join('\n');
    expect(lines).toContain('No risk history found for this mint.');
    expect(lines).not.toMatch(/\bBUY\b|\bSELL\b/);
  });
});
