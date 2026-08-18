import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import { runWalletIntelligenceHolders, runWalletIntelligenceScan } from '../src/wallet-intelligence/engine.js';
import { WalletIntelligenceError } from '../src/wallet-intelligence/errors.js';
import {
  countWalletIntelligenceRows,
  loadLatestWalletIntelligenceScan,
  loadWalletIntelligenceScanHistory,
  persistWalletIntelligenceScan,
} from '../src/wallet-intelligence/persistence.js';
import {
  defaultResolvedAccounts,
  fakeWalletIntelligenceProvider,
  historyTx,
  tokenBalance,
  WALLET_A,
  WI_MINT,
  WI_SCAN_MS,
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

function tempDb() {
  const directory = mkdtempSync(join(tmpdir(), 'mtb-wi18-'));
  tempDirs.push(directory);
  const path = join(directory, 'history.sqlite');
  const database = openSqliteDatabase({ path, busyTimeoutMs: 1000 });
  applyMigrations(database);
  return { path, database };
}

function digestFile(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

describe('wallet intelligence persistence', () => {
  it('persists a completed scan atomically and rolls back half-written scans', async () => {
    const { database } = tempDb();
    try {
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: {
          [WALLET_A]: [
            historyTx({
              signature: 'sig',
              slot: 1,
              blockTime: Math.floor(WI_SCAN_MS / 1000),
              pre: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '1' })],
              post: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '2' })],
            }),
          ],
        },
      }),
    });
    persistWalletIntelligenceScan(database, scan, { createdAtMs: WI_SCAN_MS });
    expect(countWalletIntelligenceRows(database)).toEqual({ scans: 1, holders: 2, profiles: 1 });

    const scanAfterInsert = { ...scan, scanFingerprint: '11'.padEnd(64, 'a') };
    expect(() =>
      persistWalletIntelligenceScan(database, scanAfterInsert, {
        createdAtMs: WI_SCAN_MS + 1,
        hooks: {
          afterScanInsert: () => {
            throw new WalletIntelligenceError('forced after scan insert', { code: 'persistence_failed' });
          },
        },
      }),
    ).toThrow(/forced after scan insert/);
    expect(countWalletIntelligenceRows(database)).toEqual({ scans: 1, holders: 2, profiles: 1 });

    const scanHalfwayHolders = { ...scan, scanFingerprint: '22'.padEnd(64, 'a') };
    expect(() =>
      persistWalletIntelligenceScan(database, scanHalfwayHolders, {
        createdAtMs: WI_SCAN_MS + 2,
        hooks: {
          afterHolderInsert: (index) => {
            if (index === 0) {
              throw new WalletIntelligenceError('forced halfway holders', { code: 'persistence_failed' });
            }
          },
        },
      }),
    ).toThrow(/forced halfway holders/);
    expect(countWalletIntelligenceRows(database)).toEqual({ scans: 1, holders: 2, profiles: 1 });

    const scanHalfwayProfiles = { ...scan, scanFingerprint: '33'.padEnd(64, 'a') };
    expect(() =>
      persistWalletIntelligenceScan(database, scanHalfwayProfiles, {
        createdAtMs: WI_SCAN_MS + 3,
        hooks: {
          afterProfileInsert: () => {
            throw new WalletIntelligenceError('forced halfway profiles', { code: 'persistence_failed' });
          },
        },
      }),
    ).toThrow(/forced halfway profiles/);
    expect(countWalletIntelligenceRows(database)).toEqual({ scans: 1, holders: 2, profiles: 1 });

    expect(() => persistWalletIntelligenceScan(database, scan, { createdAtMs: WI_SCAN_MS + 4 })).toThrow(
      /already exists/,
    );
    expect(countWalletIntelligenceRows(database)).toEqual({ scans: 1, holders: 2, profiles: 1 });
    } finally {
    database.close();
    }
  });

  it('leaves the database hash unchanged for holders and inspect', async () => {
    const { path, database } = tempDb();
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    database.close();
    const before = digestFile(path);
    await runWalletIntelligenceHolders({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ parsedAccounts: defaultResolvedAccounts() }),
    });
    await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ parsedAccounts: defaultResolvedAccounts() }),
    });
    expect(digestFile(path)).toBe(before);
  });

  it('leaves the database hash unchanged for latest and history reads', async () => {
    const { path, database } = tempDb();
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ parsedAccounts: defaultResolvedAccounts() }),
    });
    persistWalletIntelligenceScan(database, scan, { createdAtMs: WI_SCAN_MS });
    database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    database.close();
    const before = digestFile(path);
    const reader = new DatabaseSync(path, {
      timeout: 1000,
      enableForeignKeyConstraints: true,
      readOnly: true,
    });
    reader.exec('PRAGMA query_only = ON');
    const latest = loadLatestWalletIntelligenceScan(reader, WI_MINT);
    expect(latest?.scanFingerprint).toBe(scan.scanFingerprint);
    expect(latest?.profiles[0]?.uniqueMintsTouched30d).toEqual(
      scan.profiles[0]?.uniqueMintsTouched30d,
    );
    expect(latest?.holderResolutionContextSlot).toBe(scan.holderResolutionContextSlot);
    expect(latest?.ownerClassificationContextSlot).toBe(scan.ownerClassificationContextSlot);
    expect(loadWalletIntelligenceScanHistory(reader, WI_MINT)).toHaveLength(1);
    reader.close();
    expect(digestFile(path)).toBe(before);
  });

  it('does not persist raw provider JSON, API keys, or authenticated URLs', async () => {
    const { database } = tempDb();
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ parsedAccounts: defaultResolvedAccounts() }),
    });
    persistWalletIntelligenceScan(database, scan);
    const dump = JSON.stringify(
      database.prepare('SELECT * FROM wallet_intelligence_scans').all(),
    ) + JSON.stringify(database.prepare('SELECT * FROM wallet_intelligence_wallet_profiles').all());
    expect(dump).not.toContain('super-secret-helius-key-123');
    expect(dump).not.toContain('api-key=');
    expect(dump).not.toContain('preTokenBalances');
    expect(dump).not.toContain('https://mainnet.helius-rpc.com');
    database.close();
  });

  it('persists oversized signed target-mint net deltas as TEXT and rejects CAST-style integer use', async () => {
    const { database } = tempDb();
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({ parsedAccounts: defaultResolvedAccounts() }),
    });
    const profile = scan.profiles[0];
    if (profile === undefined) {
      throw new Error('expected a profile');
    }
    const mutated = {
      ...scan,
      scanFingerprint: 'ab'.repeat(32),
      profiles: [
        {
          ...profile,
          targetMintNetRawDelta30d: '-9007199254740993',
          profileFingerprint: 'cd'.repeat(32),
        },
      ],
    };
    persistWalletIntelligenceScan(database, mutated, { createdAtMs: WI_SCAN_MS + 9 });
    const loaded = loadLatestWalletIntelligenceScan(database, WI_MINT);
    expect(loaded?.profiles[0]?.targetMintNetRawDelta30d).toBe('-9007199254740993');
    const typeRow = database.prepare("PRAGMA table_info('wallet_intelligence_wallet_profiles')").all();
    const amountColumn = typeRow.find((row) => row['name'] === 'target_mint_net_raw_delta_30d');
    expect(amountColumn?.['type']).toBe('TEXT');
    database.close();
  });
});
