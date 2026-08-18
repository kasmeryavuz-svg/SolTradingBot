import { afterEach, describe, expect, it } from 'vitest';
import { LiveError } from '../src/live/errors.js';
import { executeLiveReconcile } from '../src/live/reconcile.js';
import { createFakeLiveRpc, instantClock, openMemoryLiveStore, reserveLiveRow } from './live-fixtures.js';

const opened: Array<{ close: () => void }> = [];

afterEach(() => {
  while (opened.length > 0) {
    opened.pop()?.close();
  }
});

describe('live reconcile', () => {
  it('refuses when there is no unresolved expected signature and never sends', async () => {
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc();
    await expect(
      executeLiveReconcile({ store: memory.store, liveRpc, clock: instantClock() }),
    ).rejects.toThrow(LiveError);
    expect(liveRpc.sendCount).toBe(0);
  });

  it('does not reconcile a signed-only row', async () => {
    const memory = openMemoryLiveStore();
    opened.push(memory);
    memory.store.reserve(
      reserveLiveRow({
        status: 'signed',
        expectedSignature: 'Expected111111111111111111111111111111111111111111111111111',
        signedWireSha256: 'a'.repeat(64),
      }),
    );
    const liveRpc = createFakeLiveRpc({
      initialStatus: { slot: '9', err: null, confirmationStatus: 'confirmed' },
    });
    await expect(
      executeLiveReconcile({ store: memory.store, liveRpc, clock: instantClock() }),
    ).rejects.toThrow(/No unresolved/);
    expect(liveRpc.sendCount).toBe(0);
  });

  it('updates the oldest stored expected txid without sending', async () => {
    const memory = openMemoryLiveStore();
    opened.push(memory);
    memory.store.reserve(
      reserveLiveRow({
        status: 'broadcast_outcome_unknown',
        expectedSignature: 'Expected111111111111111111111111111111111111111111111111111',
        broadcastRiskAtMs: Date.now(),
        failureCode: 'broadcast_outcome_unknown',
        failureMessage: 'timeout',
      }),
    );
    const liveRpc = createFakeLiveRpc({
      initialStatus: { slot: '9', err: null, confirmationStatus: 'confirmed' },
      receipt: {
        slot: '9',
        err: null,
        feeLamports: 5000n,
        transactionBase64: null,
        firstSignature: null,
        preTokenBalances: [],
        postTokenBalances: [],
      },
    });
    const report = await executeLiveReconcile({
      store: memory.store,
      liveRpc,
      clock: instantClock(),
    });
    expect(liveRpc.sendCount).toBe(0);
    expect(report.status === 'confirmed' || report.status === 'confirmed_receipt_pending').toBe(true);
    expect(report.sendCount).toBe(0);
    expect(liveRpc.lastSearchTransactionHistory).toBe(true);
  });
});
