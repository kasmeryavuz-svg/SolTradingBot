import { formatPercent, formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type { CompletedPaperTrade, PerformanceReport } from './types.js';

export function formatPerformanceReportLines(report: PerformanceReport): string[] {
  return [
    ...formatGrossPaperDisclaimer(),
    '',
    'Dataset',
    `Status: ${report.dataset.status}`,
    `Performance spec: ${report.dataset.performanceSpecVersion}`,
    `Performance name: ${report.dataset.performanceSpecName}`,
    `Performance definition fingerprint: ${report.dataset.performanceDefinitionFingerprint}`,
    `Dataset fingerprint: ${report.dataset.datasetFingerprint}`,
    `Closed trades: ${String(report.dataset.closedTradeCount)}`,
    `First exit: ${report.dataset.firstExitedAt ?? 'n/a'}`,
    `Last exit: ${report.dataset.lastExitedAt ?? 'n/a'}`,
    '',
    ...formatNoTradeOrMetrics(report),
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatPerformanceTradeLines(
  report: PerformanceReport,
  displayLimit: number,
): string[] {
  const newestFirst = [...report.trades].reverse();
  const displayed = newestFirst.slice(0, displayLimit);

  const lines = [
    ...formatGrossPaperDisclaimer(),
    '',
    'Completed GROSS paper trades',
    `Displaying ${String(displayed.length)} of ${String(report.dataset.closedTradeCount)} closed trades (newest first).`,
    `Display limit: ${String(displayLimit)}. This limit does not change performance:report.`,
    '',
  ];

  if (displayed.length === 0) {
    lines.push('No completed paper trades to list.');
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

function formatGrossPaperDisclaimer(): string[] {
  return [
    'GROSS PAPER ANALYTICS',
    'NOT LIVE / NOT NET PERFORMANCE',
    '',
    'These results describe completed simulated paper trades only.',
    'Gross paper results are not evidence of live profitability.',
    'They are not net performance and not a forecast.',
    '',
    'Limitations of this checkpoint:',
    '- no DEX trading fees',
    '- no Solana base/priority fees',
    '- no slippage',
    '- no price impact',
    '- no MEV',
    '- no transaction latency',
    '- no failed transactions',
    '- no partial fills',
    '- no token transfer restrictions/taxes',
    '- exit price is an observed reference price, not a guaranteed fill',
    '- fixed $100 reference trade size is not a bankroll model',
  ];
}

function formatNoTradeOrMetrics(report: PerformanceReport): string[] {
  if (report.dataset.status === 'no_closed_trades' || report.dataset.closedTradeCount === 0) {
    return [
      'No performance conclusion is available.',
      'Zero closed trades cannot be interpreted as a zero return, a zero win rate, or a breakeven strategy result.',
      '',
      'Counts',
      `Wins: ${String(report.counts.winCount)}`,
      `Losses: ${String(report.counts.lossCount)}`,
      `Breakevens: ${String(report.counts.breakevenCount)}`,
      '',
      'Rates',
      'Win rate: n/a (no closed trades)',
      'Loss rate: n/a (no closed trades)',
      'Breakeven rate: n/a (no closed trades)',
      '',
      'Capital-reference totals (sum of paper $100 sizes, not a wallet)',
      `Total reference notional: ${formatUsd(report.capitalReferenceTotals.totalReferenceNotionalUsd)}`,
      `Total GROSS exit value: ${formatUsd(report.capitalReferenceTotals.totalGrossExitValueUsd)}`,
      `Total GROSS paper PnL: ${formatSignedUsd(report.capitalReferenceTotals.totalGrossPnlUsd)}`,
      'Aggregate GROSS return on summed trade reference notional: n/a (no closed trades)',
    ];
  }

  return [
    'Counts',
    `Wins: ${String(report.counts.winCount)}`,
    `Losses: ${String(report.counts.lossCount)}`,
    `Breakevens: ${String(report.counts.breakevenCount)}`,
    '',
    'Rates (denominator = closed trade count)',
    `Win rate: ${formatNullablePercent(report.rates.winRatePct)}`,
    `Loss rate: ${formatNullablePercent(report.rates.lossRatePct)}`,
    `Breakeven rate: ${formatNullablePercent(report.rates.breakevenRatePct)}`,
    'A high win rate alone does not prove live or net performance.',
    '',
    'Capital-reference totals (sum of paper $100 sizes, not a wallet)',
    `Total reference notional: ${formatUsd(report.capitalReferenceTotals.totalReferenceNotionalUsd)}`,
    `Total GROSS exit value: ${formatUsd(report.capitalReferenceTotals.totalGrossExitValueUsd)}`,
    `Total GROSS paper PnL: ${formatSignedUsd(report.capitalReferenceTotals.totalGrossPnlUsd)}`,
    `Aggregate GROSS return on summed trade reference notional: ${formatNullablePercent(report.aggregateGrossReturnPct)}`,
    'This is not a portfolio return and not a compounded return.',
    '',
    'Trade distribution (GROSS paper)',
    `Mean GROSS PnL: ${formatNullableUsd(report.distribution.meanGrossPnlUsd)}`,
    `Median GROSS PnL: ${formatNullableUsd(report.distribution.medianGrossPnlUsd)}`,
    `Mean GROSS return: ${formatNullablePercent(report.distribution.meanGrossReturnPct)}`,
    `Median GROSS return: ${formatNullablePercent(report.distribution.medianGrossReturnPct)}`,
    `Best GROSS return: ${formatNullablePercent(report.distribution.bestGrossReturnPct)}`,
    `Worst GROSS return: ${formatNullablePercent(report.distribution.worstGrossReturnPct)}`,
    `Mean winning GROSS PnL: ${formatNullableUsd(report.distribution.meanWinningGrossPnlUsd)}`,
    `Mean losing GROSS PnL: ${formatNullableUsd(report.distribution.meanLosingGrossPnlUsd)}`,
    `Mean winning GROSS return: ${formatNullablePercent(report.distribution.meanWinningGrossReturnPct)}`,
    `Mean losing GROSS return: ${formatNullablePercent(report.distribution.meanLosingGrossReturnPct)}`,
    '',
    `Profit factor (GROSS paper sample): ${formatNullableNumber(report.profitFactor)}`,
    `Payoff ratio (GROSS paper sample): ${formatNullableNumber(report.payoffRatio)}`,
    'These ratios describe this closed-trade sample. They are not proof of future results.',
    '',
    'Closed-trade cumulative GROSS paper PnL drawdown',
    `maxClosedTradeCumulativePnlDrawdownUsd: ${formatNullableUsd(report.maxClosedTradeCumulativePnlDrawdownUsd)}`,
    'This is a diagnostic over the sequence of closed trades.',
    'It is NOT portfolio drawdown, equity drawdown, account drawdown, or capital drawdown.',
    'Overlapping positions and capital usage are not modeled. No drawdown percentage is calculated.',
    '',
    'Streaks (breakeven resets both)',
    `Max consecutive wins: ${formatNullableCount(report.streaks.maxConsecutiveWins)}`,
    `Max consecutive losses: ${formatNullableCount(report.streaks.maxConsecutiveLosses)}`,
    '',
    'Exit-reason breakdown (GROSS paper)',
    ...formatReasonLines('stop_loss_threshold', report.exitReasonBreakdown.stop_loss_threshold),
    ...formatReasonLines('take_profit_threshold', report.exitReasonBreakdown.take_profit_threshold),
    ...formatReasonLines('max_holding_time', report.exitReasonBreakdown.max_holding_time),
    '',
    'Winner-concentration fragility diagnostic',
    'This is not a strategy optimization rule.',
    `Total positive GROSS PnL: ${formatUsd(report.concentration.totalPositiveGrossPnlUsd)}`,
    `Top 1 winner contribution of positive GROSS PnL: ${formatNullablePercent(report.concentration.top1WinnerGrossPnlContributionPct)}`,
    `Top 3 winners contribution of positive GROSS PnL: ${formatNullablePercent(report.concentration.top3WinnersGrossPnlContributionPct)}`,
    `GROSS PnL excluding top 1 winner (${String(report.concentration.top1WinnersRemovedCount)} removed): ${formatSignedUsd(report.concentration.grossPnlExcludingTop1WinnerUsd)}`,
    `GROSS PnL excluding top 3 winners (${String(report.concentration.top3WinnersRemovedCount)} removed): ${formatSignedUsd(report.concentration.grossPnlExcludingTop3WinnersUsd)}`,
  ];
}

function formatReasonLines(
  reason: string,
  stats: PerformanceReport['exitReasonBreakdown']['stop_loss_threshold'],
): string[] {
  return [
    `${reason}: count ${String(stats.tradeCount)}, total GROSS PnL ${formatSignedUsd(stats.totalGrossPnlUsd)}, mean GROSS PnL ${formatNullableUsd(stats.meanGrossPnlUsd)}, mean GROSS return ${formatNullablePercent(stats.meanGrossReturnPct)}`,
  ];
}

function formatOneTradeLines(trade: CompletedPaperTrade): string[] {
  return [
    `Mint: ${trade.tokenMint}`,
    `Pair: ${trade.pairAddress}`,
    `Opened: ${trade.openedAt}`,
    `Exited: ${trade.exitedAt}`,
    `Holding duration ms: ${String(trade.holdingDurationMs)}`,
    `Entry reference price: ${formatUsd(trade.entryPriceUsd)}`,
    `Reference notional: ${formatUsd(trade.entryReferenceNotionalUsd)}`,
    `Stored quantity: ${String(trade.quantityTokens)}`,
    `Exit reference price: ${formatUsd(trade.exitPriceUsd)}`,
    `GROSS exit value: ${formatUsd(trade.grossExitValueUsd)}`,
    `GROSS paper PnL: ${formatSignedUsd(trade.grossPnlUsd)}`,
    `GROSS return: ${formatPercent(trade.grossReturnPct)}`,
    `Outcome: ${trade.outcome}`,
    `Exit reason: ${trade.exitReason}`,
    `Position source: ${trade.positionSourceIdentity}`,
    `Exit evidence source: ${trade.exitEvidenceSourceIdentity}`,
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
