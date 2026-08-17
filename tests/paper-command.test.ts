import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import {
  preparePaperHistoryCommand,
  preparePaperStepCommand,
  requirePaperMintArgument,
} from '../src/paper/command.js';
import { executePaperStep, type PaperStepDependencies } from '../src/paper/execute.js';
import { PaperError } from '../src/paper/types.js';
import { PersistenceError } from '../src/persistence/types.js';

describe('paper commands', () => {
  it('requires a mint and rejects extra arguments', () => {
    expect(() => {
      requirePaperMintArgument(['node', 'step.ts'], 'paper:step');
    }).toThrow(PaperError);
    expect(() => {
      requirePaperMintArgument(['node', 'step.ts', 'not-a-mint'], 'paper:step');
    }).toThrow(/Invalid token mint/);
    expect(() => {
      requirePaperMintArgument(['node', 'step.ts', WRAPPED_SOL_MINT, 'extra'], 'paper:step');
    }).toThrow(/Unexpected extra arguments/);
    expect(requirePaperMintArgument(['node', 'step.ts', WRAPPED_SOL_MINT], 'paper:step')).toBe(WRAPPED_SOL_MINT);
  });

  it('refuses paper:step and paper:history when the database is disabled or trading is enabled', () => {
    expect(() => {
      preparePaperStepCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(PersistenceError);
    expect(() => {
      preparePaperHistoryCommand({ DATABASE_ENABLED: 'false' });
    }).toThrow(/Persistence is disabled/);
    expect(() => {
      preparePaperStepCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
    expect(() => {
      preparePaperHistoryCommand({ TRADING_ENABLED: 'true' });
    }).toThrow(TradingSafetyError);
  });

  it('does not initialize providers or open a database when paper:step guards fail', async () => {
    const argv = ['node', 'step.ts', WRAPPED_SOL_MINT];
    let providerCalls = 0;
    let collectCalls = 0;
    let repositoryCalls = 0;
    const dependencies: PaperStepDependencies = {
      createProviders: () => {
        providerCalls += 1;
        throw new Error('providers must not be created before safety guards pass');
      },
      collectInputs: () => {
        collectCalls += 1;
        return Promise.reject(new Error('live collection must not run before safety guards pass'));
      },
      createRepository: () => {
        repositoryCalls += 1;
        throw new Error('database must not be opened before safety guards pass');
      },
    };

    await expect(executePaperStep({ TRADING_ENABLED: 'true' }, argv, dependencies)).rejects.toThrow(
      TradingSafetyError,
    );
    await expect(executePaperStep({ DATABASE_ENABLED: 'false' }, argv, dependencies)).rejects.toThrow(
      PersistenceError,
    );
    expect(providerCalls).toBe(0);
    expect(collectCalls).toBe(0);
    expect(repositoryCalls).toBe(0);

    const execute = readFileSync(new URL('../src/paper/execute.ts', import.meta.url), 'utf8');
    const guardIndex = execute.indexOf('preparePaperStepCommand');
    const providerIndex = execute.indexOf('createProviders(');
    const collectIndex = execute.indexOf('collectInputs(');
    expect(guardIndex).toBeGreaterThan(-1);
    expect(providerIndex).toBeGreaterThan(guardIndex);
    expect(collectIndex).toBeGreaterThan(providerIndex);
  });

  it('keeps paper:step as an explicit live command and paper:history as database-only', () => {
    const step = readFileSync(new URL('../src/paper/step.ts', import.meta.url), 'utf8');
    const execute = readFileSync(new URL('../src/paper/execute.ts', import.meta.url), 'utf8');
    const history = readFileSync(new URL('../src/paper/history.ts', import.meta.url), 'utf8');
    const evaluator = readFileSync(new URL('../src/paper/evaluator.ts', import.meta.url), 'utf8');

    expect(step).toMatch(/executePaperStep/);
    expect(execute).toMatch(/createLiveFeatureProviders/);
    expect(execute).toMatch(/collectLiveFeatureInputs/);
    expect(execute).toMatch(/getPreviousMarketSnapshot/);
    expect(execute).toMatch(/generateFeatureVector/);
    expect(execute).toMatch(/evaluateStrategy/);
    expect(execute).toMatch(/evaluatePaperAction/);
    expect(execute).toMatch(/recordPaperBundle/);
    expect(execute).not.toMatch(/paper:watch|Date\.now\(\)|sendTransaction/);
    expect(step).not.toMatch(/paper:watch|sendTransaction/);

    expect(history).toMatch(/getPaperHistory/);
    expect(history).not.toMatch(/evaluatePaperAction|evaluateStrategy|generateFeatureVector|fetch\(|dexscreener|createReadOnlySolanaRpc|createLiveFeatureProviders/i);

    expect(evaluator).not.toMatch(/node:sqlite|fetch\(|Date\.now|createLiveFeatureProviders/);
  });

  it('does not add a paper watcher or auto-wire other commands', () => {
    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(packageJson).toContain('paper:step');
    expect(packageJson).toContain('paper:history');
    expect(packageJson).not.toContain('paper:watch');
    expect(packageJson).not.toContain('paper:check');
    expect(packageJson).not.toContain('paper:buy');
    expect(packageJson).not.toContain('paper:sell');
    expect(packageJson).not.toContain('paper:close');
    expect(packageJson).not.toContain('paper:pnl');
    expect(packageJson).not.toContain('paper:optimize');

    const files = [
      '../src/index.ts',
      '../src/core/app.ts',
      '../src/collector/once.ts',
      '../src/collector/watch.ts',
      '../src/risk/record.ts',
      '../src/features/record.ts',
      '../src/strategy/record.ts',
      '../src/backtest/run.ts',
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/evaluatePaperAction|recordPaperBundle|paper:step/);
    }
  });

  it('has no wallet, signer, swap, quantity, or position-management capability in the paper subsystem', () => {
    const files = [
      '../src/paper/evaluator.ts',
      '../src/paper/execute.ts',
      '../src/paper/step.ts',
      '../src/paper/history.ts',
      '../src/paper/command.ts',
      '../src/paper/types.ts',
      '../src/core/safety.ts',
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/createWallet|importWallet|secret key|seed phrase|mnemonic|Keypair|sendTransaction|@solana\/web3\.js|jupiter|jito/i);
      expect(source).not.toMatch(/stop loss|take profit|trailing stop|realized pnl|unrealized pnl|equity curve/i);
    }
    const safety = readFileSync(new URL('../src/core/safety.ts', import.meta.url), 'utf8');
    expect(safety).toContain('Checkpoint 00');
    expect(safety).toContain('assertTradingDisabled');
  });

  it('does not retune s07_v1 because a live sample may have zero ENTRY_CANDIDATE rows', () => {
    const evaluator = readFileSync(new URL('../src/paper/evaluator.ts', import.meta.url), 'utf8');
    const strategyConstants = readFileSync(new URL('../src/strategy/constants.ts', import.meta.url), 'utf8');
    expect(evaluator).not.toMatch(/MIN_LIQUIDITY_USD|MIN_TRADES_5M|MIN_BUY_SHARE/);
    expect(strategyConstants).toContain('MIN_LIQUIDITY_USD = 50_000');
  });
});
