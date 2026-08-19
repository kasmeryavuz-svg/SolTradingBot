import { describe, expect, it } from 'vitest';
import { runProductionCycle } from '../src/production/cycle.js';
import { runProductionSupervisor } from '../src/production/supervisor.js';
import { loadProductionConfig } from '../src/production/config.js';
import {
  createFakeClock,
  createRecoverableProviderFailure,
  createSqliteDatabaseFailure,
  initTempDatabase,
  mintAt,
  productionEnv,
} from './production-fixtures.js';
import { PersistenceError } from '../src/persistence/types.js';
import { ProductionError } from '../src/production/errors.js';
import {
  classifyProductionFailure,
  FATAL_PRODUCTION_FAILURE,
  RECOVERABLE_OPERATION_FAILURE,
} from '../src/production/failure.js';
import type { ProductionLogger } from '../src/production/types.js';

const silentLogger: ProductionLogger = { write: () => undefined };

describe('production failure circuit', () => {
  it('shuts down after three consecutive failed cycles', async () => {
    const { directory, path } = initTempDatabase();
    let cycles = 0;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      skipLock: true,
      skipHealth: true,
      installSignals: false,
      lockDirectory: directory,
      runCollectorCycle: () => {
        cycles += 1;
        return Promise.reject(createRecoverableProviderFailure('provider timeout'));
      },
    });
    expect(code).toBe(1);
    expect(cycles).toBe(3);
  });

  it('resets the consecutive counter after a successful cycle', async () => {
    const { directory, path } = initTempDatabase();
    let cycles = 0;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      skipLock: true,
      skipHealth: true,
      installSignals: false,
      stopAfterCycles: 4,
      lockDirectory: directory,
      runCollectorCycle: () => {
        cycles += 1;
        if (cycles === 2) {
          return Promise.resolve();
        }
        return Promise.reject(createRecoverableProviderFailure('provider timeout'));
      },
    });
    expect(code).toBe(0);
    expect(cycles).toBe(4);
  });

  it('continues remaining mints after one mint failure and marks the cycle failed', async () => {
    const mintA = mintAt(5);
    const mintB = mintAt(6);
    const seen: string[] = [];
    const result = await runProductionCycle({
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
        lookupOpenPosition: () => false,
        executePositionStep: (mint) => {
          seen.push(mint);
          if (mint === mintA) {
            return Promise.reject(createRecoverableProviderFailure('market unavailable'));
          }
          return Promise.resolve();
        },
        executeExitStep: () => Promise.resolve(),
      },
    });
    expect(seen).toEqual([mintA, mintB]);
    expect(result.ok).toBe(false);
    expect(result.consecutiveFailedCycles).toBe(1);
  });

  it('classifies sqlite, persistence, and ambiguous errors as fatal and network errors as recoverable', () => {
    expect(classifyProductionFailure(createRecoverableProviderFailure('timeout'))).toBe(
      RECOVERABLE_OPERATION_FAILURE,
    );
    expect(classifyProductionFailure(createSqliteDatabaseFailure('SQLITE_FULL'))).toBe(FATAL_PRODUCTION_FAILURE);
    expect(classifyProductionFailure(new PersistenceError('Integrity check failed.'))).toBe(
      FATAL_PRODUCTION_FAILURE,
    );
    expect(classifyProductionFailure(new Error('something went wrong'))).toBe(FATAL_PRODUCTION_FAILURE);
  });

  it('lets paper continue after a recoverable collector failure', async () => {
    const mint = mintAt(7);
    let paper = 0;
    const result = await runProductionCycle({
      cycleNumber: 1,
      consecutiveFailedCycles: 0,
      config: loadProductionConfig(
        productionEnv({
          PROD20_PAPER_ENABLED: 'true',
          PROD20_PAPER_MINTS: mint,
        }),
      ),
      dependencies: {
        clock: createFakeClock(),
        logger: silentLogger,
        runCollectorCycle: () => Promise.reject(createRecoverableProviderFailure('provider timeout')),
        lookupOpenPosition: () => false,
        executePositionStep: () => {
          paper += 1;
          return Promise.resolve();
        },
        executeExitStep: () => Promise.resolve(),
      },
    });
    expect(paper).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.collectorOk).toBe(false);
  });

  it('stops paper after a collector database-classified failure', async () => {
    const mint = mintAt(8);
    let paper = 0;
    await expect(
      runProductionCycle({
        cycleNumber: 1,
        consecutiveFailedCycles: 0,
        config: loadProductionConfig(
          productionEnv({
            PROD20_PAPER_ENABLED: 'true',
            PROD20_PAPER_MINTS: mint,
          }),
        ),
        dependencies: {
          clock: createFakeClock(),
          logger: silentLogger,
          runCollectorCycle: () => Promise.reject(createSqliteDatabaseFailure('SQLITE_CORRUPT')),
          lookupOpenPosition: () => false,
          executePositionStep: () => {
            paper += 1;
            return Promise.resolve();
          },
          executeExitStep: () => Promise.resolve(),
        },
      }),
    ).rejects.toBeInstanceOf(ProductionError);
    expect(paper).toBe(0);
  });

  it('stops remaining mints after a paper database-classified failure', async () => {
    const mintA = mintAt(9);
    const mintB = mintAt(10);
    const mintC = mintAt(11);
    const seen: string[] = [];
    await expect(
      runProductionCycle({
        cycleNumber: 1,
        consecutiveFailedCycles: 0,
        config: loadProductionConfig(
          productionEnv({
            PROD20_COLLECTOR_ENABLED: 'false',
            PROD20_PAPER_ENABLED: 'true',
            PROD20_PAPER_MINTS: `${mintA},${mintB},${mintC}`,
          }),
        ),
        dependencies: {
          clock: createFakeClock(),
          logger: silentLogger,
          lookupOpenPosition: () => false,
          executePositionStep: (mint) => {
            seen.push(mint);
            if (mint === mintA) {
              return Promise.reject(new PersistenceError('Integrity check failed.'));
            }
            return Promise.resolve();
          },
          executeExitStep: () => Promise.resolve(),
        },
      }),
    ).rejects.toBeInstanceOf(ProductionError);
    expect(seen).toEqual([mintA]);
  });

  it('treats open-position lookup failure as fatal and runs no mint operation', async () => {
    const mint = mintAt(12);
    let position = 0;
    let exit = 0;
    await expect(
      runProductionCycle({
        cycleNumber: 1,
        consecutiveFailedCycles: 0,
        config: loadProductionConfig(
          productionEnv({
            PROD20_COLLECTOR_ENABLED: 'false',
            PROD20_PAPER_ENABLED: 'true',
            PROD20_PAPER_MINTS: mint,
          }),
        ),
        dependencies: {
          clock: createFakeClock(),
          logger: silentLogger,
          lookupOpenPosition: () => {
            throw createSqliteDatabaseFailure('SQLITE_BUSY');
          },
          executePositionStep: () => {
            position += 1;
            return Promise.resolve();
          },
          executeExitStep: () => {
            exit += 1;
            return Promise.resolve();
          },
        },
      }),
    ).rejects.toBeInstanceOf(ProductionError);
    expect(position).toBe(0);
    expect(exit).toBe(0);
  });

  it('exits immediately on a fatal database cycle without waiting three cycles', async () => {
    const { directory, path } = initTempDatabase();
    let cycles = 0;
    const code = await runProductionSupervisor(productionEnv({ DATABASE_PATH: path }), {
      clock: createFakeClock(),
      logger: silentLogger,
      skipPreflight: true,
      skipLock: true,
      skipHealth: true,
      installSignals: false,
      lockDirectory: directory,
      runCollectorCycle: () => {
        cycles += 1;
        return Promise.reject(createSqliteDatabaseFailure('SQLITE_IOERR'));
      },
    });
    expect(code).toBe(1);
    expect(cycles).toBe(1);
  });
});
