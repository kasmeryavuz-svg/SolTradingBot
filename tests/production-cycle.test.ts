import { describe, expect, it } from 'vitest';
import { runProductionCycle } from '../src/production/cycle.js';
import { createFakeClock, mintAt, productionEnv } from './production-fixtures.js';
import { loadProductionConfig } from '../src/production/config.js';
import type { ProductionLogger } from '../src/production/types.js';

const silentLogger: ProductionLogger = { write: () => undefined };

describe('production cycle', () => {
  it('keeps collector before paper and mints serial', async () => {
    const order: string[] = [];
    let releaseCollector: (() => void) | undefined;
    const collector = new Promise<void>((resolve) => {
      releaseCollector = resolve;
    });
    const mintA = mintAt(1);
    const mintB = mintAt(2);
    const running = runProductionCycle({
      cycleNumber: 1,
      consecutiveFailedCycles: 0,
      config: loadProductionConfig(
        productionEnv({
          PROD20_PAPER_ENABLED: 'true',
          PROD20_PAPER_MINTS: `${mintB},${mintA}`,
        }),
      ),
      dependencies: {
        clock: createFakeClock(),
        logger: silentLogger,
        runCollectorCycle: async () => {
          order.push('collector-start');
          await collector;
          order.push('collector-end');
        },
        lookupOpenPosition: () => false,
        executePositionStep: (mint) => {
          order.push(`position-${mint}`);
          return Promise.resolve();
        },
        executeExitStep: (mint) => {
          order.push(`exit-${mint}`);
          return Promise.resolve();
        },
      },
    });
    await Promise.resolve();
    expect(order).toEqual(['collector-start']);
    releaseCollector?.();
    const result = await running;
    expect(result.ok).toBe(true);
    expect(order).toEqual(['collector-start', 'collector-end', `position-${mintA}`, `position-${mintB}`]);
  });

  it('uses the open-position snapshot and never same-cycle close/reopen', async () => {
    const mintA = mintAt(3);
    const mintB = mintAt(4);
    const position: string[] = [];
    const exit: string[] = [];
    await runProductionCycle({
      cycleNumber: 1,
      consecutiveFailedCycles: 0,
      config: loadProductionConfig(
        productionEnv({
          PROD20_COLLECTOR_ENABLED: 'false',
          PROD20_PAPER_ENABLED: 'true',
          PROD20_PAPER_MINTS: `${mintA},${mintB}`,
        }),
      ),
      dependencies: {
        clock: createFakeClock(),
        logger: silentLogger,
        lookupOpenPosition: (mint) => mint === mintA,
        executePositionStep: (mint) => {
          position.push(mint);
          return Promise.resolve();
        },
        executeExitStep: (mint) => {
          exit.push(mint);
          return Promise.resolve();
        },
      },
    });
    expect(exit).toEqual([mintA]);
    expect(position).toEqual([mintB]);
  });
});
