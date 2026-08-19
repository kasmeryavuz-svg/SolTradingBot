import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PersistenceError } from '../src/persistence/types.js';
import { PROD20_LOCK_FILE_NAME } from '../src/production/constants.js';
import { ProductionHealthServer } from '../src/production/health.js';
import {
  acquireProductionLock,
  releaseProductionLock,
} from '../src/production/lock.js';
import { runProductionSupervisor } from '../src/production/supervisor.js';
import type { ProductionHealthRuntime, ProductionHealthSnapshot } from '../src/production/types.js';
import {
  createFakeClock,
  createRecoverableProviderFailure,
  initTempDatabase,
  productionEnv,
} from './production-fixtures.js';

const silentLogger = { write: (): void => undefined };

function fakeHealth(options: {
  listen?: () => Promise<{ address: string; port: number }>;
  onClose?: () => void;
}): { runtime: ProductionHealthRuntime; emitRuntimeError: (error: Error) => void; closeCount: () => number } {
  let handler: ((error: Error) => void) | undefined;
  let closes = 0;
  return {
    runtime: {
      listen:
        options.listen ??
        (() => Promise.resolve({ address: '127.0.0.1', port: 4314 })),
      close: () => {
        closes += 1;
        options.onClose?.();
        return Promise.resolve();
      },
      setRuntimeErrorHandler: (next) => {
        handler = next;
      },
    },
    emitRuntimeError: (error) => {
      handler?.(error);
    },
    closeCount: () => closes,
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out');
}

describe('production hostile audit', () => {
  it('releases the owned lock and starts no cycles when health bind fails', async () => {
    const { directory, path } = initTempDatabase();
    let cycles = 0;
    let closes = 0;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      installSignals: false,
      createHealthServer: () => ({
        listen: () => Promise.reject(Object.assign(new Error('listen EADDRINUSE'), { code: 'EADDRINUSE' })),
        close: () => {
          closes += 1;
          return Promise.resolve();
        },
      }),
      runCollectorCycle: () => {
        cycles += 1;
        return Promise.resolve();
      },
    });
    expect(code).toBe(1);
    expect(cycles).toBe(0);
    expect(closes).toBe(1);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });

  it('unwinds a post-lock initialization exception through cleanup', async () => {
    const { directory, path } = initTempDatabase();
    let cycles = 0;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      installSignals: false,
      createHealthServer: () => ({
        listen: () => Promise.reject(new Error('partial health resource failed')),
        close: () => Promise.resolve(),
      }),
      runCollectorCycle: () => {
        cycles += 1;
        return Promise.resolve();
      },
    });
    expect(code).toBe(1);
    expect(cycles).toBe(0);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });

  it('treats a health-server runtime error as fatal shutdown', async () => {
    const { directory, path } = initTempDatabase();
    const health = fakeHealth({});
    let requestShutdown: (() => void) | undefined;
    const running = runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      installSignals: false,
      createHealthServer: () => health.runtime,
      onStarted: (control) => {
        requestShutdown = control.requestShutdown;
        health.emitRuntimeError(new Error('health endpoint lost'));
      },
      runCollectorCycle: () => Promise.resolve(),
    });
    const code = await running;
    expect(code).toBe(1);
    expect(health.closeCount()).toBe(1);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
    expect(requestShutdown).toBeTypeOf('function');
  });

  it('runs an injected graceful end-to-end supervisor sequence', async () => {
    const { directory, path } = initTempDatabase();
    const health = fakeHealth({});
    const baseClock = createFakeClock();
    let sleepCount = 0;
    const clock = {
      nowMs: baseClock.nowMs,
      nowIso: baseClock.nowIso,
      sleep: async (_ms: number, signal: AbortSignal) => {
        sleepCount += 1;
        if (sleepCount < 3) {
          return;
        }
        if (signal.aborted) {
          return;
        }
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              resolve();
            },
            { once: true },
          );
        });
      },
    };
    const gates: Array<{ outcome: 'ok' | 'fail'; release: () => void }> = [];
    let snapshot: (() => ProductionHealthSnapshot) | undefined;
    let requestShutdown: (() => void) | undefined;
    const running = runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock,
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      installSignals: false,
      createHealthServer: () => health.runtime,
      onStarted: (control) => {
        snapshot = control.snapshot;
        requestShutdown = control.requestShutdown;
      },
      runCollectorCycle: async () => {
        const gate: { outcome: 'ok' | 'fail'; release: () => void } = {
          outcome: 'ok',
          release: () => undefined,
        };
        await new Promise<void>((resolve) => {
          gate.release = resolve;
          gates.push(gate);
        });
        if (gate.outcome === 'fail') {
          throw createRecoverableProviderFailure('provider timeout');
        }
      },
    });

    await waitFor(() => snapshot !== undefined && gates.length >= 1);
    expect(snapshot?.().ready).toBe(false);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(true);
    gates[0]?.release();
    await waitFor(() => snapshot?.().ready === true);

    await waitFor(() => gates.length >= 2);
    const second = gates[1];
    if (second !== undefined) {
      second.outcome = 'fail';
      second.release();
    }
    await waitFor(() => {
      const current = snapshot?.();
      return current !== undefined && !current.ready && current.consecutiveFailedCycles === 1;
    });

    await waitFor(() => gates.length >= 3);
    gates[2]?.release();
    await waitFor(() => snapshot?.().ready === true);

    const cyclesBeforeStop = gates.length;
    requestShutdown?.();
    await waitFor(() => snapshot?.().ready === false);
    for (const gate of gates) {
      gate.release();
    }
    expect(await running).toBe(0);
    expect(gates.length).toBe(cyclesBeforeStop);
    expect(health.closeCount()).toBe(1);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });

  it('runs an injected fatal end-to-end supervisor sequence without a 3-cycle wait', async () => {
    const { directory, path } = initTempDatabase();
    const health = fakeHealth({});
    let snapshot: (() => ProductionHealthSnapshot) | undefined;
    let cycles = 0;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      installSignals: false,
      createHealthServer: () => health.runtime,
      onStarted: (control) => {
        snapshot = control.snapshot;
      },
      runCollectorCycle: () => {
        cycles += 1;
        return Promise.reject(new PersistenceError('Database unavailable. Could not open the local SQLite file.'));
      },
    });
    expect(code).toBe(1);
    expect(cycles).toBe(1);
    expect(snapshot?.().ready).toBe(false);
    expect(health.closeCount()).toBe(1);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });

  it('makes cleanup idempotent', async () => {
    const { directory } = initTempDatabase();
    const acquired = acquireProductionLock({
      directory,
      pid: 3,
      processStartedAtMs: 30,
      runtimeStartedAt: '2026-08-19T00:00:00.000Z',
      liveness: { isAlive: () => false },
    });
    const server = new ProductionHealthServer({
      port: 0,
      state: {
        snapshot: () => ({
          alive: true,
          ready: false,
          shuttingDown: true,
          consecutiveFailedCycles: 0,
          completedSuccessfulCycle: false,
          startupPassed: false,
          lockHeld: false,
          uptimeMs: 0,
          specVersion: 'prod20_v1',
          specFingerprint: 'x'.repeat(64),
        }),
      },
    });
    await expect(server.close()).resolves.toBeUndefined();
    await expect(server.close()).resolves.toBeUndefined();
    releaseProductionLock(acquired);
    releaseProductionLock(acquired);
    expect(existsSync(acquired.path)).toBe(false);
  });
});
