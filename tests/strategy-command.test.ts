import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import { PersistenceError } from '../src/persistence/types.js';
import {
  createSqlitePersistenceRepository,
  SqlitePersistenceRepository,
} from '../src/persistence/index.js';
import {
  prepareStrategyCheckCommand,
  prepareStrategyHistoryCommand,
  prepareStrategyRecordCommand,
  requireStrategyMintArgument,
} from '../src/strategy/command.js';
import { evaluateLiveStrategy } from '../src/strategy/live.js';
import { StrategyError } from '../src/strategy/types.js';
import {
  FEATURE_GENERATED_AT,
  failingMarketProvider,
  fakeMarketProvider,
  liveRiskProvider,
} from './feature-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

describe('strategy commands', () => {
  it('allows strategy:check when the database is disabled and creates no SQLite file', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-strategy-check-'));
    const dbPath = join(directory, 'missing-dir', 'strategy-check.sqlite');

    try {
      const config = prepareStrategyCheckCommand({
        DATABASE_ENABLED: 'false',
        DATABASE_PATH: dbPath,
      });
      expect(config.database.enabled).toBe(false);

      const live = await evaluateLiveStrategy({
        tokenMint: WRAPPED_SOL_MINT,
        marketProvider: fakeMarketProvider(passingSnapshot()),
        riskProvider: liveRiskProvider(),
        commitment: 'confirmed',
        now: () => new Date(FEATURE_GENERATED_AT),
      });

      expect(live.evaluation.strategyVersion).toBe('s07_v1');
      expect(existsSync(dbPath)).toBe(false);
      const source = readFileSync(new URL('../src/strategy/check.ts', import.meta.url), 'utf8');
      expect(source).not.toMatch(/createSqlitePersistenceRepository|recordStrategyBundle|recordFeatureBundle/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('keeps risk rules unavailable when the live risk scan fails and no market rule failed', async () => {
    const live = await evaluateLiveStrategy({
      tokenMint: WRAPPED_SOL_MINT,
      marketProvider: fakeMarketProvider(passingSnapshot()),
      riskProvider: {
        getMintAccount: () => Promise.reject(new Error('rpc failed https://api.example.com/?api-key=supersecret')),
        getTokenSupply: () => Promise.reject(new Error('unused')),
        getLargestTokenAccounts: () => Promise.reject(new Error('unused')),
      },
      commitment: 'confirmed',
      now: () => new Date(FEATURE_GENERATED_AT),
    });

    expect(live.evaluation.decision).toBe('insufficient_data');
    expect(live.evaluation.rules.find((item) => item.ruleCode === 'NO_BLOCKING_RISK_FINDINGS')?.status).toBe(
      'unavailable',
    );
    expect(JSON.stringify(live.evaluation)).not.toContain('supersecret');
  });

  it('fails before creating an evaluation when the live market snapshot fails', async () => {
    await expect(
      evaluateLiveStrategy({
        tokenMint: WRAPPED_SOL_MINT,
        marketProvider: failingMarketProvider('market unavailable'),
        riskProvider: liveRiskProvider(),
        commitment: 'confirmed',
      }),
    ).rejects.toThrow(/market unavailable/);
  });

  it('writes nothing when strategy:record cannot obtain a market snapshot', async () => {
    const repository = createSqlitePersistenceRepository({
      path: ':memory:',
      busyTimeoutMs: 1000,
    });
    repository.initialize();
    openRepos.push(repository);

    await expect(
      evaluateLiveStrategy({
        tokenMint: WRAPPED_SOL_MINT,
        marketProvider: failingMarketProvider('market unavailable'),
        riskProvider: liveRiskProvider(),
        commitment: 'confirmed',
      }),
    ).rejects.toThrow(/market unavailable/);
    expect(repository.getStats().strategyEvaluationCount).toBe(0);
    expect(repository.getStats().featureVectorCount).toBe(0);
    expect(repository.getStats().marketSnapshotCount).toBe(0);
  });

  it('refuses strategy:record and strategy:history when the database is disabled', () => {
    expect(() => {
      prepareStrategyRecordCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(PersistenceError);
    expect(() => {
      prepareStrategyHistoryCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(/Persistence is disabled/);
  });

  it('rejects every strategy command when trading is enabled', () => {
    expect(() => {
      prepareStrategyCheckCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
    expect(() => {
      prepareStrategyRecordCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
    expect(() => {
      prepareStrategyHistoryCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
  });

  it('validates the mint argument', () => {
    expect(() => {
      requireStrategyMintArgument(['node', 'check.ts'], 'strategy:check');
    }).toThrow(StrategyError);
    expect(requireStrategyMintArgument(['node', 'check.ts', WRAPPED_SOL_MINT], 'strategy:check')).toBe(
      WRAPPED_SOL_MINT,
    );
  });

  it('does not add a strategy watcher, backtester, or auto-wire collector/risk/feature commands', () => {
    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(packageJson).toContain('strategy:check');
    expect(packageJson).toContain('strategy:record');
    expect(packageJson).toContain('strategy:history');
    expect(packageJson).not.toContain('strategy:watch');
    expect(packageJson).not.toContain('strategy:backtest');
    expect(packageJson).not.toContain('backtest');

    const collector = readFileSync(new URL('../src/collector/once.ts', import.meta.url), 'utf8');
    const collectorWatch = readFileSync(new URL('../src/collector/watch.ts', import.meta.url), 'utf8');
    const riskRecord = readFileSync(new URL('../src/risk/record.ts', import.meta.url), 'utf8');
    const featureRecord = readFileSync(new URL('../src/features/record.ts', import.meta.url), 'utf8');
    const app = readFileSync(new URL('../src/core/app.ts', import.meta.url), 'utf8');
    const loadConfig = readFileSync(new URL('../src/config/load-config.ts', import.meta.url), 'utf8');
    const safety = readFileSync(new URL('../src/core/safety.ts', import.meta.url), 'utf8');

    expect(collector).not.toMatch(/evaluateStrategy|recordStrategyBundle/);
    expect(collectorWatch).not.toMatch(/evaluateStrategy|recordStrategyBundle/);
    expect(riskRecord).not.toMatch(/evaluateStrategy|recordStrategyBundle/);
    expect(featureRecord).not.toMatch(/evaluateStrategy|recordStrategyBundle/);
    expect(app).not.toMatch(/evaluateStrategy|recordStrategyBundle/);
    expect(loadConfig).not.toMatch(/STRATEGY_VERSION|MIN_LIQUIDITY_USD|MIN_BUY_SHARE/);
    expect(safety).not.toMatch(/evaluateStrategy/);
    const history = readFileSync(new URL('../src/strategy/history.ts', import.meta.url), 'utf8');
    expect(history).not.toMatch(/evaluateStrategy|fetch\(|createReadOnlySolanaRpc|dexscreener/i);
  });

  it('has no executable wallet, signing, swap, paper-trade, or backtest capability', () => {
    const files = [
      '../src/strategy/evaluator.ts',
      '../src/strategy/live.ts',
      '../src/strategy/check.ts',
      '../src/strategy/record.ts',
      '../src/strategy/history.ts',
      '../src/core/app.ts',
      '../src/core/safety.ts',
      '../package.json',
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/createWallet|importWallet|secret key|seed phrase|mnemonic|Keypair|sendTransaction|@solana\/web3\.js|jupiter|jito|paper trade|backtest/i);
    }
  });
});
