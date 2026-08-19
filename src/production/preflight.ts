import { accessSync, constants as fsConstants, existsSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { EnvSource } from '../config/env-source.js';
import { MEMORY_DATABASE_PATH } from '../config/defaults.js';
import {
  FORBIDDEN_MIGRATION_010_PREFIX,
  PROD20_PREFLIGHT_PROBE_FILE_NAME,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
import { loadProductionConfig } from './config.js';
import { ProductionError } from './errors.js';
import { assertProductionDefinitionFingerprint } from './identity.js';
import { inspectProductionLockFile } from './lock.js';
import { systemProcessLiveness } from './liveness.js';
import { assertProductionLiveGatesClosed } from './live-gates.js';
import { assertNodeEngine } from './node-engine.js';
import { currentProcessStartedAtMs } from './process-identity.js';
import type { ProcessLiveness } from './types.js';

export type ProductionPreflightResult = {
  ok: true;
  schemaVersion: number;
  migration010: 'ABSENT';
  lock: 'absent' | 'stale';
};

export function runProductionPreflight(
  source: EnvSource,
  options: { liveness?: ProcessLiveness; pid?: number; processStartedAtMs?: number } = {},
): ProductionPreflightResult {
  assertProductionLiveGatesClosed(source);
  assertNodeEngine();
  assertProductionDefinitionFingerprint();

  const config = loadProductionConfig(source, { requireWork: true });
  if (config.tradingEnabled || config.liveBroadcastEnabled) {
    throw new ProductionError(
      'configuration',
      'Production preflight refuses TRADING_ENABLED=true or LIVE_BROADCAST_ENABLED=true.',
    );
  }
  if (!config.databaseEnabled) {
    throw new ProductionError(
      'configuration',
      'Production preflight requires DATABASE_ENABLED=true because collector and paper persist locally.',
    );
  }
  if (config.collectorEnabled && !config.discoveryEnabled) {
    throw new ProductionError(
      'configuration',
      'PROD20_COLLECTOR_ENABLED=true requires DISCOVERY_ENABLED=true.',
    );
  }
  if (config.databasePath === MEMORY_DATABASE_PATH) {
    throw new ProductionError(
      'configuration',
      'Production persistence must be a SQLite file, not :memory:.',
    );
  }

  const databasePath = resolve(config.databasePath);
  const dataDirectory = dirname(databasePath);
  if (!existsSync(dataDirectory)) {
    throw new ProductionError('preflight_failed', 'Production data directory does not exist.');
  }
  assertDirectoryWritable(dataDirectory);
  if (!existsSync(databasePath)) {
    throw new ProductionError(
      'preflight_failed',
      'Production database file does not exist. Initialize it with db:init before prod:run.',
    );
  }

  const schema = inspectProductionDatabase(databasePath);
  if (schema.schemaVersion !== REQUIRED_SCHEMA_VERSION) {
    throw new ProductionError(
      'preflight_failed',
      `Production requires schema ${String(REQUIRED_SCHEMA_VERSION)}. Found ${String(schema.schemaVersion)}.`,
    );
  }
  if (schema.migration010Present) {
    throw new ProductionError('preflight_failed', 'Migration 010 must remain ABSENT.');
  }
  if (!schema.quickCheckOk) {
    throw new ProductionError('database_integrity', 'PRAGMA quick_check did not report ok.');
  }
  if (!schema.queryOnly) {
    throw new ProductionError('preflight_failed', 'Production preflight requires PRAGMA query_only.');
  }

  const lock = inspectProductionLockFile(dataDirectory, options.liveness ?? systemProcessLiveness(), {
    current: {
      pid: options.pid ?? process.pid,
      processStartedAtMs: options.processStartedAtMs ?? currentProcessStartedAtMs(),
    },
  });
  if (lock.kind === 'active') {
    throw new ProductionError(
      'production_instance_already_running',
      'An active production singleton lock is already present.',
    );
  }
  if (lock.kind === 'malformed') {
    throw new ProductionError(
      'malformed_lock',
      'Production singleton lock is malformed. Refusing to delete it automatically.',
    );
  }
  if (lock.kind === 'unknown_identity') {
    throw new ProductionError(
      'unknown_lock_identity',
      'Production singleton lock has an unknown spec version or fingerprint.',
    );
  }

  return {
    ok: true,
    schemaVersion: schema.schemaVersion,
    migration010: 'ABSENT',
    lock: lock.kind === 'stale' ? 'stale' : 'absent',
  };
}

function assertDirectoryWritable(directory: string): void {
  try {
    accessSync(directory, fsConstants.W_OK);
  } catch (error: unknown) {
    throw new ProductionError('preflight_failed', 'Production data directory is not writable.', {
      cause: error,
    });
  }
  const probe = join(directory, PROD20_PREFLIGHT_PROBE_FILE_NAME);
  try {
    writeFileSync(probe, 'ok');
  } catch (error: unknown) {
    throw new ProductionError('preflight_failed', 'Production data directory is not writable.', {
      cause: error,
    });
  } finally {
    try {
      if (existsSync(probe)) {
        unlinkSync(probe);
      }
    } catch {
      // A leftover probe is never the production lock file. Operators may delete it.
    }
  }
}

function inspectProductionDatabase(path: string): {
  schemaVersion: number;
  migration010Present: boolean;
  quickCheckOk: boolean;
  queryOnly: boolean;
} {
  let database: DatabaseSync;
  try {
    database = new DatabaseSync(path, { readOnly: true });
  } catch (error: unknown) {
    throw new ProductionError('preflight_failed', 'SQLite could not open the production database file.', {
      cause: error,
    });
  }
  try {
    database.exec('PRAGMA query_only = ON');
    const queryOnlyRow = database.prepare('PRAGMA query_only').get();
    const queryOnly = String(Object.values(queryOnlyRow ?? {})[0] ?? '') === '1';
    const quickRow = database.prepare('PRAGMA quick_check').get();
    const quickCheckOk = String(Object.values(quickRow ?? {})[0] ?? '') === 'ok';
    const versionRow = database.prepare('SELECT MAX(version) AS version FROM schema_migrations').get();
    const schemaVersion = Number(versionRow?.['version'] ?? Number.NaN);
    const forbidden = database
      .prepare(
        `SELECT COUNT(*) AS count FROM schema_migrations WHERE version >= 10 OR name LIKE '${FORBIDDEN_MIGRATION_010_PREFIX}%'`,
      )
      .get();
    const migration010Present = Number(forbidden?.['count'] ?? 0) > 0;
    return { schemaVersion, migration010Present, quickCheckOk, queryOnly };
  } catch (error: unknown) {
    if (error instanceof ProductionError) {
      throw error;
    }
    throw new ProductionError('preflight_failed', 'SQLite production validation failed.', { cause: error });
  } finally {
    database.close();
  }
}
