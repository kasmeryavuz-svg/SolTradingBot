import { describe, expect, it } from 'vitest';
import { runWalletIntelligenceScan } from '../src/wallet-intelligence/engine.js';
import { formatWalletIntelligenceScanLines } from '../src/wallet-intelligence/format.js';
import { HISTORY_WINDOW_MS } from '../src/wallet-intelligence/constants.js';
import {
  defaultResolvedAccounts,
  fakeWalletIntelligenceProvider,
  historyTx,
  largestAccount,
  ownerAccountValue,
  TOKEN_ACCOUNTS,
  tokenAccountValue,
  tokenBalance,
  WALLET_A,
  WALLET_B,
  WI_MINT,
  WI_SCAN_MS,
} from './wallet-intelligence-fixtures.js';

describe('wallet intelligence profiles', () => {
  it('builds factual profile features without calling first-observed activity wallet creation', async () => {
    const blockTime = Math.floor(WI_SCAN_MS / 1000) - 3 * 24 * 60 * 60;
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        largest: [largestAccount(TOKEN_ACCOUNTS[0], '100'), largestAccount(TOKEN_ACCOUNTS[1], '50')],
        parsedAccounts: defaultResolvedAccounts({
          [TOKEN_ACCOUNTS[0]]: tokenAccountValue({ owner: WALLET_A, amountRaw: '100' }),
          [TOKEN_ACCOUNTS[1]]: tokenAccountValue({ owner: WALLET_B, amountRaw: '50' }),
          [WALLET_B]: ownerAccountValue(),
        }),
        recentHistory: {
          [WALLET_A]: [
            historyTx({
              signature: 'sig-a',
              slot: 10,
              blockTime,
              pre: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '1' })],
              post: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '2' })],
            }),
          ],
          [WALLET_B]: [],
        },
        firstObserved: {
          [WALLET_A]: historyTx({ signature: 'first-a', slot: 3, blockTime }),
          [WALLET_B]: null,
        },
      }),
    });
    const profile = scan.profiles.find((item) => item.walletAddress === WALLET_A);
    expect(profile?.observedAgeClass).toBe('OBSERVED_FRESH_7D');
    expect(profile?.historyWindowStartMs).toBe(WI_SCAN_MS - HISTORY_WINDOW_MS);
    expect(profile?.positiveTokenDeltaTxCount30d).toBe(1);
    expect(profile?.targetMintNetRawDelta30d).toBe('1');
    const text = formatWalletIntelligenceScanLines(scan).join('\n');
    expect(text).not.toMatch(/walletCreatedAt/);
    expect(text).toContain('first observed activity');
    expect(text).toContain('not wallet creation time');
    expect(scan.profiles.find((item) => item.walletAddress === WALLET_B)?.observedAgeClass).toBe('UNKNOWN');
  });

  it('does not let null blockTime create an active day and ignores provider order after canonical sort', async () => {
    const blockTime = Math.floor(WI_SCAN_MS / 1000);
    const txs = [
      historyTx({
        signature: 'b',
        slot: 8,
        blockTime: null,
        pre: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '1' })],
        post: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '2' })],
      }),
      historyTx({
        signature: 'a',
        slot: 9,
        blockTime,
        pre: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '2' })],
        post: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '3' })],
      }),
    ];
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: txs },
        historyOrder: 'reversed',
      }),
    });
    const reversed = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: { [WALLET_A]: [...txs].reverse() },
      }),
    });
    expect(scan.profiles[0]?.activeDaysObserved30d).toBe(1);
    expect(scan.profiles[0]?.historyTransactionsObserved).toBe(1);
    expect(scan.profiles[0]?.incompleteDeltaTxCount30d).toBe(1);
    expect(scan.profiles[0]?.profileFingerprint).toBe(reversed.profiles[0]?.profileFingerprint);
    expect(scan.scanFingerprint).toBe(reversed.scanFingerprint);
  });

  it('counts an unpaired-pre/post transaction as observed history without moving delta metrics', async () => {
    const blockTime = Math.floor(WI_SCAN_MS / 1000);
    const scan = await runWalletIntelligenceScan({
      tokenMint: WI_MINT,
      nowMs: WI_SCAN_MS,
      provider: fakeWalletIntelligenceProvider({
        parsedAccounts: defaultResolvedAccounts(),
        recentHistory: {
          [WALLET_A]: [
            historyTx({
              signature: 'unpaired',
              slot: 9,
              blockTime,
              pre: [tokenBalance({ accountIndex: 1, mint: WI_MINT, owner: WALLET_A, amountRaw: '100' })],
              post: [],
            }),
          ],
        },
      }),
    });
    const profile = scan.profiles[0];
    expect(profile?.historyTransactionsObserved).toBe(1);
    expect(profile?.incompleteDeltaTxCount30d).toBe(1);
    expect(profile?.positiveTokenDeltaTxCount30d).toBe(0);
    expect(profile?.negativeTokenDeltaTxCount30d).toBe(0);
    expect(profile?.bidirectionalTokenDeltaTxCount30d).toBe(0);
    expect(profile?.targetMintPositiveDeltaTxCount30d).toBe(0);
    expect(profile?.targetMintNegativeDeltaTxCount30d).toBe(0);
    expect(profile?.targetMintNetRawDelta30d).toBe('0');
    expect(profile?.uniqueMintsWithBalanceChange30d).toBe(0);
    expect(profile?.activeDaysObserved30d).toBe(0);
  });
});
