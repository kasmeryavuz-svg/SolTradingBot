import { canonicalizeZero } from '../performance/numbers.js';
import type { PerformanceReport } from '../performance/types.js';
import type { ResearchCompareReport } from '../research/types.js';
import { RESEARCH_CANDIDATE_IDS } from '../research/types.js';
import {
  DASHBOARD_MARKET_LIMIT,
  DASHBOARD_RUNTIME_CLOSED_TRADE_LIMIT,
} from './constants.js';
import { abbreviateFingerprint, abbreviateIdentity } from './display.js';
import { DashboardError } from './errors.js';
import type {
  DashboardCumulativePoint,
  DashboardMarketData,
  DashboardOpenPaperPosition,
  DashboardPerformanceData,
  DashboardResearchCandidateRow,
  DashboardResearchData,
  DashboardRuntimeClosedTrade,
  DashboardRuntimePaperData,
} from './types.js';

export function mapMarketData(rows: DashboardMarketData['rows']): DashboardMarketData {
  return {
    displayLimit: DASHBOARD_MARKET_LIMIT,
    ordering: 'collectedAt_desc_then_tokenMint_then_pairAddress',
    rows,
  };
}

export function mapRuntimePaperData(input: {
  openPositions: DashboardOpenPaperPosition[];
  performance: PerformanceReport | null;
}): DashboardRuntimePaperData {
  const recentClosedTrades =
    input.performance === null
      ? []
      : [...input.performance.trades]
          .reverse()
          .slice(0, DASHBOARD_RUNTIME_CLOSED_TRADE_LIMIT)
          .map(mapRuntimeClosedTrade);

  return {
    title: 'Runtime Paper Lifecycle',
    openPositions: input.openPositions,
    recentClosedTrades,
    recentClosedTradeLimit: DASHBOARD_RUNTIME_CLOSED_TRADE_LIMIT,
  };
}

export function mapPerformanceData(report: PerformanceReport): DashboardPerformanceData {
  const empty = report.dataset.status === 'no_closed_trades';
  return {
    title: 'GROSS PAPER PERFORMANCE',
    notNet: true,
    notLive: true,
    emptyMessage: empty ? 'No closed runtime paper trades yet.' : null,
    report,
    closedTradeCumulativeGrossPnl: buildClosedTradeCumulativeGrossPnl(report.trades),
  };
}

export function mapResearchData(report: ResearchCompareReport): DashboardResearchData {
  const candidates = RESEARCH_CANDIDATE_IDS.map((candidateId) => {
    const found = report.candidates.find((candidate) => candidate.candidate.candidateId === candidateId);
    if (found === undefined) {
      throw new DashboardError('Research compare report omitted a canonical candidate.');
    }
    return mapResearchCandidate(found);
  });

  return {
    title: 'STRATEGY RESEARCH LAB',
    subtitle: 'HISTORICAL GROSS PAPER REFERENCE',
    notLive: true,
    notOptimized: true,
    researchSpecVersion: report.researchSpecVersion,
    researchSpecName: report.researchSpecName,
    researchDefinitionFingerprint: report.researchDefinitionFingerprint,
    researchDatasetFingerprint: report.researchDatasetFingerprint,
    researchDatasetFingerprintAbbreviated: abbreviateFingerprint(report.researchDatasetFingerprint),
    rawMarketSnapshotCount: report.rawMarketSnapshotCount,
    runtimeExitReferencedSnapshotCountExcluded: report.runtimeExitReferencedSnapshotCountExcluded,
    researchMarketSnapshotCount: report.researchMarketSnapshotCount,
    uniqueTokenCount: report.uniqueTokenCount,
    uniquePairCount: report.uniquePairCount,
    riskScanCount: report.riskScanCount,
    uniqueTokensWithRiskScan: report.uniqueTokensWithRiskScan,
    firstSnapshotAt: report.firstSnapshotAt,
    lastSnapshotAt: report.lastSnapshotAt,
    datasetSpanMs: report.datasetSpanMs,
    snapshotsWithFinitePriceCount: report.snapshotsWithFinitePriceCount,
    snapshotsWithNullPriceCount: report.snapshotsWithNullPriceCount,
    candidateOrder: 'canonical_candidateId_registry_order',
    ranking: false,
    candidates,
  };
}

function mapResearchCandidate(
  candidate: ResearchCompareReport['candidates'][number],
): DashboardResearchCandidateRow {
  return {
    candidateId: candidate.candidate.candidateId,
    candidateName: candidate.candidate.candidateName,
    candidateDefinitionFingerprint: candidate.candidate.candidateDefinitionFingerprint,
    candidateRunFingerprint: candidate.candidateRunFingerprint,
    decisions: candidate.decisions,
    lifecycle: candidate.lifecycle,
    winCount: candidate.performance.winCount,
    lossCount: candidate.performance.lossCount,
    breakevenCount: candidate.performance.breakevenCount,
    totalGrossPnlUsd: candidate.performance.totalGrossPnlUsd,
    aggregateGrossReturnPct: candidate.performance.aggregateGrossReturnPct,
    profitFactor: candidate.performance.profitFactor,
    maxClosedTradeCumulativePnlDrawdownUsd: candidate.performance.maxClosedTradeCumulativePnlDrawdownUsd,
    top1WinnerGrossPnlContributionPct: candidate.performance.concentration.top1WinnerGrossPnlContributionPct,
    top3WinnersGrossPnlContributionPct: candidate.performance.concentration.top3WinnersGrossPnlContributionPct,
    slices: candidate.slices,
    unresolvedPositions: candidate.unresolvedPositions,
  };
}

function mapRuntimeClosedTrade(
  trade: PerformanceReport['trades'][number],
): DashboardRuntimeClosedTrade {
  return {
    tokenMint: trade.tokenMint,
    pairAddress: trade.pairAddress,
    openedAt: trade.openedAt,
    exitedAt: trade.exitedAt,
    entryReferencePriceUsd: trade.entryPriceUsd,
    referenceNotionalUsd: trade.entryReferenceNotionalUsd,
    quantityTokens: trade.quantityTokens,
    exitPriceUsd: trade.exitPriceUsd,
    grossPnlUsd: trade.grossPnlUsd,
    grossReturnPct: trade.grossReturnPct,
    outcome: trade.outcome,
    exitReason: trade.exitReason,
    positionSourceIdentityAbbreviated: abbreviateIdentity(trade.positionSourceIdentity),
  };
}

export function buildClosedTradeCumulativeGrossPnl(
  trades: readonly { exitedAt: string; grossPnlUsd: number }[],
): DashboardCumulativePoint[] {
  let running = 0;
  return trades.map((trade) => {
    running = canonicalizeZero(running + trade.grossPnlUsd);
    return {
      exitedAt: trade.exitedAt,
      cumulativeGrossPnlUsd: running,
    };
  });
}
