import { formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type { BacktestEvent, BacktestOutcome, BacktestResult, BacktestScope } from './types.js';

export function formatBacktestLines(result: BacktestResult): string[] {
  const lines = [
    'Checkpoint 08 — Historical Backtest',
    `Backtest spec: ${result.backtestSpecVersion}`,
    `Strategy: ${result.strategyVersion}`,
    `Feature set: ${result.featureSetVersion}`,
    `Scope: ${formatScope(result.scope)}`,
    `Historical market snapshots: ${String(result.marketSnapshotCount)}`,
    `Historical risk reports: ${String(result.riskReportCount)}`,
    `Strategy evaluations: ${String(result.summary.evaluationCount)}`,
    `ENTRY_CANDIDATE: ${String(result.summary.entryCandidateCount)}`,
    `NO_ENTRY: ${String(result.summary.noEntryCount)}`,
    `INSUFFICIENT_DATA: ${String(result.summary.insufficientDataCount)}`,
    '',
    'ENTRY_CANDIDATE future outcomes',
    `Resolved: ${String(result.summary.resolvedEntryCandidateCount)}`,
    `Unavailable: ${String(result.summary.unresolvedEntryCandidateCount)}`,
    `Positive gross forward outcomes: ${String(result.summary.positiveForwardOutcomeCount)}`,
    `Non-positive gross forward outcomes: ${String(result.summary.nonPositiveForwardOutcomeCount)}`,
    'Average gross 15-minute forward return:',
    formatAverageReturn(result.summary.averageGrossForwardReturnPct),
    '',
    'Important:',
    'This is a historical event study, not simulated trading.',
    'Returns exclude fees, slippage and execution.',
    'Repeated candidate events may overlap.',
    'Historical coverage is limited to data this bot stored.',
    'The local database is a small observed sample, not the entire Solana market.',
    'grossForwardReturnPct is not net trading profit and does not establish future profitability.',
    's07_v1 thresholds were frozen before this backtest.',
  ];

  if (result.scope.kind === 'token') {
    lines.push('', 'Chronological classifications');
    for (const event of result.events) {
      lines.push('');
      lines.push(...formatEventLines(event, { includeNonCandidate: true }));
    }
  } else {
    const candidates = result.events.filter((event) => event.strategyDecision === 'entry_candidate');
    if (candidates.length > 0) {
      lines.push('', 'ENTRY_CANDIDATE events');
      for (const event of candidates) {
        lines.push('');
        lines.push(...formatEventLines(event, { includeNonCandidate: false }));
      }
    }
  }

  lines.push('', ...formatCapabilityFooter());
  return lines;
}

function formatScope(scope: BacktestScope): string {
  return scope.kind === 'all' ? 'all stored tokens' : scope.tokenMint;
}

function formatAverageReturn(value: number | null): string {
  if (value === null) {
    return 'n/a (no resolved ENTRY_CANDIDATE outcomes)';
  }
  return formatSignedPercent(value);
}

function formatEventLines(event: BacktestEvent, options: { includeNonCandidate: boolean }): string[] {
  if (event.strategyDecision !== 'entry_candidate') {
    if (!options.includeNonCandidate) {
      return [];
    }
    return [
      event.strategyDecision === 'no_entry' ? 'NO_ENTRY' : 'INSUFFICIENT_DATA',
      `Mint: ${event.tokenMint}`,
      `Pair: ${event.pairAddress}`,
      `As of: ${event.asOf}`,
    ];
  }

  return [
    'ENTRY_CANDIDATE',
    `Mint: ${event.tokenMint}`,
    `Pair: ${event.pairAddress}`,
    `As of: ${event.asOf}`,
    ...formatOutcomeLines(event.outcome),
  ];
}

function formatOutcomeLines(outcome: BacktestOutcome | null): string[] {
  if (outcome === null) {
    return ['Outcome: missing'];
  }

  if (outcome.status === 'unavailable') {
    return [
      `Reference price: ${formatUsd(outcome.referencePriceUsd)}`,
      `Target: ${outcome.targetAt}`,
      'Outcome: UNAVAILABLE',
      `Reason: ${outcome.reason}`,
    ];
  }

  return [
    `Reference price: ${formatUsd(outcome.referencePriceUsd)}`,
    `Target: ${outcome.targetAt}`,
    'Outcome: RESOLVED',
    `Observed at: ${outcome.outcomeCollectedAt}`,
    `Actual horizon: ${String(outcome.actualHorizonSeconds)} seconds`,
    `Delay from target: ${String(outcome.outcomeDelaySeconds)} seconds`,
    `Future price: ${formatUsd(outcome.outcomePriceUsd)}`,
    `Gross forward price return: ${formatSignedPercent(outcome.grossForwardReturnPct)}`,
  ];
}

function formatSignedPercent(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(4)}%`;
}
