import { existsSync } from 'node:fs';
import { join } from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductionError } from '../src/production/errors.js';
import { runProductionSupervisor } from '../src/production/supervisor.js';
import { PROD20_LOCK_FILE_NAME } from '../src/production/constants.js';
import { initTempDatabase, productionEnv } from './production-fixtures.js';

describe('production live safety', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    { TRADING_ENABLED: 'true' },
    { LIVE_BROADCAST_ENABLED: 'true' },
    { TRADING_ENABLED: 'true', LIVE_BROADCAST_ENABLED: 'true' },
  ])('fails closed before network, db write, or lock when %o', async (flags) => {
    const { directory, path } = initTempDatabase();
    vi.stubGlobal('fetch', () => {
      throw new Error('network');
    });
    vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('network');
    });
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('network');
    });
    let collector = 0;
    await expect(
      runProductionSupervisor(productionEnv({ DATABASE_PATH: path, ...flags }), {
        skipPreflight: true,
        lockDirectory: directory,
        skipHealth: true,
        installSignals: false,
        runCollectorCycle: () => {
          collector += 1;
          return Promise.resolve();
        },
      }),
    ).rejects.toBeInstanceOf(ProductionError);
    expect(collector).toBe(0);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
  });
});
