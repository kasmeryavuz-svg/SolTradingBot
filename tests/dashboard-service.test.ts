import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { DashboardService } from '../src/dashboard/index.js';
import { allEntrySnapshot } from './research-fixtures.js';
import { passingRisk } from './strategy-fixtures.js';
import {
  cleanupDashboardHarness,
  dashboardTempDbPath,
  FIXED_CLOCK,
  openDashboardWriteRepo,
} from './dashboard-harness.js';

afterEach(async () => {
  await cleanupDashboardHarness();
  vi.restoreAllMocks();
});

describe('dashboard service snapshot', () => {
  it('uses the injected clock and degrades when the database file is missing', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const path = dashboardTempDbPath();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    expect(snapshot.meta.generatedAt).toBe('2026-08-17T22:00:00.000Z');
    expect(snapshot.meta.checkpoint).toBe('13');
    expect(snapshot.safety.tradingCapability).toBe('DISABLED');
    expect(snapshot.database.state).toBe('unavailable');
    expect(snapshot.performance.state).toBe('unavailable');
    expect(snapshot.research.state).toBe('unavailable');
    expect(snapshot.configuration.solanaNetwork).toBe('mainnet-beta');
    expect(JSON.stringify(snapshot)).not.toContain('SOLANA_RPC_URL');
    expect(JSON.stringify(snapshot)).not.toMatch(/https:\/\/api\.mainnet-beta\.solana\.com/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('renders empty compatible databases without fake 0% performance', () => {
    const path = dashboardTempDbPath();
    openDashboardWriteRepo(path).close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    expect(snapshot.database.state).toBe('available');
    expect(snapshot.database.data?.schemaVersion).toBe(7);
    expect(snapshot.market.state).toBe('empty');
    expect(snapshot.runtimePaper.state).toBe('empty');
    expect(snapshot.performance.state).toBe('empty');
    expect(snapshot.performance.data?.emptyMessage).toBe('No closed runtime paper trades yet.');
    expect(snapshot.performance.data?.report.rates.winRatePct).toBeNull();
    expect(snapshot.performance.data?.report.aggregateGrossReturnPct).toBeNull();
    expect(snapshot.research.state).toBe('available');
    expect(snapshot.research.data?.candidates).toHaveLength(5);
    expect(snapshot.research.data?.candidates.map((row) => row.candidateId)).toEqual([
      's07_baseline',
      'quality_control_v1',
      'time_series_momentum_v1',
      'flow_confirmed_momentum_v1',
      'runner_friendly_momentum_v1',
    ]);
    expect(JSON.stringify(snapshot)).not.toMatch(/"undefined"/);
    expect(JSON.stringify(snapshot)).not.toMatch(/\bNaN\b|\bInfinity\b/);
  });

  it('orders recent markets by collectedAt desc then mint then pair and keeps XSS text as data', () => {
    const path = dashboardTempDbPath();
    const repository = openDashboardWriteRepo(path);
    repository.recordMarketSnapshots([
      allEntrySnapshot({
        tokenMint: 'So11111111111111111111111111111111111111113',
        pairAddress: 'PairB111111111111111111111111111111111111111',
        collectedAt: '2026-08-17T10:00:00.000Z',
        tokenSymbol: '<script>alert(1)</script>',
        tokenName: '<img src=x onerror=alert(1)>',
      }),
      allEntrySnapshot({
        tokenMint: WRAPPED_SOL_MINT,
        pairAddress: 'PairA111111111111111111111111111111111111111',
        collectedAt: '2026-08-17T10:00:00.000Z',
        tokenSymbol: 'SOL',
      }),
      allEntrySnapshot({
        tokenMint: WRAPPED_SOL_MINT,
        pairAddress: 'PairC111111111111111111111111111111111111111',
        collectedAt: '2026-08-17T11:00:00.000Z',
        tokenSymbol: 'NEWER',
      }),
    ]);
    repository.recordRiskReport(passingRisk({ scannedAt: '2026-08-17T09:00:00.000Z' }));
    repository.close();
    const config = loadConfig({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    });
    const snapshot = new DashboardService(config, FIXED_CLOCK).buildSnapshot();
    const rows = snapshot.market.data?.rows ?? [];
    expect(rows[0]?.tokenSymbol).toBe('NEWER');
    expect(rows[1]?.tokenMint).toBe(WRAPPED_SOL_MINT);
    expect(rows[2]?.tokenSymbol).toBe('<script>alert(1)</script>');
    expect(rows[2]?.tokenName).toBe('<img src=x onerror=alert(1)>');
    expect(snapshot.database.data?.latestMarketCollectedAt).toBe('2026-08-17T11:00:00.000Z');
    expect(snapshot.database.data?.latestRiskScannedAt).toBe('2026-08-17T09:00:00.000Z');
  });
});
