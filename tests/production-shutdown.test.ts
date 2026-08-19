import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROD20_LOCK_FILE_NAME } from '../src/production/constants.js';
import { runProductionSupervisor } from '../src/production/supervisor.js';
import { createFakeClock, initTempDatabase, productionEnv } from './production-fixtures.js';

const silentLogger = { write: (): void => undefined };

describe('production shutdown', () => {
  it('does not start a new cycle after SIGTERM between cycles', async () => {
    const { directory, path } = initTempDatabase();
    let cycles = 0;
    let requestShutdown: (() => void) | undefined;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      skipHealth: true,
      installSignals: false,
      onStarted: (control) => {
        requestShutdown = control.requestShutdown;
      },
      runCollectorCycle: () => {
        cycles += 1;
        if (cycles === 1) {
          requestShutdown?.();
        }
        return Promise.resolve();
      },
    });
    expect(code).toBe(0);
    expect(cycles).toBe(1);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });

  it('waits for the current bounded operation then stops', async () => {
    const { directory, path } = initTempDatabase();
    let started = false;
    let finished = false;
    let release: (() => void) | undefined;
    let requestShutdown: (() => void) | undefined;
    const running = runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      skipHealth: true,
      installSignals: false,
      onStarted: (control) => {
        requestShutdown = control.requestShutdown;
      },
      runCollectorCycle: async () => {
        started = true;
        await new Promise<void>((resolve) => {
          release = resolve;
        });
        finished = true;
      },
    });
    await waitFor(() => started);
    requestShutdown?.();
    expect(finished).toBe(false);
    release?.();
    expect(await running).toBe(0);
    expect(finished).toBe(true);
  });

  it('is idempotent when shutdown is requested twice', async () => {
    const { directory, path } = initTempDatabase();
    let requestShutdown: (() => void) | undefined;
    const running = runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      lockDirectory: directory,
      skipHealth: true,
      installSignals: false,
      onStarted: (control) => {
        requestShutdown = control.requestShutdown;
      },
      runCollectorCycle: () => {
        requestShutdown?.();
        requestShutdown?.();
        return Promise.resolve();
      },
    });
    expect(await running).toBe(0);
  });
});

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
