import { formatPercent, formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import { listResearchCandidateDescriptors } from './catalog.js';
import type {
  ResearchCandidateDescriptor,
  ResearchCandidateReport,
  ResearchCompareReport,
  ResearchCompletedTrade,
  ResearchSliceMetrics,
} from './types.js';

export function formatResearchCatalogLines(): string[] {
  const candidates = listResearchCandidateDescriptors();
  const lines = [
    'STRATEGY RESEARCH LAB',
    'FIXED CANDIDATE CATALOG',
    'NO PERFORMANCE / NOT LIVE / NOT OPTIMIZED',
    '',
    'These are pre-registered historical hypotheses. A backtest is evidence, not proof.',
    'No candidate is declared a winner. Catalog output contains no performance numbers.',
    '',
  ];

  for (const candidate of candidates) {
    lines.push(...formatCatalogCandidate(candidate));
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatResearchCompareLines(report: ResearchCompareReport): string[] {
  const lines = [
    ...formatResearchDisclaimer(),
    '',
    'Research identity',
    `Spec: ${report.researchSpecVersion}`,
    `Name: ${report.researchSpecName}`,
    `Research definition fingerprint: ${report.researchDefinitionFingerprint}`,
    `Research dataset fingerprint: ${report.researchDatasetFingerprint}`,
    '',
    'Research snapshot universe (provenance / leakage control, not a performance filter)',
    `rawMarketSnapshotCount: ${String(report.rawMarketSnapshotCount)}`,
    `runtimeExitReferencedSnapshotCountExcluded: ${String(report.runtimeExitReferencedSnapshotCountExcluded)}`,
    `researchMarketSnapshotCount: ${String(report.researchMarketSnapshotCount)}`,
    `Unique tokens: ${String(report.uniqueTokenCount)}`,
    `Unique pairs: ${String(report.uniquePairCount)}`,
    `Risk scans: ${String(report.riskScanCount)}`,
    `Tokens with risk scans: ${String(report.uniqueTokensWithRiskScan)}`,
    `Snapshots with finite price: ${String(report.snapshotsWithFinitePriceCount)}`,
    `Snapshots with null price: ${String(report.snapshotsWithNullPriceCount)}`,
    `First snapshot: ${report.firstSnapshotAt ?? 'n/a'}`,
    `Last snapshot: ${report.lastSnapshotAt ?? 'n/a'}`,
    `Dataset span ms: ${report.datasetSpanMs === null ? 'n/a' : String(report.datasetSpanMs)}`,
    'Coverage facts are raw counts. r125 does not apply a numeric sample-adequacy threshold or a statistical-significance test.',
    'This historical sample may be limited in time and/or evidence coverage; read span, snapshots, tokens, pairs, risk coverage, completed positions, and unresolved positions together.',
    '',
    'Descriptive comparison (canonical candidateId order, not ranked by PnL)',
    'No candidate is declared a winner. r125 uses a12-compatible GROSS performance mathematics.',
    '',
  ];

  for (const candidate of report.candidates) {
    lines.push(
      `${candidate.candidate.candidateId} | opened ${String(candidate.lifecycle.positionsOpened)} | completed ${String(candidate.lifecycle.completedPositions)} | unresolved ${String(candidate.lifecycle.unresolvedPositions)} | GROSS PnL ${formatSignedUsd(candidate.performance.totalGrossPnlUsd)}`,
    );
  }

  lines.push('');

  for (const candidate of report.candidates) {
    lines.push(...formatCandidateReport(candidate));
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatResearchTradeLines(
  report: ResearchCandidateReport,
  displayLimit: number,
): string[] {
  const newestFirst = [...report.completedTrades].sort((left, right) => {
    if (left.exitedAt !== right.exitedAt) {
      return left.exitedAt > right.exitedAt ? -1 : 1;
    }
    return left.researchTradeIdentity > right.researchTradeIdentity ? -1 : 1;
  });
  const displayed = newestFirst.slice(0, displayLimit);

  const lines = [
    ...formatResearchDisclaimer(),
    '',
    `Completed research trades for ${report.candidate.candidateId}`,
    `Displaying ${String(displayed.length)} of ${String(report.lifecycle.completedPositions)} completed trades (newest first).`,
    `Display limit: ${String(displayLimit)}. This limit does not change research:compare, the dataset fingerprint, or candidate metrics.`,
    `Unresolved positions at dataset end: ${String(report.lifecycle.unresolvedPositions)}`,
    '',
  ];

  if (displayed.length === 0) {
    lines.push('No completed research trades to list.');
    lines.push('No performance conclusion is available.');
    lines.push('');
    lines.push(...formatCapabilityFooter());
    return lines;
  }

  for (const trade of displayed) {
    lines.push(...formatOneTradeLines(trade));
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatResearchDisclaimer(): string[] {
  return [
    'STRATEGY RESEARCH LAB',
    'HISTORICAL GROSS PAPER REFERENCE RESULTS',
    'NOT LIVE / NOT NET / NOT OPTIMIZED',
    '',
    'A strategy is a hypothesis. A backtest is evidence. A good historical result is not proof of future performance.',
    'No candidate is declared a winner. These numbers are descriptive comparisons only.',
    '',
    'Limitations:',
    '- stored historical observations only',
    '- no trading fees',
    '- no Solana priority/base fees',
    '- no slippage',
    '- no price impact',
    '- no MEV',
    '- no latency',
    '- no failed transactions',
    '- no partial fills',
    '- sparse/uneven observations may affect results',
    '- fixed $100 reference notional is not bankroll',
    '- overlapping tokens do not model portfolio capital',
    '- x11 +20% take profit may truncate large runners',
    '- all candidates deliberately use x11 so entry rules are isolated',
    '- research snapshot coverage may be incomplete',
    '- no candidate is declared a winner',
    '',
    'Runner note:',
    'x11 currently closes the ENTIRE simulated position at +20%.',
    'Therefore r125_v1 CANNOT measure what would have happened if part of a trade was allowed to run to 2x, 5x, 10x, or 100x.',
    'Do not infer that from current results.',
    'runner_friendly_momentum_v1 only changes ENTRY eligibility by removing s07\'s 5m +20% cap.',
    'It does NOT change the +20% x11 TAKE-PROFIT exit.',
    'Exit runner / trailing / partial-exit research is a separate future experiment.',
  ];
}

function formatCatalogCandidate(candidate: ResearchCandidateDescriptor): string[] {
  return [
    `Candidate: ${candidate.candidateId}`,
    `Version: ${candidate.candidateVersion}`,
    `Name: ${candidate.candidateName}`,
    `Category: ${candidate.candidateCategory}`,
    `Fingerprint: ${candidate.candidateDefinitionFingerprint}`,
    `Required features: ${candidate.requiredFeatureSetVersion}`,
    `Inspiration: ${candidate.inspirationKind}`,
    `External reproduction: ${candidate.externalReproduction}`,
    `Description: ${candidate.description}`,
    `Rationale: ${candidate.sourceRationale}`,
  ];
}

function formatCandidateReport(report: ResearchCandidateReport): string[] {
  const lines = [
    `Candidate ${report.candidate.candidateId}`,
    `Name: ${report.candidate.candidateName}`,
    `Category: ${report.candidate.candidateCategory}`,
    `Candidate fingerprint: ${report.candidate.candidateDefinitionFingerprint}`,
    `Research spec: ${report.researchSpecVersion}`,
    `Research definition fingerprint: ${report.researchDefinitionFingerprint}`,
    `Research dataset fingerprint: ${report.researchDatasetFingerprint}`,
    `Candidate run fingerprint: ${report.candidateRunFingerprint}`,
    '',
    'Coverage',
    `Research snapshots: ${String(report.coverage.researchSnapshotCount)}`,
    `Unique tokens: ${String(report.coverage.uniqueTokenCount)}`,
    `Unique pairs: ${String(report.coverage.uniquePairCount)}`,
    `First snapshot: ${report.coverage.firstSnapshotAt ?? 'n/a'}`,
    `Last snapshot: ${report.coverage.lastSnapshotAt ?? 'n/a'}`,
    `Dataset span ms: ${report.coverage.datasetSpanMs === null ? 'n/a' : String(report.coverage.datasetSpanMs)}`,
    `Risk scans: ${String(report.coverage.riskScanCount)}`,
    `Tokens with risk scans: ${String(report.coverage.uniqueTokensWithRiskScan)}`,
    `Snapshots with finite price: ${String(report.coverage.snapshotsWithFinitePriceCount)}`,
    `Snapshots with null price: ${String(report.coverage.snapshotsWithNullPriceCount)}`,
    '',
    'Decisions',
    `Evaluated snapshots: ${String(report.decisions.evaluatedSnapshotCount)}`,
    `entry_candidate: ${String(report.decisions.entryCandidateCount)}`,
    `no_entry: ${String(report.decisions.noEntryCount)}`,
    `insufficient_data: ${String(report.decisions.insufficientDataCount)}`,
    '',
    'Lifecycle coverage (read this before GROSS PnL)',
    `Positions opened: ${String(report.lifecycle.positionsOpened)}`,
    `Completed positions: ${String(report.lifecycle.completedPositions)}`,
    `Unresolved positions at dataset end: ${String(report.lifecycle.unresolvedPositions)}`,
    `Unique tokens traded: ${String(report.lifecycle.uniqueTokensTraded)}`,
    `Completion rate: ${formatNullablePercent(report.lifecycle.completionRatePct)}`,
    'Unresolved positions are censored. They are not wins, losses, or mark-to-market closes.',
    '',
  ];

  if (report.lifecycle.completedPositions === 0) {
    lines.push('GROSS paper performance');
    lines.push('No performance conclusion is available.');
    lines.push('Zero completed trades cannot be interpreted as a zero return, a zero win rate, or a breakeven strategy result.');
    lines.push(`Wins: ${String(report.performance.winCount)}`);
    lines.push(`Losses: ${String(report.performance.lossCount)}`);
    lines.push(`Breakevens: ${String(report.performance.breakevenCount)}`);
    lines.push(...formatSliceLines(report.slices));
    return lines;
  }

  lines.push('GROSS paper performance (r125 uses a12-compatible gross performance mathematics)');
  lines.push(
    `Coverage beside PnL: completed ${String(report.lifecycle.completedPositions)} | unresolved ${String(report.lifecycle.unresolvedPositions)} | completion rate ${formatNullablePercent(report.lifecycle.completionRatePct)}`,
  );
  lines.push(`Wins: ${String(report.performance.winCount)}`);
  lines.push(`Losses: ${String(report.performance.lossCount)}`);
  lines.push(`Breakevens: ${String(report.performance.breakevenCount)}`);
  lines.push(`Win rate: ${formatNullablePercent(report.performance.winRatePct)}`);
  lines.push(`Loss rate: ${formatNullablePercent(report.performance.lossRatePct)}`);
  lines.push(`Breakeven rate: ${formatNullablePercent(report.performance.breakevenRatePct)}`);
  lines.push(`Total reference notional: ${formatUsd(report.performance.totalReferenceNotionalUsd)}`);
  lines.push(`Total GROSS exit value: ${formatUsd(report.performance.totalGrossExitValueUsd)}`);
  lines.push(`Total GROSS paper PnL: ${formatSignedUsd(report.performance.totalGrossPnlUsd)}`);
  lines.push(
    `Aggregate GROSS return on summed reference notional: ${formatNullablePercent(report.performance.aggregateGrossReturnPct)}`,
  );
  lines.push(`Mean GROSS PnL: ${formatNullableUsd(report.performance.meanGrossPnlUsd)}`);
  lines.push(`Median GROSS PnL: ${formatNullableUsd(report.performance.medianGrossPnlUsd)}`);
  lines.push(`Mean GROSS return: ${formatNullablePercent(report.performance.meanGrossReturnPct)}`);
  lines.push(`Median GROSS return: ${formatNullablePercent(report.performance.medianGrossReturnPct)}`);
  lines.push(`Best GROSS return: ${formatNullablePercent(report.performance.bestGrossReturnPct)}`);
  lines.push(`Worst GROSS return: ${formatNullablePercent(report.performance.worstGrossReturnPct)}`);
  lines.push(`Profit factor (GROSS paper sample): ${formatNullableNumber(report.performance.profitFactor)}`);
  lines.push(`Payoff ratio (GROSS paper sample): ${formatNullableNumber(report.performance.payoffRatio)}`);
  lines.push(
    `maxClosedTradeCumulativePnlDrawdownUsd: ${formatNullableUsd(report.performance.maxClosedTradeCumulativePnlDrawdownUsd)}`,
  );
  lines.push('This drawdown is a closed-trade diagnostic, not portfolio or account drawdown.');
  lines.push(`Max consecutive wins: ${formatNullableCount(report.performance.maxConsecutiveWins)}`);
  lines.push(`Max consecutive losses: ${formatNullableCount(report.performance.maxConsecutiveLosses)}`);
  lines.push(
    `stop_loss_threshold: count ${String(report.performance.exitReasonBreakdown.stop_loss_threshold.tradeCount)}, total GROSS PnL ${formatSignedUsd(report.performance.exitReasonBreakdown.stop_loss_threshold.totalGrossPnlUsd)}`,
  );
  lines.push(
    `take_profit_threshold: count ${String(report.performance.exitReasonBreakdown.take_profit_threshold.tradeCount)}, total GROSS PnL ${formatSignedUsd(report.performance.exitReasonBreakdown.take_profit_threshold.totalGrossPnlUsd)}`,
  );
  lines.push(
    `max_holding_time: count ${String(report.performance.exitReasonBreakdown.max_holding_time.tradeCount)}, total GROSS PnL ${formatSignedUsd(report.performance.exitReasonBreakdown.max_holding_time.totalGrossPnlUsd)}`,
  );
  lines.push('Winner-concentration fragility diagnostic');
  lines.push('This is not a strategy ranking rule and not an automatic rejection rule.');
  lines.push(
    `Top 1 contribution of positive GROSS PnL: ${formatNullablePercent(report.performance.concentration.top1WinnerGrossPnlContributionPct)}`,
  );
  lines.push(
    `Top 3 contribution of positive GROSS PnL: ${formatNullablePercent(report.performance.concentration.top3WinnersGrossPnlContributionPct)}`,
  );
  lines.push(
    `GROSS PnL excluding top 1: ${formatSignedUsd(report.performance.concentration.grossPnlExcludingTop1WinnerUsd)}`,
  );
  lines.push(
    `GROSS PnL excluding top 3: ${formatSignedUsd(report.performance.concentration.grossPnlExcludingTop3WinnersUsd)}`,
  );
  lines.push(...formatSliceLines(report.slices));
  return lines;
}

function formatSliceLines(slices: readonly ResearchSliceMetrics[]): string[] {
  const lines = [
    '',
    'Chronological robustness slices (descriptive, not formal out-of-sample proof)',
    'Simulation runs continuously across the full timeline. Open positions are not reset at slice boundaries.',
    'Completed trades are assigned by EXIT timestamp. These are not independent backtests.',
  ];
  for (const slice of slices) {
    if (slice.completedTradeCount === 0) {
      lines.push(`${slice.slice}: no completed trades / n/a`);
      continue;
    }
    lines.push(
      `${slice.slice}: completed ${String(slice.completedTradeCount)}, GROSS PnL ${formatSignedUsd(slice.totalGrossPnlUsd ?? 0)}, mean GROSS return ${formatNullablePercent(slice.meanGrossReturnPct)}, win rate ${formatNullablePercent(slice.winRatePct)}, profit factor ${formatNullableNumber(slice.profitFactor)}, top1 contribution ${formatNullablePercent(slice.top1WinnerGrossPnlContributionPct)}`,
    );
  }
  return lines;
}

function formatOneTradeLines(trade: ResearchCompletedTrade): string[] {
  return [
    `Mint: ${trade.tokenMint}`,
    `Pair: ${trade.pairAddress}`,
    `Opened: ${trade.openedAt}`,
    `Exited: ${trade.exitedAt}`,
    `Holding duration ms: ${String(trade.holdingDurationMs)}`,
    `Entry reference price: ${formatUsd(trade.entryPriceUsd)}`,
    `Reference notional: ${formatUsd(trade.entryReferenceNotionalUsd)}`,
    `Quantity: ${String(trade.quantityTokens)}`,
    `Exit reference price: ${formatUsd(trade.exitPriceUsd)}`,
    `GROSS exit value: ${formatUsd(trade.grossExitValueUsd)}`,
    `GROSS paper PnL: ${formatSignedUsd(trade.grossPnlUsd)}`,
    `GROSS return: ${formatPercent(trade.grossReturnPct)}`,
    `Outcome: ${trade.outcome}`,
    `Exit reason: ${trade.exitReason}`,
    `Research trade identity: ${trade.researchTradeIdentity}`,
  ];
}

function formatSignedUsd(value: number): string {
  const canonical = Object.is(value, -0) ? 0 : value;
  if (canonical > 0) {
    return `+${formatUsd(canonical)}`;
  }
  if (canonical < 0) {
    return `-${formatUsd(Math.abs(canonical))}`;
  }
  return formatUsd(canonical);
}

function formatNullableUsd(value: number | null): string {
  return value === null ? 'n/a' : formatSignedUsd(value);
}

function formatNullablePercent(value: number | null): string {
  return value === null ? 'n/a' : formatPercent(value);
}

function formatNullableNumber(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}

function formatNullableCount(value: number | null): string {
  return value === null ? 'n/a' : String(value);
}
