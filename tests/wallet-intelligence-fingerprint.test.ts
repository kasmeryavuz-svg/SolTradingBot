import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyMigrations, openSqliteDatabase } from '../src/persistence/sqlite/index.js';
import { canonicalWalletIntelligenceDefinition } from '../src/wallet-intelligence/definition.js';
import { runWalletIntelligenceScan } from '../src/wallet-intelligence/engine.js';
import { WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT } from '../src/wallet-intelligence/identity.js';
import { persistWalletIntelligenceScan } from '../src/wallet-intelligence/persistence.js';
import {
  HISTORY_MAX_INSPECTED,
  SPL_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from '../src/wallet-intelligence/constants.js';
import {
  defaultResolvedAccounts,
  fakeWalletIntelligenceProvider,
  historyTx,
  largestAccount,
  ownerAccountValue,
  tokenAccountValue,
  tokenBalance,
  WALLET_A,
  WALLET_B,
  TOKEN_ACCOUNTS,
  WI_MINT,
  WI_SCAN_MS,
  WI_SECRET,
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

function historyFor(
  signature: string,
  slot: number,
  amountPre: string,
  amountPost: string,
  count = 1,
) {
  return Array.from({ length: count }, (_, index) =>
    historyTx({
      signature: `${signature}-${String(index)}`,
      slot: slot - index,
      blockTime: Math.floor(WI_SCAN_MS / 1000),
      pre: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: amountPre })],
      post: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: amountPost })],
    }),
  );
}

describe('wallet intelligence fingerprints', () => {
  it('is stable for the same evidence and ignores API key, machine path, and DB filename', async () => {
    const provider = fakeWalletIntelligenceProvider({
      parsedAccounts: defaultResolvedAccounts(),
      recentHistory: { [WALLET_A]: historyFor('sig', 9, '1', '2') },
    });
    const first = await runWalletIntelligenceScan({ tokenMint: WI_MINT, nowMs: WI_SCAN_MS, provider });
    const second = await runWalletIntelligenceScan({ tokenMint: WI_MINT, nowMs: WI_SCAN_MS, provider });
    expect(first.scanFingerprint).toBe(second.scanFingerprint);
    expect(first.profiles[0]?.profileFingerprint).toBe(second.profiles[0]?.profileFingerprint);
    expect(JSON.stringify(first)).not.toContain(process.cwd());
    expect(JSON.stringify(first)).not.toContain(WI_SECRET);
    expect(JSON.stringify(canonicalWalletIntelligenceDefinition())).not.toContain(WI_SECRET);
    expect(JSON.stringify(canonicalWalletIntelligenceDefinition())).not.toContain('HELIUS_API_KEY');
    expect(first.scanFingerprint).not.toContain(WI_SECRET);
    expect(WALLET_INTELLIGENCE_DEFINITION_FINGERPRINT).toHaveLength(64);

    const dirA = mkdtempSync(join(tmpdir(), 'mtb-wi18-fp-a-'));
    const dirB = mkdtempSync(join(tmpdir(), 'mtb-wi18-fp-b-'));
    tempDirs.push(dirA, dirB);
    const dbA = openSqliteDatabase({ path: join(dirA, 'alpha.sqlite'), busyTimeoutMs: 1000 });
    const dbB = openSqliteDatabase({ path: join(dirB, 'beta.sqlite'), busyTimeoutMs: 1000 });
    try {
      applyMigrations(dbA);
      applyMigrations(dbB);
      const storedA = persistWalletIntelligenceScan(dbA, first, { createdAtMs: WI_SCAN_MS });
      const storedB = persistWalletIntelligenceScan(dbB, first, { createdAtMs: WI_SCAN_MS });
      expect(storedA.scanFingerprint).toBe(first.scanFingerprint);
      expect(storedB.scanFingerprint).toBe(first.scanFingerprint);
    } finally {
      dbA.close();
      dbB.close();
    }
  });

  it('changes when economically relevant evidence changes', async () => {
    const baseProvider = fakeWalletIntelligenceProvider({
      parsedAccounts: defaultResolvedAccounts(),
      recentHistory: { [WALLET_A]: historyFor('sig', 9, '1', '2') },
      firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
    });
    const base = await runWalletIntelligenceScan({ tokenMint: WI_MINT, nowMs: WI_SCAN_MS, provider: baseProvider });
    const amountMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        largest: [largestAccount(TOKEN_ACCOUNTS[0], '401'), largestAccount(TOKEN_ACCOUNTS[1], '300')],
        parsedAccounts: defaultResolvedAccounts({
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '401' }),
        }),
        recentHistory: { [WALLET_A]: historyFor('sig', 9, '1', '2') },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    const ownerMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts({
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_B, amountRaw: '400' }),
          [WALLET_B]: ownerAccountValue(),
        }),
        recentHistory: {
          [WALLET_A]: historyFor('sig', 9, '1', '2'),
          [WALLET_B]: historyFor('sig', 9, '1', '2'),
        },
        firstObserved: {
          [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
          [WALLET_B]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
        },
      }),
    });
    const kindMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: {
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: SPL_TOKEN_PROGRAM_ID, amountRaw: '400' }),
          [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '300' }),
          [SPL_TOKEN_PROGRAM_ID]: ownerAccountValue({ program: TOKEN_2022_PROGRAM_ID, executable: false }),
          [WALLET_A]: ownerAccountValue(),
        },
        recentHistory: { [WALLET_A]: historyFor('sig', 9, '1', '2') },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    const firstSlotMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: historyFor('sig', 9, '1', '2') },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 4, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    const signatureMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: historyFor('other-sig', 9, '1', '2') },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    const slotMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: historyFor('sig', 8, '1', '2') },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    const deltaMutated = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: historyFor('sig', 9, '1', '9') },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    const censored = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: historyFor('sig', 400, '1', '2', HISTORY_MAX_INSPECTED) },
        firstObserved: { [WALLET_A]: historyTx({ signature: 'first', slot: 3, blockTime: Math.floor(WI_SCAN_MS / 1000) }) },
      }),
    });
    expect(amountMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(ownerMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(kindMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(firstSlotMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(signatureMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(slotMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(deltaMutated.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(censored.scanFingerprint).not.toBe(base.scanFingerprint);
    expect(censored.profiles[0]?.historyCensored).toBe(true);
  });
});
