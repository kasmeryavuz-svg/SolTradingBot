import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  executeHistoricalBacktest,
  formatBacktestLines,
  parseBacktestArgv,
  prepareBacktestCommand,
} from '../src/backtest/index.js';
import { BacktestError } from '../src/backtest/types.js';
import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { candidateRisk, candidateSnapshot, outcomeOnlySnapshot, runStudy } from './backtest-fixtures.js';

const tempDirs: string[] = [];
const openRepos: SqlitePersistenceRepository[] = [];

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

describe('backtest command', () => {
  it('parses all-token and one-token scopes and rejects invalid input', () => {
    expect(parseBacktestArgv(['node', 'run.ts'])).toEqual({ kind: 'all' });
    expect(parseBacktestArgv(['node', 'run.ts', USDC_MINT])).toEqual({ kind: 'token', tokenMint: USDC_MINT });
    expect(() => parseBacktestArgv(['node', 'run.ts', 'not-a-mint'])).toThrow(BacktestError);
    expect(() => parseBacktestArgv(['node', 'run.ts', USDC_MINT, 'extra'])).toThrow(/Unexpected extra arguments/);
  });

  it('requires an enabled database, rejects trading, and does not need network providers', () => {
    expect(() => prepareBacktestCommand({ TRADING_ENABLED: 'true' })).toThrow(TradingSafetyError);
    const runSource = readFileSync(new URL('../src/backtest/run.ts', import.meta.url), 'utf8');
    const commandSource = readFileSync(new URL('../src/backtest/command.ts', import.meta.url), 'utf8');
    const engineSource = readFileSync(new URL('../src/backtest/engine.ts', import.meta.url), 'utf8');
    for (const source of [runSource, commandSource, engineSource]) {
      expect(source).not.toMatch(/dexscreener|createReadOnlySolanaRpc|createLiveFeatureProviders|evaluateLiveStrategy|fetch\(/i);
    }
  });

  it('runs token and all scopes against a local file without writing', () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-backtest-cmd-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');
    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    repository.recordMarketSnapshots([candidateSnapshot(), outcomeOnlySnapshot({ priceUsd: 110 })]);
    repository.recordRiskReport(candidateRisk());
    const before = repository.getTableCounts();
    repository.close();

    const config = prepareBacktestCommand({ DATABASE_ENABLED: 'true', DATABASE_PATH: path });
    const tokenResult = executeHistoricalBacktest(config, ['node', 'run.ts', WRAPPED_SOL_MINT]);
    const allResult = executeHistoricalBacktest(config, ['node', 'run.ts']);
    expect(tokenResult.scope.kind).toBe('token');
    expect(allResult.scope.kind).toBe('all');
    expect(allResult.events.length).toBe(tokenResult.events.length);

    const after = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    after.initialize();
    openRepos.push(after);
    expect(after.getTableCounts()).toEqual(before);
  });
});

describe('backtest formatter', () => {
  it('describes a historical event study with gross-return limits and no trade language', () => {
    const result = runStudy({
      marketSnapshots: [candidateSnapshot({ priceUsd: 100 }), outcomeOnlySnapshot({ priceUsd: 110 })],
      riskReports: [candidateRisk()],
    });
    const allLines = formatBacktestLines(result).join('\n');
    expect(allLines).toContain('b08_v1');
    expect(allLines).toContain('s07_v1');
    expect(allLines).toContain('c06_v1');
    expect(allLines).toContain('historical event study');
    expect(allLines).toContain('Returns exclude fees, slippage and execution.');
    expect(allLines).toContain('grossForwardReturnPct is not net trading profit');
    expect(allLines).toContain('ENTRY_CANDIDATE');
    expect(allLines).toContain('Gross forward price return:');
    expect(allLines).not.toMatch(/\bBUY\b|\bSELL\b|trade won|trade lost|profit from trade|realized PnL/i);

    const tokenResult = runStudy(
      { marketSnapshots: [candidateSnapshot({ liquidityUsd: 1_000 })], riskReports: [candidateRisk()] },
      { kind: 'token', tokenMint: WRAPPED_SOL_MINT },
    );
    const tokenLines = formatBacktestLines(tokenResult).join('\n');
    expect(tokenLines).toContain('NO_ENTRY');
    expect(tokenLines).toContain('Chronological classifications');
  });
});

describe('capability boundaries', () => {
  it('keeps wallet, execution, paper trading, and advanced analytics out of the backtest domain', () => {
    const files = readdirSync(new URL('../src/backtest/', import.meta.url)).filter((name) => name.endsWith('.ts'));
    const combined = files
      .map((name) => readFileSync(new URL(`../src/backtest/${name}`, import.meta.url), 'utf8'))
      .join('\n');
    expect(combined).not.toMatch(
      /wallet|private key|secret key|seed phrase|mnemonic|keypair|signer|sendTransaction|jupiter|jito|\bswap\b|stop loss|take profit|paper trading|profit factor|sharpe|sortino|drawdown|equity curve|position sizing|exit engine/i,
    );
    expect(combined).not.toMatch(/\bpnl\b|\brealizedPnl\b|\bunrealizedPnl\b/i);
    expect(combined).not.toMatch(/Date\.now\s*\(/);

    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(packageJson).toContain('backtest:run');
    expect(packageJson).not.toContain('backtest:record');
    expect(packageJson).not.toContain('backtest:history');
    expect(packageJson).not.toContain('backtest:optimize');
    expect(packageJson).not.toContain('backtest:tune');
    expect(packageJson).not.toContain('backtest:watch');

    const app = readFileSync(new URL('../src/core/app.ts', import.meta.url), 'utf8');
    expect(app).not.toMatch(/backtest/i);
  });
});
