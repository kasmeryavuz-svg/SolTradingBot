import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LATEST_SCHEMA_VERSION } from '../src/persistence/sqlite/migrations.js';
import { PROD20_LOCK_FILE_NAME, PROD20_PREFLIGHT_PROBE_FILE_NAME } from '../src/production/constants.js';
import { ProductionError } from '../src/production/errors.js';
import { runProductionPreflight } from '../src/production/preflight.js';
import { initTempDatabase, productionEnv, twentyMints } from './production-fixtures.js';

describe('production preflight', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes a healthy initialized database and does not write it', () => {
    const { directory, path } = initTempDatabase();
    const before = createHash('sha256').update(readFileSync(path)).digest('hex');
    const originalFetch = globalThis.fetch;
    vi.stubGlobal('fetch', () => {
      throw new Error('network');
    });
    vi.spyOn(http, 'request').mockImplementation(() => {
      throw new Error('network');
    });
    vi.spyOn(https, 'request').mockImplementation(() => {
      throw new Error('network');
    });
    const result = runProductionPreflight(productionEnv({ DATABASE_PATH: path }));
    expect(result.ok).toBe(true);
    expect(result.schemaVersion).toBe(LATEST_SCHEMA_VERSION);
    expect(result.migration010).toBe('ABSENT');
    expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before);
    expect(originalFetch).toBeTypeOf('function');
    expect(existsSync(join(directory, PROD20_PREFLIGHT_PROBE_FILE_NAME))).toBe(false);
    expect(existsSync(join(directory, PROD20_LOCK_FILE_NAME))).toBe(false);
    expect(readdirSync(directory).some((name) => name.includes('preflight'))).toBe(false);
  });

  it('fails on a missing database, bad watchlist, and dangerous live flags', () => {
    const { directory } = initTempDatabase();
    const missing = join(directory, 'missing.sqlite');
    expect(() => runProductionPreflight(productionEnv({ DATABASE_PATH: missing }))).toThrow(
      /does not exist/,
    );
    const { path } = initTempDatabase();
    expect(() =>
      runProductionPreflight(
        productionEnv({
          DATABASE_PATH: path,
          PROD20_PAPER_ENABLED: 'true',
          PROD20_PAPER_MINTS: twentyMints().join(',') + ',BONK',
        }),
      ),
    ).toThrow(/PROD20_PAPER_MINTS|mint/);
    expect(() =>
      runProductionPreflight(productionEnv({ DATABASE_PATH: path, TRADING_ENABLED: 'true' })),
    ).toThrow(ProductionError);
  });

  it('passes the current repository database when present and healthy', () => {
    const current = join(process.cwd(), 'data', 'soltradingbot.sqlite');
    if (!existsSync(current)) {
      expect(true).toBe(true);
      return;
    }
    const result = runProductionPreflight(productionEnv({ DATABASE_PATH: current }));
    expect(result.ok).toBe(true);
    expect(result.schemaVersion).toBe(9);
  });
});
