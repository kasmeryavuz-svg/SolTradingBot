import { describe, expect, it } from 'vitest';
import { classifyObservedStatus, trackExpectedSignature } from '../src/live/confirmation-tracker.js';
import { createFakeLiveRpc, instantClock } from './live-fixtures.js';

describe('live tracker', () => {
  it('does not complete on processed alone', () => {
    expect(
      classifyObservedStatus({
        slot: '1',
        err: null,
        confirmationStatus: 'processed',
      }),
    ).toBeNull();
  });

  it('accepts confirmed/finalized only when err is null', () => {
    expect(
      classifyObservedStatus({ slot: '1', err: null, confirmationStatus: 'confirmed' })?.status,
    ).toBe('confirmed');
    expect(
      classifyObservedStatus({ slot: '1', err: 'InstructionError', confirmationStatus: 'confirmed' })
        ?.status,
    ).toBe('failed_on_chain');
  });

  it('returns broadcast_pending when the blockhash is still valid after timeout', async () => {
    const rpc = createFakeLiveRpc({ height: 900n, initialStatus: null });
    const clock = instantClock();
    const outcome = await trackExpectedSignature({
      rpc,
      expectedSignature: 'sig',
      lastValidBlockHeight: 1000n,
      timeoutMs: 30_000,
      intervalMs: 750,
      clock,
    });
    expect(outcome.status).toBe('broadcast_pending');
  });

  it('returns expired_unconfirmed when the signature never appears and the blockhash expires', async () => {
    const rpc = createFakeLiveRpc({ height: 1001n, initialStatus: null });
    const clock = instantClock();
    const outcome = await trackExpectedSignature({
      rpc,
      expectedSignature: 'sig',
      lastValidBlockHeight: 1000n,
      timeoutMs: 30_000,
      intervalMs: 750,
      clock,
    });
    expect(outcome.status).toBe('expired_unconfirmed');
  });
});
