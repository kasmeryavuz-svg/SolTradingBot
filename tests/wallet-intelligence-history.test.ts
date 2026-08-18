import { describe, expect, it } from 'vitest';
import { HISTORY_WINDOW_MS } from '../src/wallet-intelligence/constants.js';
import {
  classifyObservedAge,
  fenceHistoryTransactions,
  firstObservedActivityFromTransaction,
} from '../src/wallet-intelligence/history.js';
import { historyTx } from './wallet-intelligence-fixtures.js';
import { WI_HOLDER_SLOT, WI_SCAN_MS } from './wallet-intelligence-fixtures.js';

describe('wallet intelligence history fencing', () => {
  it('rejects a slot newer than the holder snapshot and a future blockTime', () => {
    expect(() =>
      fenceHistoryTransactions({
        transactions: [historyTx({ signature: 'sig-future-slot', slot: WI_HOLDER_SLOT + 1, blockTime: 1 })],
        holderContextSlot: WI_HOLDER_SLOT,
        scanStartedAtMs: WI_SCAN_MS,
        windowStartMs: WI_SCAN_MS - HISTORY_WINDOW_MS,
      }),
    ).toThrow(/newer than the holder snapshot/);
    expect(() =>
      fenceHistoryTransactions({
        transactions: [
          historyTx({
            signature: 'sig-future-time',
            slot: WI_HOLDER_SLOT,
            blockTime: Math.floor(WI_SCAN_MS / 1000) + 1,
          }),
        ],
        holderContextSlot: WI_HOLDER_SLOT,
        scanStartedAtMs: WI_SCAN_MS,
        windowStartMs: WI_SCAN_MS - HISTORY_WINDOW_MS,
      }),
    ).toThrow(/newer than the scan anchor/);
  });

  it('rejects a failed transaction in succeeded history', () => {
    expect(() =>
      fenceHistoryTransactions({
        transactions: [
          historyTx({
            signature: 'failed',
            slot: 1,
            blockTime: Math.floor(WI_SCAN_MS / 1000),
            err: { InstructionError: [0, 'Custom'] },
          }),
        ],
        holderContextSlot: WI_HOLDER_SLOT,
        scanStartedAtMs: WI_SCAN_MS,
        windowStartMs: WI_SCAN_MS - HISTORY_WINDOW_MS,
      }),
    ).toThrow(/Failed transaction/);
  });

  it('classifies observed age at exact 7d and 30d boundaries and unknown when missing', () => {
    expect(classifyObservedAge(null, WI_SCAN_MS)).toBe('UNKNOWN');
    expect(classifyObservedAge(WI_SCAN_MS - 7 * 24 * 60 * 60 * 1000, WI_SCAN_MS)).toBe('OBSERVED_FRESH_7D');
    expect(classifyObservedAge(WI_SCAN_MS - 7 * 24 * 60 * 60 * 1000 - 1, WI_SCAN_MS)).toBe('OBSERVED_YOUNG_30D');
    expect(classifyObservedAge(WI_SCAN_MS - 30 * 24 * 60 * 60 * 1000, WI_SCAN_MS)).toBe('OBSERVED_YOUNG_30D');
    expect(classifyObservedAge(WI_SCAN_MS - 30 * 24 * 60 * 60 * 1000 - 1, WI_SCAN_MS)).toBe(
      'OBSERVED_ESTABLISHED_30D_PLUS',
    );
  });

  it('stores first-observed activity without calling it wallet creation', () => {
    const first = firstObservedActivityFromTransaction(
      historyTx({ signature: 'first', slot: 4, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
      WI_HOLDER_SLOT,
      WI_SCAN_MS,
    );
    expect(Object.keys(first).sort()).toEqual(['atMs', 'blockTime', 'slot']);
    expect(JSON.stringify(first)).not.toMatch(/walletCreatedAt|wallet creation/i);
    const unknown = firstObservedActivityFromTransaction(
      historyTx({ signature: 'first-null', slot: 4, blockTime: null }),
      WI_HOLDER_SLOT,
      WI_SCAN_MS,
    );
    expect(unknown.slot).toBe(4);
    expect(unknown.atMs).toBeNull();
  });

  it('keeps the recent window inclusive at the exact lower and upper bounds', () => {
    const windowStartMs = WI_SCAN_MS - HISTORY_WINDOW_MS;
    const fenced = fenceHistoryTransactions({
      transactions: [
        historyTx({ signature: 'lower', slot: 1, blockTime: Math.floor(windowStartMs / 1000) }),
        historyTx({ signature: 'upper', slot: 2, blockTime: Math.floor(WI_SCAN_MS / 1000) }),
      ],
      holderContextSlot: WI_HOLDER_SLOT,
      scanStartedAtMs: WI_SCAN_MS,
      windowStartMs,
    });
    expect(fenced).toHaveLength(2);
  });
});
