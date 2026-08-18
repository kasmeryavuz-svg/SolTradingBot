import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import { SPL_TOKEN_PROGRAM_ID } from '../src/wallet-intelligence/constants.js';
import { runWalletIntelligenceHolders, runWalletIntelligenceScan } from '../src/wallet-intelligence/engine.js';
import {
  loadLatestWalletIntelligenceScan,
  persistWalletIntelligenceScan,
} from '../src/wallet-intelligence/persistence.js';
import {
  TOKEN_ACCOUNTS,
  WI_MINT,
  WI_SCAN_MS,
  fakeWalletIntelligenceProvider,
  historyTx,
  largestAccount,
  ownerAccountValue,
  tokenAccountValue,
  tokenBalance,
  type FakeWalletIntelligenceStats,
} from './wallet-intelligence-fixtures.js';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory !== undefined) {
      try {
        rmSync(directory, { recursive: true, force: true });
      } catch {
        // Windows can keep a brief lock on SQLite files after a failed test.
      }
    }
  }
});

const MINT_B = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11MCCe8BenwNYB';
const PIPE_WALLETS = [
  'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
  '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj',
  'Hz1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
  'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
  '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  'So11111111111111111111111111111111111111112',
] as const;
const PIPE_TOP = PIPE_WALLETS[0];

function buildTop20() {
  const parsedAccounts: Record<string, unknown> = {};
  const largest = TOKEN_ACCOUNTS.map((address, index) => {
    const amountRaw = String(20 - index);
    if (index === 0 || index === 1) {
      parsedAccounts[address] = tokenAccountValue({ owner: PIPE_TOP, amountRaw });
    } else if (index === 2) {
      parsedAccounts[address] = tokenAccountValue({ owner: SPL_TOKEN_PROGRAM_ID, amountRaw });
    } else if (index === 3) {
      parsedAccounts[address] = tokenAccountValue({ owner: MINT_B, amountRaw });
    } else {
      const owner = PIPE_WALLETS[(index - 4) % PIPE_WALLETS.length];
      if (owner === undefined) {
        throw new Error('expected a pipeline wallet');
      }
      parsedAccounts[address] = tokenAccountValue({ owner, amountRaw });
      parsedAccounts[owner] = ownerAccountValue();
    }
    return largestAccount(address, amountRaw);
  });
  parsedAccounts[PIPE_TOP] = ownerAccountValue();
  parsedAccounts[SPL_TOKEN_PROGRAM_ID] = ownerAccountValue({ program: SPL_TOKEN_PROGRAM_ID, executable: false });
  return { largest, parsedAccounts };
}

function manyHistory(wallet: string, count: number) {
  return Array.from({ length: count }, (_, index) =>
    historyTx({
      signature: `${wallet.slice(0, 8)}-${String(index)}`,
      slot: 4000 - index,
      transactionIndex: index,
      blockTime: Math.floor(WI_SCAN_MS / 1000) - (index % 10),
      pre: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: wallet, amountRaw: '10' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: wallet, amountRaw: '4' }),
      ],
      post: [
        tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: wallet, amountRaw: '12' }),
        tokenBalance({ accountIndex: 2, mint: MINT_B, owner: wallet, amountRaw: '3' }),
      ],
    }),
  );
}

describe('wallet intelligence synthetic full pipeline', () => {
  it('runs holders, inspect, scan, latest, and history against mixed top-20 evidence', async () => {
    const { largest, parsedAccounts } = buildTop20();
    const stats: FakeWalletIntelligenceStats = {
      historyPageRequests: [],
      firstObservedRequests: [],
      multipleAccountCalls: [],
      maxHistoryInFlight: 0,
      currentHistoryInFlight: 0,
    };
    const recentHistory: Record<string, ReturnType<typeof manyHistory>> = {
      [PIPE_TOP]: manyHistory(PIPE_TOP, 201),
    };
    const firstObserved: Record<string, ReturnType<typeof historyTx>> = {
      [PIPE_TOP]: historyTx({
        signature: 'first-a',
        slot: 10,
        blockTime: Math.floor(WI_SCAN_MS / 1000) - 2 * 24 * 60 * 60,
      }),
    };
    for (const wallet of PIPE_WALLETS) {
      if (wallet === PIPE_TOP) {
        continue;
      }
      recentHistory[wallet] = manyHistory(wallet, 3);
      firstObserved[wallet] = historyTx({
        signature: `first-${wallet.slice(0, 6)}`,
        slot: 20,
        blockTime: Math.floor(WI_SCAN_MS / 1000) - 40 * 24 * 60 * 60,
      });
    }
    const provider = fakeWalletIntelligenceProvider({
      largest,
      parsedAccounts,
      recentHistory,
      firstObserved,
      historyDelayMs: 15,
      stats,
    });

    const holders = await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider,
    });
    expect(holders.holders).toHaveLength(20);
    expect(holders.owners.some((owner) => owner.ownerKind === 'PROGRAM_OWNED_OR_EXECUTABLE')).toBe(true);
    expect(holders.owners.some((owner) => owner.ownerKind === 'ACCOUNT_MISSING')).toBe(true);
    expect(holders.analyzedOwners).toHaveLength(10);
    expect(holders.analyzedOwners.every((owner) => owner.ownerKind === 'SYSTEM_OWNED_NON_EXECUTABLE')).toBe(true);
    expect(stats.multipleAccountCalls[0]?.minContextSlot).toBe(holders.holderContextSlot);
    expect(stats.multipleAccountCalls[1]?.minContextSlot).toBe(holders.holderResolutionContextSlot);

    const inspect = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider,
    });
    expect(inspect.profiles).toHaveLength(10);
    const top = inspect.profiles.find((profile) => profile.walletAddress === PIPE_TOP);
    expect(top?.historyCensored).toBe(true);
    expect(top?.historyTransactionsObserved).toBe(200);
    expect(top?.bidirectionalTokenDeltaTxCount30d).toBeGreaterThan(0);
    expect(top?.uniqueMintsWithBalanceChange30d).toBe(2);
    expect(inspect.cohort.historyCensoredWalletCount).toBe(1);
    expect(stats.historyPageRequests.every((request) => request.limit <= 100)).toBe(true);
    expect(stats.historyPageRequests.some((request) => request.limit === 1)).toBe(true);
    expect(stats.firstObservedRequests.length).toBeGreaterThan(0);
    expect(stats.firstObservedRequests[0]?.sortOrder).toBe('asc');
    expect(stats.firstObservedRequests[0]?.limit).toBe(1);
    expect(stats.firstObservedRequests.every((request) => !('blockTimeGte' in request))).toBe(true);
    expect(stats.maxHistoryInFlight).toBeLessThanOrEqual(2);
    expect(inspect.holderResolutionContextSlot).toBeGreaterThanOrEqual(inspect.holderContextSlot);
    expect(inspect.ownerClassificationContextSlot).toBeGreaterThanOrEqual(inspect.holderResolutionContextSlot);

    const directory = mkdtempSync(join(tmpdir(), 'mtb-wi18-pipe-'));
    tempDirs.push(directory);
    const database = openSqliteDatabase({ path: join(directory, 'pipe.sqlite'), busyTimeoutMs: 1000 });
    try {
      applyMigrations(database);
      const stored = persistWalletIntelligenceScan(database, inspect, { createdAtMs: WI_SCAN_MS });
      const latest = loadLatestWalletIntelligenceScan(database, WI_MINT);
      expect(latest?.scanFingerprint).toBe(stored.scanFingerprint);
      expect(latest?.holderResolutionContextSlot).toBe(inspect.holderResolutionContextSlot);
      expect(latest?.ownerClassificationContextSlot).toBe(inspect.ownerClassificationContextSlot);
      expect(latest?.profiles.find((profile) => profile.walletAddress === PIPE_TOP)?.historyCensored).toBe(true);
    } finally {
      database.close();
    }
  });

  it('fails the entire scan and persists nothing when one analyzed wallet history fails', async () => {
    const { largest, parsedAccounts } = buildTop20();
    const provider = fakeWalletIntelligenceProvider({
      largest,
      parsedAccounts,
      failHistoryFor: PIPE_TOP,
      recentHistory: {
        [PIPE_TOP]: manyHistory(PIPE_TOP, 2),
      },
    });
    await expect(
      runWalletIntelligenceScan({
        tokenMint: WI_MINT,
        nowMs: WI_SCAN_MS,
        provider,
      }),
    ).rejects.toThrow(/forced history failure/);
  });
});
