import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/index.js';
import { executePerformanceReport } from '../src/performance/command.js';
import { executeResearchCompare } from '../src/research/command.js';
import { RESEARCH_CANDIDATE_IDS } from '../src/research/types.js';
import { DashboardService } from '../src/dashboard/index.js';
import { seedClosedPaperTrade, WRAPPED_SOL_MINT, T_10_00, addMs } from './performance-fixtures.js';
import { allEntrySnapshot } from './research-fixtures.js';
import { passingRisk } from './strategy-fixtures.js';
import { USDC_MINT } from '../src/config/index.js';
import {
  cleanupDashboardHarness,
  dashboardTempDbPath,
  FIXED_CLOCK,
  openDashboardWriteRepo,
} from './dashboard-harness.js';

afterEach(async () => {
  await cleanupDashboardHarness();
});

describe('dashboard upstream equality', () => {
  it('matches a12 performance:report numbers exactly for a synthetic closed-trade database', () => {
    const path = dashboardTempDbPath();
    const repository = openDashboardWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 1,
      exitPriceUsd: 1.2,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: USDC_MINT,
      openedAt: addMs(T_10_00, 120_000),
      exitedAt: addMs(T_10_00, 180_000),
      entryPriceUsd: 1,
      exitPriceUsd: 0.8,
    });
    repository.close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const report = executePerformanceReport(config);
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    expect(snapshot.performance.state).toBe('available');
    expect(snapshot.performance.data?.report).toEqual(report);
    expect(snapshot.performance.data?.report.dataset).toEqual(report.dataset);
    expect(snapshot.performance.data?.report.counts).toEqual(report.counts);
    expect(snapshot.performance.data?.report.rates).toEqual(report.rates);
    expect(snapshot.performance.data?.report.capitalReferenceTotals).toEqual(report.capitalReferenceTotals);
    expect(snapshot.performance.data?.report.distribution).toEqual(report.distribution);
    expect(snapshot.performance.data?.report.profitFactor).toBe(report.profitFactor);
    expect(snapshot.performance.data?.report.payoffRatio).toBe(report.payoffRatio);
    expect(snapshot.performance.data?.report.maxClosedTradeCumulativePnlDrawdownUsd).toBe(
      report.maxClosedTradeCumulativePnlDrawdownUsd,
    );
    expect(snapshot.performance.data?.report.concentration).toEqual(report.concentration);
    expect(snapshot.performance.data?.report.trades).toEqual(report.trades);
    expect(snapshot.runtimePaper.data?.recentClosedTrades.length).toBe(report.trades.length);
    expect(snapshot.runtimePaper.data?.openPositions).toEqual([]);
  });

  it('matches r125 research:compare coverage and metrics in canonical candidate order', () => {
    const path = dashboardTempDbPath();
    const repository = openDashboardWriteRepo(path);
    repository.recordMarketSnapshots([
      allEntrySnapshot({ collectedAt: T_10_00, priceUsd: 1 }),
      allEntrySnapshot({ collectedAt: addMs(T_10_00, 60_000), priceUsd: 1.01 }),
    ]);
    repository.recordRiskReport(passingRisk({ scannedAt: addMs(T_10_00, -60_000) }));
    repository.close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const compare = executeResearchCompare(config);
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    expect(snapshot.research.state).toBe('available');
    const data = snapshot.research.data;
    expect(data?.researchDatasetFingerprint).toBe(compare.researchDatasetFingerprint);
    expect(data?.rawMarketSnapshotCount).toBe(compare.rawMarketSnapshotCount);
    expect(data?.runtimeExitReferencedSnapshotCountExcluded).toBe(
      compare.runtimeExitReferencedSnapshotCountExcluded,
    );
    expect(data?.researchMarketSnapshotCount).toBe(compare.researchMarketSnapshotCount);
    expect(data?.candidates.map((row) => row.candidateId)).toEqual([...RESEARCH_CANDIDATE_IDS]);
    for (const [index, candidateId] of RESEARCH_CANDIDATE_IDS.entries()) {
      const expected = compare.candidates[index];
      const actual = data?.candidates[index];
      expect(expected?.candidate.candidateId).toBe(candidateId);
      expect(actual?.candidateId).toBe(candidateId);
      expect(actual?.candidateDefinitionFingerprint).toBe(expected?.candidate.candidateDefinitionFingerprint);
      expect(actual?.candidateRunFingerprint).toBe(expected?.candidateRunFingerprint);
      expect(actual?.unresolvedPositions).toEqual(expected?.unresolvedPositions);
      expect(actual?.decisions).toEqual(expected?.decisions);
      expect(actual?.lifecycle).toEqual(expected?.lifecycle);
      expect(actual?.totalGrossPnlUsd).toBe(expected?.performance.totalGrossPnlUsd);
      expect(actual?.aggregateGrossReturnPct).toBe(expected?.performance.aggregateGrossReturnPct);
      expect(actual?.profitFactor).toBe(expected?.performance.profitFactor);
      expect(actual?.slices).toEqual(expected?.slices);
    }
    expect(data?.datasetSpanMs).toBe(compare.datasetSpanMs);
    expect(data?.snapshotsWithFinitePriceCount).toBe(compare.snapshotsWithFinitePriceCount);
    expect(data?.snapshotsWithNullPriceCount).toBe(compare.snapshotsWithNullPriceCount);
  });

  it('keeps runtime paper trades out of research and generatedAt out of fingerprints', () => {
    const path = dashboardTempDbPath();
    const repository = openDashboardWriteRepo(path);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 1,
      exitPriceUsd: 1.2,
    });
    repository.recordMarketSnapshots([
      allEntrySnapshot({ collectedAt: T_10_00, priceUsd: 1 }),
      allEntrySnapshot({ collectedAt: addMs(T_10_00, 60_000), priceUsd: 1.01 }),
    ]);
    repository.recordRiskReport(passingRisk({ scannedAt: addMs(T_10_00, -60_000) }));
    repository.close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    const again = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    expect(snapshot).toEqual(again);
    expect(snapshot.meta.generatedAt).toBe('2026-08-17T22:00:00.000Z');
    expect(snapshot.runtimePaper.data?.recentClosedTrades).toHaveLength(1);
    expect(snapshot.runtimePaper.data?.openPositions).toEqual([]);
    expect(snapshot.performance.data?.report.dataset.closedTradeCount).toBe(1);
    expect(snapshot.research.data?.candidates).toHaveLength(5);
    expect(snapshot.meta.dashboardDefinitionFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.performance.data?.report.dataset.performanceDefinitionFingerprint).toBe(
      executePerformanceReport(config).dataset.performanceDefinitionFingerprint,
    );
    expect(snapshot.research.data?.researchDefinitionFingerprint).toBe(
      executeResearchCompare(config).researchDefinitionFingerprint,
    );
  });
});
