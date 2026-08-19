import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_RW0_DATABASE_BUSY_TIMEOUT_MS, RW0_MEMORY_DATABASE_PATH, RW0_SCHEMA_VERSION } from '../constants.js';
import { assertRecoveryDatabasePathIsolated } from '../config.js';
import { RecoveryWatcherError } from '../errors.js';
import type { RecoveryWatcherConfig } from '../types.js';
import { applyRecoveryMigrations, assertRecoveryMigrationIntegrity } from './migrations.js';

export type OpenRecoverySqliteOptions = {
  configuredProductionPath: string;
  busyTimeoutMs?: number;
};

export function resolveRecoveryDatabasePath(path: string): string {
  return path === RW0_MEMORY_DATABASE_PATH ? RW0_MEMORY_DATABASE_PATH : resolve(path);
}

export function openRecoverySqlite(path: string, options?: OpenRecoverySqliteOptions): DatabaseSync {
  if (options === undefined || typeof options.configuredProductionPath !== 'string' || options.configuredProductionPath.trim() === '') {
    throw new RecoveryWatcherError(
      'Opening a recovery file database requires configuredProductionPath. Isolation is not optional.',
      { code: 'configuration' },
    );
  }
  if (path.trim() === RW0_MEMORY_DATABASE_PATH) {
    throw new RecoveryWatcherError(
      'RW0_DATABASE_PATH=:memory: is not allowed on the runtime file-open API. Tests must use openRecoveryMemoryDatabase.',
      { code: 'configuration' },
    );
  }
  assertRecoveryDatabasePathIsolated(path, {
    configuredProductionPath: options.configuredProductionPath,
  });
  const location = resolveRecoveryDatabasePath(path);
  mkdirSync(dirname(location), { recursive: true });
  try {
    const database = new DatabaseSync(location, {
      timeout: options.busyTimeoutMs ?? DEFAULT_RW0_DATABASE_BUSY_TIMEOUT_MS,
      enableForeignKeyConstraints: true,
    });
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA journal_mode = WAL');
    return database;
  } catch (error: unknown) {
    throw new RecoveryWatcherError('Recovery Watcher database unavailable. Could not open the isolated SQLite file.', {
      code: 'database_unavailable',
      cause: error,
    });
  }
}

export function openRecoverySqliteFromConfig(
  config: RecoveryWatcherConfig,
  busyTimeoutMs: number = DEFAULT_RW0_DATABASE_BUSY_TIMEOUT_MS,
): DatabaseSync {
  return openRecoverySqlite(config.databasePath, {
    configuredProductionPath: config.configuredProductionDatabasePath,
    busyTimeoutMs,
  });
}

export function openRecoveryMemoryDatabase(
  busyTimeoutMs: number = DEFAULT_RW0_DATABASE_BUSY_TIMEOUT_MS,
): DatabaseSync {
  try {
    const database = new DatabaseSync(RW0_MEMORY_DATABASE_PATH, {
      timeout: busyTimeoutMs,
      enableForeignKeyConstraints: true,
    });
    database.exec('PRAGMA foreign_keys = ON');
    return database;
  } catch (error: unknown) {
    throw new RecoveryWatcherError('Recovery Watcher database unavailable. Could not open the isolated SQLite file.', {
      code: 'database_unavailable',
      cause: error,
    });
  }
}

export function initializeRecoveryDatabase(database: DatabaseSync): number {
  const version = applyRecoveryMigrations(database);
  if (version !== RW0_SCHEMA_VERSION) {
    throw new RecoveryWatcherError(
      `Recovery Watcher schema must be ${String(RW0_SCHEMA_VERSION)}. Found ${String(version)}.`,
      { code: 'schema_mismatch' },
    );
  }
  return version;
}

export function assertRecoverySchema(database: DatabaseSync): void {
  assertRecoveryMigrationIntegrity(database);
}
