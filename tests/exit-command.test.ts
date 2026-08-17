import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WRAPPED_SOL_MINT } from '../src/config/index.js';
import { TradingSafetyError } from '../src/core/index.js';
import { executePaperStep } from '../src/paper/execute.js';
import { executePositionStep } from '../src/position/execute.js';
import { PersistenceError } from '../src/persistence/types.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import {
  prepareExitHistoryCommand,
  prepareExitStepCommand,
  requireExitMintArgument,
} from '../src/exit/command.js';
import { executeExitStep } from '../src/exit/execute.js';
import { ExitError } from '../src/exit/types.js';
import { createDexScreenerExactPairProvider, type ExactPairMarketDataProvider } from '../src/market-data/index.js';
import { MarketDataError } from '../src/market-data/types.js';
import { FEATURE_GENERATED_AT, fakeMarketProvider, liveRiskProvider, T_10_00 } from './feature-fixtures.js';
import { passingSnapshot } from './strategy-fixtures.js';
import { EXIT_ENTRY_PRICE_USD, exitMarketSnapshot, openPositionBundle } from './exit-fixtures.js';

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

describe('exit commands', () => {
  it('rejects missing, invalid, and extra mint arguments', () => {
    expect(() => requireExitMintArgument(['node', 'step.ts'], 'exit:step')).toThrow(ExitError);
    expect(() => requireExitMintArgument(['node', 'step.ts', 'not-a-mint'], 'exit:step')).toThrow(ExitError);
    expect(() => {
      requireExitMintArgument(['node', 'step.ts', WRAPPED_SOL_MINT, 'extra'], 'exit:step');
    }).toThrow(ExitError);
  });

  it('rejects TRADING_ENABLED=true and DATABASE_ENABLED=false before any provider call', async () => {
    const createExactPairProvider = vi.fn();
    const createRepository = vi.fn();

    await expect(
      executeExitStep({ TRADING_ENABLED: 'true' }, ['node', 'step.ts', WRAPPED_SOL_MINT], {
        createExactPairProvider,
        createRepository,
      }),
    ).rejects.toThrow(TradingSafetyError);
    expect(createExactPairProvider).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();

    await expect(
      executeExitStep({ DATABASE_ENABLED: 'false' }, ['node', 'step.ts', WRAPPED_SOL_MINT], {
        createExactPairProvider,
        createRepository,
      }),
    ).rejects.toThrow(PersistenceError);
    expect(createExactPairProvider).not.toHaveBeenCalled();
    expect(createRepository).not.toHaveBeenCalled();
  });

  it('is a successful no-op with no provider or writes when no open position exists', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-noop-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');
    const createExactPairProvider = vi.fn();

    const result = await executeExitStep(
      {
        DATABASE_ENABLED: 'true',
        DATABASE_PATH: path,
        TRADING_ENABLED: 'false',
      },
      ['node', 'step.ts', WRAPPED_SOL_MINT],
      { createExactPairProvider },
    );

    expect(result.kind).toBe('no_open_position');
    expect(createExactPairProvider).not.toHaveBeenCalled();

    const repository = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    repository.initialize();
    openRepos.push(repository);
    expect(repository.getStats().marketSnapshotCount).toBe(0);
    expect(repository.getStats().exitEvaluationCount).toBe(0);
    expect(repository.getStats().paperPositionExitCount).toBe(0);
  });

  it('passes the exact opening pair to the provider and does not create risk or Solana RPC clients', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-pair-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');
    const seed = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    seed.initialize();
    seed.recordPositionBundle(openPositionBundle());
    const open = seed.getOpenPaperPosition(WRAPPED_SOL_MINT);
    if (open === null) {
      throw new Error('expected open position');
    }
    seed.close();

    const getSnapshotForPair = vi.fn((tokenMint: string, pairAddress: string) => {
      expect(tokenMint).toBe(WRAPPED_SOL_MINT);
      expect(pairAddress).toBe(open.pairAddress);
      return Promise.resolve(exitMarketSnapshot(open, { priceUsd: EXIT_ENTRY_PRICE_USD, collectedAt: T_10_00 }));
    });
    const createExactPairProvider = vi.fn(() => ({ getSnapshotForPair }));

    const result = await executeExitStep(
      {
        DATABASE_ENABLED: 'true',
        DATABASE_PATH: path,
        TRADING_ENABLED: 'false',
      },
      ['node', 'step.ts', WRAPPED_SOL_MINT],
      { createExactPairProvider },
    );

    expect(createExactPairProvider).toHaveBeenCalledTimes(1);
    expect(getSnapshotForPair).toHaveBeenCalledTimes(1);
    expect(result.kind).toBe('evaluated');
    if (result.kind === 'evaluated') {
      expect(result.exitEvaluation.exitAction).toBe('no_change');
      expect(result.exitEvaluation.pairAddress).toBe(open.pairAddress);
    }

    const execute = readFileSync(new URL('../src/exit/execute.ts', import.meta.url), 'utf8');
    expect(execute).not.toMatch(/createLiveFeatureProviders|riskProvider|SOLANA_RPC|getSlot|evaluateStrategy/);
    expect(execute).toMatch(/getSnapshotForPair/);
  });

  it('does not persist or close when the exact-pair provider fails for an open position', async () => {
    const failures: Array<{
      name: string;
      createExactPairProvider: (options: { timeoutMs: number }) => ExactPairMarketDataProvider;
    }> = [
      {
        name: 'provider throw',
        createExactPairProvider: () => ({
          getSnapshotForPair: () => Promise.reject(new MarketDataError('Opening pair is unavailable.')),
        }),
      },
      {
        name: 'absent pair',
        createExactPairProvider: () =>
          createDexScreenerExactPairProvider({
            timeoutMs: 1000,
            fetchImpl: () =>
              Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve('[]'),
              }),
          }),
      },
      {
        name: 'malformed payload',
        createExactPairProvider: () =>
          createDexScreenerExactPairProvider({
            timeoutMs: 1000,
            fetchImpl: () =>
              Promise.resolve({
                ok: true,
                status: 200,
                text: () => Promise.resolve('{"not":"an-array"}'),
              }),
          }),
      },
    ];

    for (const failure of failures) {
      const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-fail-'));
      tempDirs.push(directory);
      const path = join(directory, 'history.sqlite');
      const seed = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      seed.initialize();
      seed.recordPositionBundle(openPositionBundle());
      const before = seed.getTableCounts();
      const openId = seed.getOpenPaperPosition(WRAPPED_SOL_MINT)?.id;
      seed.close();

      await expect(
        executeExitStep(
          {
            DATABASE_ENABLED: 'true',
            DATABASE_PATH: path,
            TRADING_ENABLED: 'false',
          },
          ['node', 'step.ts', WRAPPED_SOL_MINT],
          { createExactPairProvider: failure.createExactPairProvider },
        ),
      ).rejects.toThrow();

      const after = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
      after.initialize();
      openRepos.push(after);
      expect(after.getTableCounts(), failure.name).toEqual(before);
      expect(after.getOpenPaperPosition(WRAPPED_SOL_MINT)?.id, failure.name).toBe(openId);
      expect(after.getStats().exitEvaluationCount, failure.name).toBe(0);
      expect(after.getStats().paperPositionExitCount, failure.name).toBe(0);
    }
  });

  it('does not let paper:step or position:step create exit rows', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'mtb-exit-freeze-'));
    tempDirs.push(directory);
    const path = join(directory, 'history.sqlite');
    const env = {
      DATABASE_ENABLED: 'true',
      DATABASE_PATH: path,
      TRADING_ENABLED: 'false',
    };
    const dependencies = {
      createProviders: () => ({
        marketProvider: fakeMarketProvider(passingSnapshot()),
        riskProvider: liveRiskProvider(),
      }),
      collectInputs: ({
        tokenMint,
        marketProvider,
        riskProvider,
        commitment,
      }: {
        tokenMint: string;
        marketProvider: ReturnType<typeof fakeMarketProvider>;
        riskProvider: ReturnType<typeof liveRiskProvider>;
        commitment: 'confirmed' | 'finalized';
      }) =>
        import('../src/features/live.js').then(({ collectLiveFeatureInputs }) =>
          collectLiveFeatureInputs({
            tokenMint,
            marketProvider,
            riskProvider,
            commitment,
            now: () => new Date(FEATURE_GENERATED_AT),
          }),
        ),
    };

    await executePaperStep(env, ['node', 'step.ts', WRAPPED_SOL_MINT], dependencies);
    const afterPaper = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    afterPaper.initialize();
    expect(afterPaper.getStats().exitEvaluationCount).toBe(0);
    expect(afterPaper.getStats().paperPositionCount).toBe(0);
    afterPaper.close();

    await executePositionStep(env, ['node', 'step.ts', WRAPPED_SOL_MINT], dependencies);
    const afterPosition = createSqlitePersistenceRepository({ path, busyTimeoutMs: 1000 });
    afterPosition.initialize();
    openRepos.push(afterPosition);
    expect(afterPosition.getStats().positionEvaluationCount).toBe(1);
    expect(afterPosition.getStats().exitEvaluationCount).toBe(0);
    expect(afterPosition.getStats().paperPositionExitCount).toBe(0);

    const paperExecute = readFileSync(new URL('../src/paper/execute.ts', import.meta.url), 'utf8');
    const positionExecute = readFileSync(new URL('../src/position/execute.ts', import.meta.url), 'utf8');
    expect(paperExecute).not.toMatch(/recordExitBundle|evaluateExitAction|paper_position_exits/);
    expect(positionExecute).not.toMatch(/recordExitBundle|evaluateExitAction|paper_position_exits/);
  });

  it('keeps history as a database-only command and does not add watch/pnl scripts', () => {
    expect(() => prepareExitHistoryCommand({ DATABASE_ENABLED: 'false' })).toThrow(PersistenceError);
    expect(() => prepareExitStepCommand({ TRADING_ENABLED: 'true' })).toThrow(TradingSafetyError);

    const history = readFileSync(new URL('../src/exit/history.ts', import.meta.url), 'utf8');
    const step = readFileSync(new URL('../src/exit/step.ts', import.meta.url), 'utf8');
    const execute = readFileSync(new URL('../src/exit/execute.ts', import.meta.url), 'utf8');
    expect(history).not.toMatch(/fetch\(|getSnapshotForPair|evaluateExitAction/);
    expect(execute).toMatch(/evaluateExitAction/);
    expect(execute).toMatch(/recordExitBundle/);
    expect(step).not.toMatch(/exit:watch/);

    const packageJson = readFileSync(new URL('../package.json', import.meta.url), 'utf8');
    expect(packageJson).toMatch(/"exit:step"/);
    expect(packageJson).toMatch(/"exit:history"/);
    expect(packageJson).not.toMatch(/exit:watch|exit:sell|exit:close-manual|exit:pnl|exit:optimize/);

    const startup = [
      '../src/index.ts',
      '../src/core/app.ts',
      '../src/collector/once.ts',
      '../src/collector/watch.ts',
    ];
    for (const file of startup) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/executeExitStep|recordExitBundle|exit:step/);
    }
  });
});
