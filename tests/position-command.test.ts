import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import { executePaperStep } from '../src/paper/execute.js';
import { PersistenceError } from '../src/persistence/types.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import {
  preparePositionHistoryCommand,
  preparePositionStatusCommand,
  preparePositionStepCommand,
  requirePositionMintArgument,
} from '../src/position/command.js';
import { executePositionStep } from '../src/position/execute.js';
import { PositionError } from '../src/position/types.js';
import { FEATURE_GENERATED_AT, fakeMarketProvider, liveRiskProvider } from './feature-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';

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

describe('position commands', () => {
  it('rejects missing, invalid, and extra mint arguments', () => {
    expect(() => requirePositionMintArgument(['node', 'step.ts'], 'position:step')).toThrow(PositionError);
    expect(() => requirePositionMintArgument(['node', 'step.ts', 'not-a-mint'], 'position:step')).toThrow(
      PositionError,
    );
    expect(() => {
      requirePositionMintArgument(['node', 'step.ts', WRAPPED_SOL_MINT, 'extra'], 'position:step');
    }).toThrow(PositionError);
  });

  it('rejects TRADING_ENABLED=true and DATABASE_ENABLED=false before any provider call', async () => {
    const createProviders = vi.fn();
    const collectInputs = vi.fn();
    const createRepository = vi.fn();

    await expect(
      executePositionStep({ TRADING_ENABLED: 'true' }, ['node', 'step.ts', WRAPPED_SOL_MINT], {
        createProviders,
        collectInputs,
        createRepository,
      }),
    ).rejects.toThrow(TradingSafetyError);
    expect(createProviders).not.toHaveBeenCalled();
    expect(collectInputs).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();

    await expect(
      executePositionStep({ DATABASE_ENABLED: 'false' }, ['node', 'step.ts', WRAPPED_SOL_MINT], {
        createProviders,
        collectInputs,
        createRepository,
      }),
    ).rejects.toThrow(PersistenceError);
    expect(createProviders).not.toHaveBeenCalled();
    expect(collectInputs).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('runs the existing live providers and persists pm10 after guards pass', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-position-step-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');
    const createProviders = vi.fn(() => ({
      marketProvider: fakeMarketProvider(passingSnapshot()),
      riskProvider: liveRiskProvider(),
    }));

    const result = await executePositionStep(
      {
        DATABASE_ENABLED: 'true',
        DATABASE_PATH: path,
        TRADING_ENABLED: 'false',
      },
      ['node', 'step.ts', WRAPPED_SOL_MINT],
      {
        createProviders,
        collectInputs: ({ tokenMint, marketProvider, riskProvider, commitment }) =>
          import('../src/features/live.js').then(({ collectLiveFeatureInputs }) =>
            collectLiveFeatureInputs({
              tokenMint,
              marketProvider,
              riskProvider,
              commitment,
              now: () => new Date(FEATURE_GENERATED_AT),
            }),
          ),
      },
    );

    expect(createProviders).toHaveBeenCalledTimes(1);
    expect(result.positionEvaluation.positionSpecVersion).toBe('pm10_v1');
    expect(result.recorded.positionEvaluationId).toBeGreaterThan(0);
    expect(['open_position', 'no_change']).toContain(result.positionEvaluation.positionAction);

    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    expect(repository.getStats().positionEvaluationCount).toBe(1);
    expect(repository.getStats().paperEvaluationCount).toBe(1);
  });

  it('does not let paper:step create position rows', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-paper-freeze-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');

    await executePaperStep(
      {
        DATABASE_ENABLED: 'true',
        DATABASE_PATH: path,
        TRADING_ENABLED: 'false',
      },
      ['node', 'step.ts', WRAPPED_SOL_MINT],
      {
        createProviders: () => ({
          marketProvider: fakeMarketProvider(passingSnapshot()),
          riskProvider: liveRiskProvider(),
        }),
        collectInputs: ({ tokenMint, marketProvider, riskProvider, commitment }) =>
          import('../src/features/live.js').then(({ collectLiveFeatureInputs }) =>
            collectLiveFeatureInputs({
              tokenMint,
              marketProvider,
              riskProvider,
              commitment,
              now: () => new Date(FEATURE_GENERATED_AT),
            }),
          ),
      },
    );

    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    expect(repository.getStats().paperEvaluationCount).toBe(1);
    expect(repository.getStats().positionEvaluationCount).toBe(0);
    expect(repository.getStats().paperPositionCount).toBe(0);
    expect(repository.getStats().openPaperPositionCount).toBe(0);

    const paperExecute = readFileSync(new URL('../src/paper/execute.ts', import.meta.url), 'utf8');
    expect(paperExecute).not.toMatch(/recordPositionBundle|evaluatePositionAction|paper_positions/);
  });

  it('keeps status and history as database-only commands', () => {
    expect(() => preparePositionStatusCommand({ DATABASE_ENABLED: 'false' })).toThrow(PersistenceError);
    expect(() => preparePositionHistoryCommand({ DATABASE_ENABLED: 'false' })).toThrow(PersistenceError);
    expect(() => preparePositionStepCommand({ TRADING_ENABLED: 'true' })).toThrow(TradingSafetyError);

    const status = readFileSync(new URL('../src/position/status.ts', import.meta.url), 'utf8');
    const history = readFileSync(new URL('../src/position/history.ts', import.meta.url), 'utf8');
    const execute = readFileSync(new URL('../src/position/execute.ts', import.meta.url), 'utf8');
    const step = readFileSync(new URL('../src/position/step.ts', import.meta.url), 'utf8');
    expect(status).not.toMatch(/fetch\(|createLiveFeatureProviders|evaluateStrategy|evaluatePaperAction|evaluatePositionAction/);
    expect(history).not.toMatch(/fetch\(|createLiveFeatureProviders|evaluateStrategy|evaluatePaperAction|evaluatePositionAction/);
    expect(execute).toMatch(/generateFeatureVector/);
    expect(execute).toMatch(/evaluateStrategy/);
    expect(execute).toMatch(/evaluatePaperAction/);
    expect(execute).toMatch(/evaluatePositionAction/);
    expect(execute).toMatch(/recordPositionBundle/);
    expect(step).not.toMatch(/position:watch/);
  });

  it('does not add watch/close/sell/pnl scripts or blockchain execution', () => {
    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(packageJson).toMatch(/"position:step"/);
    expect(packageJson).toMatch(/"position:status"/);
    expect(packageJson).toMatch(/"position:history"/);
    expect(packageJson).not.toMatch(/position:watch|position:open|position:close|position:sell|position:pnl|position:rebalance/);

    const files = [
      '../src/position/evaluator.ts',
      '../src/position/execute.ts',
      '../src/position/step.ts',
      '../src/core/safety.ts',
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(
        /createWallet|secret key|seed phrase|mnemonic|Keypair|sendTransaction|jupiter|jito|swap execution|closedAt|stopLoss|takeProfit|unrealizedPnl|realizedPnl/i,
      );
    }
  });
});
