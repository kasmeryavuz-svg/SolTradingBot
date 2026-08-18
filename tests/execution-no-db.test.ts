import { afterEach, describe, expect, it } from 'vitest';
import {
  executeExecutionBuild,
  executeExecutionSimulate,
  executeExecutionStatus,
} from '../src/execution/index.js';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { executionIntent, validJupiterBuild } from './execution-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

describe('execution does not write the database', () => {
  it('leaves frozen table counts unchanged across status, build, and simulate', async () => {
    const repository = createSqlitePersistenceRepository({
      path: ':memory:',
      busyTimeoutMs: 1000,
    });
    repository.initialize();
    openRepos.push(repository);
    const before = repository.getTableCounts();

    executeExecutionStatus({ TRADING_ENABLED: 'false' });
    await executeExecutionBuild({
      intent: executionIntent(),
      jupiter: { build: () => Promise.resolve(validJupiterBuild()) },
    });
    await executeExecutionSimulate({
      intent: executionIntent(),
      jupiter: { build: () => Promise.resolve(validJupiterBuild()) },
      rpc: {
        getGenesisHash: () => Promise.resolve('5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'),
        getBlockHeight: () => Promise.resolve(900n),
        simulateTransaction: () =>
          Promise.resolve({
            ok: true,
            unitsConsumed: 100_000n,
            errorSummary: null,
            logs: [],
            failureKind: 'none' as const,
          }),
        getFeeForMessage: () => Promise.resolve(5000n),
      },
    });

    expect(repository.getTableCounts()).toEqual(before);
    expect(before.schemaMigrations).toBe(9);
    expect(before.tokens).toBe(0);
    expect(before.marketSnapshots).toBe(0);
    expect(before.riskScans).toBe(0);
    expect(before.featureVectors).toBe(0);
    expect(before.strategyEvaluations).toBe(0);
    expect(before.paperEvaluations).toBe(0);
    expect(before.positionEvaluations).toBe(0);
    expect(before.paperPositions).toBe(0);
    expect(before.openPaperPositions).toBe(0);
    expect(before.exitEvaluations).toBe(0);
    expect(before.paperPositionExits).toBe(0);
  });
});
