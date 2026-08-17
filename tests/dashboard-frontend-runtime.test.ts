import { describe, expect, it } from 'vitest';
import {
  createDashboardApp,
  formatCount,
  formatPercent,
  formatTimestamp,
  formatUsd,
  text,
} from '../src/dashboard/public/app.js';
import { createDashboardDocument } from './dashboard-minidom.js';

function jsonResponse(body: unknown, ok = true): Promise<{ ok: boolean; json: () => Promise<unknown> }> {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

function baseSnapshot(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    meta: {
      dashboardSpecVersion: 'd13_v1',
      dashboardSpecName: 'local_read_only_observability_dashboard',
      dashboardDefinitionFingerprint: 'abc',
      checkpoint: '13',
      generatedAt: '2026-08-17T22:00:00.000Z',
      observability: {
        kind: 'observability_view',
        atomicSemanticDatabaseSnapshot: false,
        sectionsRebuiltIndependentlyReadOnly: true,
      },
    },
    safety: {
      blockchainCapability: 'READ_ONLY',
      tradingCapability: 'DISABLED',
      walletCapability: 'NOT_IMPLEMENTED',
      signerCapability: 'NOT_IMPLEMENTED',
      executionCapability: 'NOT_IMPLEMENTED',
      researchCapability: 'AVAILABLE',
      performanceCapability: 'AVAILABLE',
      dashboardCapability: 'AVAILABLE',
      checkpoint: '13',
    },
    configuration: {
      nodeEnv: 'test',
      solanaNetwork: 'mainnet-beta',
      databaseEnabled: true,
      databaseFilename: 'history.sqlite',
      discoveryEnabled: false,
      configuredMarketTokenCount: 0,
      checkpoint: '13',
      dashboardSpecVersion: 'd13_v1',
    },
    database: {
      state: 'available',
      reason: null,
      data: {
        status: 'available',
        schemaVersion: 7,
        queryOnly: true,
        health: 'not_checked',
        counts: {
          tokens: 0,
          marketSnapshots: 0,
          riskScans: 0,
          featureVectors: 0,
          strategyEvaluations: 0,
          paperEvaluations: 0,
          positionEvaluations: 0,
          paperPositions: 0,
          paperOpenPositions: 0,
          exitEvaluations: 0,
          paperPositionExits: 0,
        },
        latestMarketCollectedAt: null,
        latestRiskScannedAt: null,
        latestStrategyEvaluatedAt: null,
        latestPaperEvaluatedAt: null,
        latestExitEvaluatedAt: null,
      },
    },
    market: { state: 'empty', reason: null, data: { displayLimit: 25, ordering: 'collectedAt_desc_then_tokenMint_then_pairAddress', rows: [] } },
    runtimePaper: {
      state: 'empty',
      reason: null,
      data: { title: 'Runtime Paper Lifecycle', openPositions: [], recentClosedTrades: [], recentClosedTradeLimit: 20 },
    },
    performance: {
      state: 'empty',
      reason: null,
      data: {
        title: 'GROSS PAPER PERFORMANCE',
        notNet: true,
        notLive: true,
        emptyMessage: 'No closed runtime paper trades yet.',
        report: {
          dataset: { closedTradeCount: 0, status: 'no_closed_trades' },
          counts: { winCount: 0, lossCount: 0, breakevenCount: 0 },
          rates: { winRatePct: null },
          capitalReferenceTotals: {
            totalReferenceNotionalUsd: 0,
            totalGrossExitValueUsd: 0,
            totalGrossPnlUsd: 0,
          },
          aggregateGrossReturnPct: null,
          distribution: {
            meanGrossReturnPct: null,
            medianGrossReturnPct: null,
            bestGrossReturnPct: null,
            worstGrossReturnPct: null,
          },
          profitFactor: null,
          payoffRatio: null,
          maxClosedTradeCumulativePnlDrawdownUsd: null,
          concentration: {
            top1WinnerGrossPnlContributionPct: null,
            top3WinnersGrossPnlContributionPct: null,
            grossPnlExcludingTop1WinnerUsd: null,
            grossPnlExcludingTop3WinnersUsd: null,
          },
        },
        closedTradeCumulativeGrossPnl: [],
      },
    },
    research: {
      state: 'available',
      reason: null,
      data: {
        title: 'STRATEGY RESEARCH LAB',
        subtitle: 'HISTORICAL GROSS PAPER REFERENCE',
        notLive: true,
        notOptimized: true,
        researchSpecVersion: 'r125_v1',
        researchSpecName: 'x',
        researchDefinitionFingerprint: 'r',
        researchDatasetFingerprint: 'd',
        researchDatasetFingerprintAbbreviated: 'd…d',
        rawMarketSnapshotCount: 0,
        runtimeExitReferencedSnapshotCountExcluded: 0,
        researchMarketSnapshotCount: 0,
        uniqueTokenCount: 0,
        uniquePairCount: 0,
        riskScanCount: 0,
        uniqueTokensWithRiskScan: 0,
        firstSnapshotAt: null,
        lastSnapshotAt: null,
        candidateOrder: 'canonical_candidateId_registry_order',
        ranking: false,
        candidates: [
          researchRow('s07_baseline', 0, null, 1),
          researchRow('quality_control_v1', 0, null, 2),
          researchRow('time_series_momentum_v1', 50, 12, 3),
          researchRow('flow_confirmed_momentum_v1', 0, 90, 4),
          researchRow('runner_friendly_momentum_v1', 999, 5, 5),
        ],
      },
    },
    dataQuality: {
      state: 'available',
      reason: null,
      data: {
        marketSnapshotCount: 0,
        tokenCount: 0,
        riskScanCount: 0,
        tokensWithRisk: 0,
        featureVectorCount: 0,
        strategyEvaluationCount: 0,
        runtimeCompletedTradeCount: 0,
        researchInsufficientDataCounts: {
          s07_baseline: 0,
          quality_control_v1: 0,
          time_series_momentum_v1: 0,
          flow_confirmed_momentum_v1: 0,
          runner_friendly_momentum_v1: 0,
        },
      },
    },
    ...overrides,
  };
}

function researchRow(candidateId: string, totalGrossPnlUsd: number, winRate: number | null, profitFactor: number | null) {
  return {
    candidateId,
    candidateName: candidateId,
    candidateDefinitionFingerprint: 'c',
    candidateRunFingerprint: 'run',
    decisions: { entryCandidateCount: 0, noEntryCount: 0, insufficientDataCount: 0 },
    lifecycle: { positionsOpened: 0, completedPositions: totalGrossPnlUsd === 0 ? 0 : 1, unresolvedPositions: 0 },
    winCount: 0,
    lossCount: 0,
    breakevenCount: 0,
    totalGrossPnlUsd,
    aggregateGrossReturnPct: winRate,
    profitFactor,
    maxClosedTradeCumulativePnlDrawdownUsd: null,
    top1WinnerGrossPnlContributionPct: null,
    top3WinnersGrossPnlContributionPct: null,
    slices: [],
    unresolvedPositions: [],
  };
}

describe('dashboard public JavaScript formatting', () => {
  it('does not coerce numeric zero to n/a or null rates to 0%', () => {
    expect(formatUsd(0)).toBe('0');
    expect(formatUsd(-0)).toBe('0');
    expect(formatUsd(null)).toBe('n/a');
    expect(formatUsd(undefined)).toBe('n/a');
    expect(formatUsd(Number.NaN)).toBe('n/a');
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe('n/a');
    expect(formatUsd(Number.NEGATIVE_INFINITY)).toBe('n/a');
    expect(formatUsd(-12.5)).toBe('-12.5000');
    expect(formatUsd(0.00000000123)).toBe('0.00000000123');
    expect(formatUsd(123456789.12)).toBe('123456789.12');
    expect(formatCount(0)).toBe('0');
    expect(formatCount(-0)).toBe('0');
    expect(formatCount(null)).toBe('n/a');
    expect(formatPercent(null)).toBe('n/a');
    expect(formatPercent(0)).toBe('0.00%');
    expect(text(0)).toBe('0');
    expect(formatTimestamp(null)).toBe('n/a');
    expect(formatTimestamp('not-a-time')).toBe('n/a');
    expect(formatTimestamp('2026-08-17T22:00:00.000Z')).toBe('2026-08-17T22:00:00.000Z');
  });
});

describe('dashboard public JavaScript execution', () => {
  it('renders, refreshes, isolates health, suppresses stale responses, and keeps XSS as text', async () => {
    const document = createDashboardDocument();
    const fetches: string[] = [];
    let dashboardPayload: unknown = baseSnapshot({
      market: {
        state: 'available',
        reason: null,
        data: {
          displayLimit: 25,
          ordering: 'collectedAt_desc_then_tokenMint_then_pairAddress',
          rows: [
            {
              tokenSymbol: '<script>alert(1)</script>',
              tokenName: '<img src=x onerror=alert(1)>',
              tokenMint: 'Mint111111111111111111111111111111111111111',
              pairAddress: 'Pair111111111111111111111111111111111111111',
              dexName: '"><svg/onload=alert(1)>',
              priceUsd: 0,
              liquidityUsd: 123456789.12,
              volume5mUsd: null,
              buys5m: 0,
              sells5m: null,
              priceChange5mPct: 0,
              priceChange1hPct: null,
              priceChange24hPct: -1.5,
              collectedAt: '2026-08-17T22:00:00.000Z',
            },
          ],
        },
      },
    });
    const deferred: Array<{
      url: string;
      resolve: (value: unknown) => void;
    }> = [];
    let holdNextDashboard = false;

    const app = createDashboardApp({
      document,
      nowIso: () => '2026-08-17T22:01:00.000Z',
      setIntervalFn: () => 1,
      clearIntervalFn: () => undefined,
      fetch: (url: string) => {
        fetches.push(url);
        if (url === '/api/v1/dashboard' && holdNextDashboard) {
          holdNextDashboard = false;
          return new Promise((resolve) => {
            deferred.push({
              url,
              resolve: (value: unknown) => {
                resolve({ ok: true, json: () => Promise.resolve(value) });
              },
            });
          });
        }
        if (url === '/api/v1/database-health') {
          return jsonResponse({
            health: {
              state: 'available',
              reason: null,
              data: {
                status: 'ok',
                schemaVersion: 7,
                integrityCheck: 'ok',
                foreignKeyViolations: 0,
                queryOnly: true,
                checkedAt: '2026-08-17T22:00:00.000Z',
              },
            },
          });
        }
        return jsonResponse(dashboardPayload);
      },
    });

    await app.loadDashboard();
    const market = document.querySelector('#section-market');
    expect(market?.textContent).toContain('<script>alert(1)</script>');
    expect(market?.textContent).toContain('"><svg/onload=alert(1)>');
    expect(market?.querySelector('script')).toBeNull();
    expect(market?.querySelector('img')).toBeNull();
    expect(market?.querySelector('svg')).toBeNull();
    expect(market?.textContent).toContain('0');
    expect(market?.textContent).toContain('123456789.12');

    app.showSection('research');
    const research = document.querySelector('#section-research');
    const candidateOrder = [
      ...(research?.textContent ?? '').matchAll(
        /s07_baseline|quality_control_v1|time_series_momentum_v1|flow_confirmed_momentum_v1|runner_friendly_momentum_v1/g,
      ),
    ].map((match) => match[0]);
    expect(candidateOrder.slice(0, 5)).toEqual([
      's07_baseline',
      'quality_control_v1',
      'time_series_momentum_v1',
      'flow_confirmed_momentum_v1',
      'runner_friendly_momentum_v1',
    ]);
    expect(research?.textContent).not.toMatch(/winner|trophy|recommended|best strategy/i);
    const researchRows = research?.querySelectorAll('tr') ?? [];
    expect(researchRows.length).toBe(6);

    await app.loadDashboard();
    expect(document.querySelector('#section-research')?.querySelectorAll('tr').length).toBe(6);

    dashboardPayload = baseSnapshot({
      performance: {
        state: 'available',
        reason: null,
        data: {
          title: 'GROSS PAPER PERFORMANCE',
          notNet: true,
          notLive: true,
          emptyMessage: null,
          report: {
            dataset: { closedTradeCount: 3, status: 'has_closed_trades' },
            counts: { winCount: 2, lossCount: 1, breakevenCount: 0 },
            rates: { winRatePct: 66.67 },
            capitalReferenceTotals: {
              totalReferenceNotionalUsd: 300,
              totalGrossExitValueUsd: 309,
              totalGrossPnlUsd: 9,
            },
            aggregateGrossReturnPct: 3,
            distribution: {
              meanGrossReturnPct: 3,
              medianGrossReturnPct: 3,
              bestGrossReturnPct: 10,
              worstGrossReturnPct: -4,
            },
            profitFactor: 3.25,
            payoffRatio: 1,
            maxClosedTradeCumulativePnlDrawdownUsd: 4,
            concentration: {
              top1WinnerGrossPnlContributionPct: 50,
              top3WinnersGrossPnlContributionPct: 100,
              grossPnlExcludingTop1WinnerUsd: -1,
              grossPnlExcludingTop3WinnersUsd: 0,
            },
          },
          closedTradeCumulativeGrossPnl: [
            { exitedAt: '2026-08-17T10:01:00.000Z', cumulativeGrossPnlUsd: 10 },
            { exitedAt: '2026-08-17T10:02:00.000Z', cumulativeGrossPnlUsd: 6 },
            { exitedAt: '2026-08-17T10:03:00.000Z', cumulativeGrossPnlUsd: 9 },
          ],
        },
      },
    });
    await app.loadDashboard();
    expect(document.querySelector('#section-performance')?.querySelectorAll('canvas').length).toBe(1);

    dashboardPayload = baseSnapshot();
    await app.loadDashboard();
    expect(document.querySelector('#section-performance')?.querySelectorAll('canvas').length).toBe(0);
    expect(document.querySelector('#section-performance')?.textContent).toContain('No closed runtime paper trades yet.');

    const healthFetchesBefore = fetches.filter((url) => url === '/api/v1/database-health').length;
    await app.loadDashboard();
    expect(fetches.filter((url) => url === '/api/v1/database-health').length).toBe(healthFetchesBefore);
    await app.loadHealth();
    expect(fetches.filter((url) => url === '/api/v1/database-health').length).toBe(healthFetchesBefore + 1);

    holdNextDashboard = true;
    const stale = app.loadDashboard();
    dashboardPayload = baseSnapshot({
      meta: {
        ...(baseSnapshot().meta as object),
        generatedAt: '2026-08-17T22:09:00.000Z',
      },
    });
    const fresh = app.loadDashboard();
    await fresh;
    expect((app.getState() as { snapshot: { meta: { generatedAt: string } } | null }).snapshot?.meta.generatedAt).toBe(
      '2026-08-17T22:09:00.000Z',
    );
    deferred[0]?.resolve(
      baseSnapshot({
        meta: {
          ...(baseSnapshot().meta as object),
          generatedAt: '2026-08-17T22:00:00.000Z',
        },
      }),
    );
    await stale;
    expect((app.getState() as { snapshot: { meta: { generatedAt: string } } | null }).snapshot?.meta.generatedAt).toBe(
      '2026-08-17T22:09:00.000Z',
    );

    const errorDocument = createDashboardDocument();
    const failing = createDashboardApp({
      document: errorDocument,
      fetch: () => jsonResponse({}, false),
    });
    await failing.loadDashboard();
    expect(failing.getState().snapshot).toBeNull();
    expect(errorDocument.querySelector('#section-overview')?.textContent).toContain(
      'Could not load dashboard JSON',
    );
  });

  it('keeps a single auto-refresh timer and does not start one from manual refresh', () => {
    const document = createDashboardDocument();
    let intervalStarts = 0;
    let active = 0;
    const app = createDashboardApp({
      document,
      fetch: () => jsonResponse(baseSnapshot()),
      setIntervalFn: () => {
        intervalStarts += 1;
        active += 1;
        return intervalStarts;
      },
      clearIntervalFn: () => {
        active = Math.max(0, active - 1);
      },
    });
    app.startAutoRefresh();
    app.startAutoRefresh();
    expect(intervalStarts).toBe(2);
    expect(active).toBe(1);
    const before = intervalStarts;
    void app.loadDashboard();
    expect(intervalStarts).toBe(before);
    app.stopAutoRefresh();
    expect(active).toBe(0);
  });
});
