import { describe, expect, it } from 'vitest';
import { runProductionSupervisor } from '../src/production/supervisor.js';
import { createFakeClock, initTempDatabase, productionEnv } from './production-fixtures.js';

const silentLogger = { write: (): void => undefined };

describe('production scheduler', () => {
  it('starts the next cycle only after completion plus the fixed delay', async () => {
    const { directory, path } = initTempDatabase();
    const clock = createFakeClock();
    const starts: number[] = [];
    const code = await runProductionSupervisor(
      productionEnv({
        DATABASE_PATH: path,
        PROD20_COLLECTOR_ENABLED: 'true',
        PROD20_PAPER_ENABLED: 'false',
        PROD20_INTERVAL_MS: '300000',
      }),
      {
        clock,
        logger: silentLogger,
        skipPreflight: true,
        skipLock: true,
        skipHealth: true,
        installSignals: false,
        stopAfterCycles: 2,
        lockDirectory: directory,
        runCollectorCycle: () => {
          starts.push(clock.nowMs());
          clock.advance(7 * 60 * 1000);
          return Promise.resolve();
        },
      },
    );
    expect(code).toBe(0);
    expect(starts).toHaveLength(2);
    const firstStart = starts[0];
    const secondStart = starts[1];
    expect(firstStart).toBeDefined();
    expect(secondStart).toBeDefined();
    if (firstStart !== undefined && secondStart !== undefined) {
      expect(secondStart - firstStart).toBe(7 * 60 * 1000 + 300_000);
    }
    expect(clock.sleeps).toEqual([300_000]);
  });

  it('increments cycleNumber once per started cycle and never overlaps', async () => {
    const { directory, path } = initTempDatabase();
    const clock = createFakeClock();
    let active = 0;
    let maxActive = 0;
    const cycles: number[] = [];
    await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock,
      logger: silentLogger,
      skipPreflight: true,
      skipLock: true,
      skipHealth: true,
      installSignals: false,
      stopAfterCycles: 3,
      lockDirectory: directory,
      runCollectorCycle: () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        cycles.push(active);
        active -= 1;
        return Promise.resolve();
      },
    });
    expect(maxActive).toBe(1);
    expect(cycles).toEqual([1, 1, 1]);
    expect(clock.sleeps).toEqual([300_000, 300_000]);
  });
});
