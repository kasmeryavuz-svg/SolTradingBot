import { describe, expect, it } from 'vitest';
import { formatPaperHistoryLines, formatPaperStepLines } from '../src/paper/format.js';
import { paperBundle, noEntryPaperBundle } from './paper-fixtures.js';

const recorded = {
  paperEvaluationId: 7,
  strategyEvaluationId: 3,
  vectorId: 2,
  tokenMint: 'So11111111111111111111111111111111111111112',
  sourceIdentity: 'paper-source',
  inserted: true,
  strategyInserted: true,
  featureInserted: true,
  marketInserted: true,
  riskInserted: true,
  tokenInserted: true,
  paperDefinitionInserted: true,
};

describe('paper formatter', () => {
  it('describes a no-action result without buy or position language', () => {
    const lines = formatPaperStepLines(noEntryPaperBundle().paperEvaluation, recorded).join('\n');
    expect(lines).toContain('Checkpoint 09 — Paper Trading');
    expect(lines).toContain('Paper spec: p09_v1');
    expect(lines).toContain('NO_ENTRY');
    expect(lines).toContain('NO_ACTION');
    expect(lines).toContain('strategy_no_entry');
    expect(lines).toContain('No order was created.');
    expect(lines).toContain('No position exists.');
    expect(lines).toContain('No blockchain transaction exists.');
    expect(lines).toContain('Checkpoint: 17');
    expect(lines).not.toMatch(
      /\bBUY NOW\b|\bbought\b|purchase executed|order filled|trade opened/i,
    );
    expect(lines).not.toMatch(/profit|PnL|win rate/i);
  });

  it('describes an entry observation as a reference-price paper record, not a trade', () => {
    const lines = formatPaperStepLines(paperBundle().paperEvaluation, recorded).join('\n');
    expect(lines).toContain('ENTRY_CANDIDATE');
    expect(lines).toContain('ENTRY_OBSERVATION');
    expect(lines).toContain('exact_strategy_market_snapshot_reference_price');
    expect(lines).toContain('Costs modeled:');
    expect(lines).toContain('NONE');
    expect(lines).toContain('Quantity:');
    expect(lines).toContain('NOT MODELED');
    expect(lines).toContain(
      'This is a paper observation, not an executable blockchain quote or trade.',
    );
    expect(lines).toContain('No wallet, order, position or transaction was created.');
    expect(lines).not.toMatch(
      /\bBUY NOW\b|\bbought\b|purchase executed|order filled|trade opened/i,
    );
  });

  it('prints stored history without recomputing or claiming profitability', () => {
    const lines = formatPaperHistoryLines('UnknownMint111111111111111111111111111', null).join(
      '\n',
    );
    expect(lines).toContain('No paper history found for this mint.');
    expect(lines).not.toMatch(/\bBUY\b|\bSELL\b|PnL|profit/);
  });
});
