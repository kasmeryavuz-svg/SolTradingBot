import { afterEach, describe, expect, it, vi } from 'vitest';
import { executeLiveBroadcast } from '../src/live/execute.js';
import {
  createFakeLiveRpc,
  instantClock,
  liveExecutionRpc,
  liveJupiter,
  openMemoryLiveStore,
} from './live-fixtures.js';
import { loadTestWalletFixture, walletExecutionIntent } from './wallet-fixtures.js';

const opened: Array<{ close: () => void }> = [];

afterEach(() => {
  while (opened.length > 0) {
    opened.pop()?.close();
  }
});

describe('live no secret persistence', () => {
  it('stores no secret or signed wire after a successful mocked flow', async () => {
    const fixture = await loadTestWalletFixture();
    const memory = openMemoryLiveStore();
    opened.push(memory);
    const liveRpc = createFakeLiveRpc({
      takerAddress: fixture.address,
      initialStatus: { slot: '1', err: null, confirmationStatus: 'confirmed' },
    });
    const lines: string[] = [];
    const capture = (chunk: string | Uint8Array): boolean => {
      lines.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    };
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(capture);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(capture);
    try {
      const report = await executeLiveBroadcast({
        intent: walletExecutionIntent(fixture.address),
        jupiter: liveJupiter(fixture.address),
        executionRpc: liveExecutionRpc(),
        liveRpc,
        store: memory.store,
        promptSecret: () => Promise.resolve(fixture.secretBase58),
        promptConfirmation: () => Promise.resolve(),
        clock: instantClock(),
      });
      const row = memory.store.getById(report.attemptId);
      const dumped = `${JSON.stringify(row)}\n${JSON.stringify(report)}\n${lines.join('')}`;
      expect(dumped).not.toContain(fixture.secretBase58);
      for (const wire of liveRpc.acceptedWires) {
        expect(dumped).not.toContain(wire);
        if (wire.length > 40) {
          expect(dumped).not.toContain(wire.slice(0, 40));
        }
      }
      expect(report.expectedSignature).toBeTruthy();
    } finally {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    }
  });
});
