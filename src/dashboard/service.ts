import type { AppConfig } from '../config/types.js';
import { executePerformanceReport } from '../performance/command.js';
import { executeResearchCompare } from '../research/command.js';
import { RESEARCH_CANDIDATE_IDS } from '../research/types.js';
import { mapMarketData, mapPerformanceData, mapResearchData, mapRuntimePaperData } from './adapters.js';
import {
  DASHBOARD_CHECKPOINT,
  DASHBOARD_SPEC_NAME,
  DASHBOARD_SPEC_VERSION,
} from './constants.js';
import { DASHBOARD_DEFINITION_FINGERPRINT } from './identity.js';
import { sanitizeDashboardConfig, sanitizeDashboardReason } from './sanitize.js';
import {
  toDatabaseSectionData,
  tryOpenSqliteDashboardDataSource,
  type SqliteDashboardDataSource,
} from './sqlite-source.js';
import type {
  DashboardClock,
  DashboardDataQualityData,
  DashboardHealthData,
  DashboardSection,
  DashboardSnapshot,
} from './types.js';

export const systemDashboardClock: DashboardClock = {
  nowIso(): string {
    return new Date().toISOString();
  },
};

export const DASHBOARD_SAFETY = {
  blockchainCapability: 'READ_ONLY',
  tradingCapability: 'DISABLED',
  walletCapability: 'NOT_IMPLEMENTED',
  signerCapability: 'NOT_IMPLEMENTED',
  executionCapability: 'NOT_IMPLEMENTED',
  researchCapability: 'AVAILABLE',
  performanceCapability: 'AVAILABLE',
  dashboardCapability: 'AVAILABLE',
  checkpoint: DASHBOARD_CHECKPOINT,
} as const;

export class DashboardService {
  constructor(
    private readonly config: AppConfig,
    private readonly clock: DashboardClock = systemDashboardClock,
  ) {}

  buildSnapshot(): DashboardSnapshot {
    const opened = tryOpenSqliteDashboardDataSource(this.config.database);
    const source = opened.source;
    if (source === null) {
      return this.unavailableSnapshot(opened.reason ?? 'Database file is not available.');
    }

    try {
      return source.withReadSnapshot(() => this.buildSnapshotFromSource(source));
    } finally {
      source.close();
    }
  }

  buildDatabaseHealth(): DashboardSection<DashboardHealthData> {
    const opened = tryOpenSqliteDashboardDataSource(this.config.database);
    const source = opened.source;
    const checkedAt = this.clock.nowIso();
    if (source === null) {
      return {
        state: 'unavailable',
        reason: opened.reason,
        data: {
          status: 'unavailable',
          schemaVersion: null,
          integrityCheck: null,
          foreignKeyViolations: null,
          queryOnly: null,
          checkedAt,
        },
      };
    }

    try {
      return source.withReadSnapshot(() => {
        const inspection = source.inspectSchema();
        if (!inspection.compatible) {
          return {
            state: 'error',
            reason: inspection.reason,
            data: {
              status: 'incompatible',
              schemaVersion: inspection.schemaVersion,
              integrityCheck: null,
              foreignKeyViolations: null,
              queryOnly: source.queryOnlyEnabled(),
              checkedAt,
            },
          };
        }

        const health = source.runDatabaseHealth();
        const ok = health.integrityCheck === 'ok' && health.foreignKeyViolations === 0;
        return {
          state: ok ? 'available' : 'error',
          reason: ok ? null : 'Database integrity check failed.',
          data: {
            status: ok ? 'ok' : 'failed',
            schemaVersion: inspection.schemaVersion,
            integrityCheck: health.integrityCheck,
            foreignKeyViolations: health.foreignKeyViolations,
            queryOnly: source.queryOnlyEnabled(),
            checkedAt,
          },
        };
      });
    } catch (error: unknown) {
      return {
        state: 'error',
        reason: sanitizeDashboardReason(error),
        data: {
          status: 'failed',
          schemaVersion: null,
          integrityCheck: null,
          foreignKeyViolations: null,
          queryOnly: null,
          checkedAt,
        },
      };
    } finally {
      source.close();
    }
  }

  buildPresentationShell(): Pick<DashboardSnapshot, 'meta' | 'safety' | 'configuration'> {
    return this.baseSnapshot();
  }

  private buildSnapshotFromSource(source: SqliteDashboardDataSource): DashboardSnapshot {
    const inspection = source.inspectSchema();
    const queryOnly = source.queryOnlyEnabled();
    if (!inspection.compatible) {
      const database = toDatabaseSectionData({ inspection, queryOnly, coverage: null });
      return {
        ...this.baseSnapshot(),
        database: { state: 'error', reason: inspection.reason, data: database },
        market: unavailableSection('Database schema is incompatible.'),
        runtimePaper: unavailableSection('Database schema is incompatible.'),
        performance: unavailableSection('Database schema is incompatible.'),
        research: unavailableSection('Database schema is incompatible.'),
        dataQuality: unavailableSection('Database schema is incompatible.'),
      };
    }

    const coverage = source.loadCoverage();
    const database = toDatabaseSectionData({ inspection, queryOnly, coverage });
    const markets = source.loadRecentMarkets();
    const openPositions = source.loadOpenPaperPositions();
    const performance = this.loadPerformanceSection();
    const research = this.loadResearchSection();
    const runtimePaper = mapRuntimePaperData({
      openPositions,
      performance: performance.data?.report ?? null,
    });
    const dataQuality = this.buildDataQuality(coverage, performance.data?.report.dataset.closedTradeCount ?? null, research.data);

    return {
      ...this.baseSnapshot(),
      database: { state: 'available', reason: null, data: database },
      market:
        markets.length === 0
          ? { state: 'empty', reason: null, data: mapMarketData(markets) }
          : { state: 'available', reason: null, data: mapMarketData(markets) },
      runtimePaper:
        runtimePaper.openPositions.length === 0 && runtimePaper.recentClosedTrades.length === 0
          ? { state: 'empty', reason: null, data: runtimePaper }
          : { state: 'available', reason: null, data: runtimePaper },
      performance,
      research,
      dataQuality: { state: 'available', reason: null, data: dataQuality },
    };
  }

  private loadPerformanceSection(): DashboardSnapshot['performance'] {
    try {
      const report = executePerformanceReport(this.config, { integrity: 'skip' });
      const data = mapPerformanceData(report);
      if (data.emptyMessage !== null) {
        return { state: 'empty', reason: null, data };
      }
      return { state: 'available', reason: null, data };
    } catch (error: unknown) {
      return { state: 'error', reason: sanitizeDashboardReason(error), data: null };
    }
  }

  private loadResearchSection(): DashboardSnapshot['research'] {
    try {
      const report = executeResearchCompare(this.config, { integrity: 'skip' });
      return { state: 'available', reason: null, data: mapResearchData(report) };
    } catch (error: unknown) {
      return { state: 'error', reason: sanitizeDashboardReason(error), data: null };
    }
  }

  private buildDataQuality(
    coverage: ReturnType<SqliteDashboardDataSource['loadCoverage']>,
    runtimeCompletedTradeCount: number | null,
    research: DashboardSnapshot['research']['data'],
  ): DashboardDataQualityData {
    return {
      marketSnapshotCount: coverage.counts.marketSnapshots,
      tokenCount: coverage.counts.tokens,
      riskScanCount: coverage.counts.riskScans,
      tokensWithRisk: coverage.tokensWithRisk,
      featureVectorCount: coverage.counts.featureVectors,
      strategyEvaluationCount: coverage.counts.strategyEvaluations,
      runtimeCompletedTradeCount,
      researchInsufficientDataCounts: researchInsufficientCounts(research),
    };
  }

  private unavailableSnapshot(reason: string): DashboardSnapshot {
    return {
      ...this.baseSnapshot(),
      database: {
        state: 'unavailable',
        reason,
        data: {
          status: 'unavailable',
          schemaVersion: null,
          queryOnly: null,
          health: 'unavailable',
          counts: null,
          latestMarketCollectedAt: null,
          latestRiskScannedAt: null,
          latestStrategyEvaluatedAt: null,
          latestPaperEvaluatedAt: null,
          latestExitEvaluatedAt: null,
        },
      },
      market: unavailableSection(reason),
      runtimePaper: unavailableSection(reason),
      performance: unavailableSection(reason),
      research: unavailableSection(reason),
      dataQuality: unavailableSection(reason),
    };
  }

  private baseSnapshot(): Pick<DashboardSnapshot, 'meta' | 'safety' | 'configuration'> {
    return {
      meta: {
        dashboardSpecVersion: DASHBOARD_SPEC_VERSION,
        dashboardSpecName: DASHBOARD_SPEC_NAME,
        dashboardDefinitionFingerprint: DASHBOARD_DEFINITION_FINGERPRINT,
        checkpoint: DASHBOARD_CHECKPOINT,
        generatedAt: this.clock.nowIso(),
        observability: {
          kind: 'observability_view',
          atomicSemanticDatabaseSnapshot: false,
          sectionsRebuiltIndependentlyReadOnly: true,
        },
      },
      safety: DASHBOARD_SAFETY,
      configuration: sanitizeDashboardConfig(this.config),
    };
  }
}

function unavailableSection<T>(reason: string): DashboardSection<T> {
  return { state: 'unavailable', reason, data: null };
}

function researchInsufficientCounts(
  research: DashboardSnapshot['research']['data'],
): DashboardDataQualityData['researchInsufficientDataCounts'] {
  if (research === null) {
    return null;
  }

  const counts = {
    s07_baseline: 0,
    quality_control_v1: 0,
    time_series_momentum_v1: 0,
    flow_confirmed_momentum_v1: 0,
    runner_friendly_momentum_v1: 0,
  };
  for (const candidateId of RESEARCH_CANDIDATE_IDS) {
    const row = research.candidates.find((candidate) => candidate.candidateId === candidateId);
    counts[candidateId] = row?.decisions.insufficientDataCount ?? 0;
  }
  return counts;
}
