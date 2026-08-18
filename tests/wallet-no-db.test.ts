import { afterEach, describe, expect, it } from 'vitest';
import { createSqlitePersistenceRepository, SqlitePersistenceRepository } from '../src/persistence/index.js';
import { executeWalletSignPreflight, executeWalletSignTest, executeWalletStatus, executeWalletVerify } from '../src/wallet/index.js';
import { loadTestWalletFixture, passingExecutionRpc, walletExecutionIntent, walletJupiterBuild } from './wallet-fixtures.js';

const openRepos: SqlitePersistenceRepository[] = [];

afterEach(() => {
  while (openRepos.length > 0) {
    openRepos.pop()?.close();
  }
});

describe('wallet commands do not write the database', () => {
  it('leaves frozen table counts unchanged', async () => {
    const fixture = await loadTestWalletFixture();
    const repository = createSqlitePersistenceRepository({
      path: ':memory:',
      busyTimeoutMs: 1000,
    });
    repository.initialize();
    openRepos.push(repository);
    const before = repository.getTableCounts();

    executeWalletStatus({ TRADING_ENABLED: 'false', EXECUTION_TAKER_PUBKEY: fixture.address });
    await executeWalletVerify(
      { TRADING_ENABLED: 'false', EXECUTION_TAKER_PUBKEY: fixture.address },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    await executeWalletSignTest(
      { TRADING_ENABLED: 'false', EXECUTION_TAKER_PUBKEY: fixture.address },
      { promptSecret: () => Promise.resolve(fixture.secretBase58) },
    );
    await executeWalletSignPreflight({
      intent: walletExecutionIntent(fixture.address),
      jupiter: { build: () => Promise.resolve(walletJupiterBuild(fixture.address)) },
      rpc: passingExecutionRpc(),
      promptSecret: () => Promise.resolve(fixture.secretBase58),
    });

    expect(repository.getTableCounts()).toEqual(before);
    expect(before.schemaMigrations).toBe(8);
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
