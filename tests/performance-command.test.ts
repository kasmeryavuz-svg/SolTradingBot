import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TradingSafetyError } from '../src/core/index.js';
import {
  assertNoExtraPerformanceArguments,
  executePerformanceReport,
  executePerformanceTrades,
  preparePerformanceCommand,
} from '../src/performance/index.js';
import { PerformanceError } from '../src/performance/types.js';
import { PersistenceError } from '../src/persistence/types.js';
import {
  createSqlitePersistenceRepository,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import {
  BONK_MINT,
  seedClosedPaperTrade,
  T_10_00,
  USDC_MINT,
  WRAPPED_SOL_MINT,
  addMs,
} from './performance-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];
const tempDirs: string[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

function tempDbPath(): string {
  const directory = mkdtempSync(join(tmpdir(), 'mtb-perf-cmd-'));
  tempDirs.push(directory);
  return join(directory, 'history.sqlite');
}

describe('performance commands', () => {
  it('rejects extra arguments, TRADING_ENABLED=true, and DATABASE_ENABLED=false', () => {
    expect(() => {
      assertNoExtraPerformanceArguments(['node', 'run-report.ts', 'extra'], 'performance:report');
    }).toThrow(PerformanceError);
    expect(() => preparePerformanceCommand({ TRADING_ENABLED: 'true' })).toThrow(
      TradingSafetyError,
    );
    expect(() => preparePerformanceCommand({ DATABASE_ENABLED: 'false' })).toThrow(
      PersistenceError,
    );
  });

  it('keeps Checkpoint 12 production language descriptive', () => {
    const files = [
      '../src/performance/format.ts',
      '../src/performance/command.ts',
      '../src/performance/report.ts',
      '../src/performance/run-report.ts',
      '../src/performance/run-trades.ts',
    ];
    const combined = files
      .map((file) => readFileSync(new URL(file, import.meta.url), 'utf8'))
      .join('\n');
    expect(combined).toContain('Gross paper results are not evidence of live profitability.');
    expect(combined).not.toMatch(
      /Strategy is profitable|Strategy has an edge|Expected profit is|Safe to go live/,
    );
    expect(combined).not.toMatch(/winning strategy|make money|earn money|expected return/);
  });

  it('does not construct market, risk, or Solana providers and does not run upstream engines', () => {
    const command = readFileSync(new URL('../src/performance/command.ts', import.meta.url), 'utf8');
    const sqlite = readFileSync(
      new URL('../src/performance/sqlite-source.ts', import.meta.url),
      'utf8',
    );
    const report = readFileSync(new URL('../src/performance/report.ts', import.meta.url), 'utf8');
    const runReport = readFileSync(
      new URL('../src/performance/run-report.ts', import.meta.url),
      'utf8',
    );
    const runTrades = readFileSync(
      new URL('../src/performance/run-trades.ts', import.meta.url),
      'utf8',
    );
    const combined = [command, sqlite, report, runReport, runTrades].join('\n');

    expect(combined).not.toMatch(
      /createLiveFeatureProviders|createDexScreener|createReadOnlySolanaRpc|fetch\(/,
    );
    expect(combined).not.toMatch(
      /evaluateStrategy|evaluatePaperAction|evaluatePositionAction|evaluateExitAction/,
    );
    expect(combined).not.toMatch(
      /generateFeatureVector|recordExitBundle|recordPositionBundle|getSnapshotForPair/,
    );
    expect(combined).not.toMatch(/performance:watch/);
  });

  it('leaves paper, position, and exit commands free of performance aggregation', () => {
    const paper = readFileSync(new URL('../src/paper/execute.ts', import.meta.url), 'utf8');
    const position = readFileSync(new URL('../src/position/execute.ts', import.meta.url), 'utf8');
    const exit = readFileSync(new URL('../src/exit/execute.ts', import.meta.url), 'utf8');
    expect(paper).not.toMatch(/buildPerformanceReport|grossPnlUsd|performance\/report/);
    expect(position).not.toMatch(/buildPerformanceReport|grossPnlUsd|evaluateExitAction/);
    expect(exit).not.toMatch(/buildPerformanceReport|grossPnlUsd|aggregateGrossReturnPct/);
  });

  it('analyzes every eligible closed trade even when PERFORMANCE_TRADE_LIMIT is 1', () => {
    const path = tempDbPath();
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    seedClosedPaperTrade(repository, {
      tokenMint: WRAPPED_SOL_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 60_000),
      entryPriceUsd: 100,
      exitPriceUsd: 120,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: USDC_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 120_000),
      entryPriceUsd: 100,
      exitPriceUsd: 90,
    });
    seedClosedPaperTrade(repository, {
      tokenMint: BONK_MINT,
      openedAt: T_10_00,
      exitedAt: addMs(T_10_00, 180_000),
      entryPriceUsd: 50,
      exitPriceUsd: 100,
    });
    const before = repository.getTableCounts();
    repository.close();
    openRepos.pop();

    const config = preparePerformanceCommand({
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      PERFORMANCE_TRADE_LIMIT: '1',
    });
    expect(config.performance.tradeLimit).toBe(1);
    const report = executePerformanceReport(config);
    const trades = executePerformanceTrades(config);
    expect(report.dataset.closedTradeCount).toBe(3);
    expect(trades.dataset.closedTradeCount).toBe(3);
    expect(report.dataset.closedTradeCount).toBe(trades.dataset.closedTradeCount);

    const after = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    after.initialize();
    openRepos.push(after);
    expect(after.getTableCounts()).toEqual(before);
  });
});
