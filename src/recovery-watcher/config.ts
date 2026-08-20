import { existsSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { DEFAULT_DATABASE_PATH, DEFAULT_LIVE_BROADCAST_ENABLED, DEFAULT_TRADING_ENABLED } from '../config/defaults.js';
import type { EnvSource } from '../config/env-source.js';
import { parseBooleanFlag, readOptionalEnv } from '../utils/parse-env.js';
import {
  DEFAULT_RW0_DATABASE_PATH,
  FORBIDDEN_PRODUCTION_DATABASE_PATH,
  RW0_MEMORY_DATABASE_PATH,
  RW0_NETWORK_TIMEOUT_MS,
  RW0_SCREENING_MAX_CANDIDATES,
} from './constants.js';
import { RecoveryWatcherError } from './errors.js';
import type { RecoveryWatcherConfig } from './types.js';
import { assertRecoveryLiveGatesClosed } from './gates.js';

export type RecoveryDatabaseIsolationOptions = {
  configuredProductionPath: string;
};

export function loadRecoveryWatcherConfig(source: EnvSource): RecoveryWatcherConfig {
  assertRecoveryLiveGatesClosed(source);
  const databasePath = readOptionalEnv(source, 'RW0_DATABASE_PATH') ?? DEFAULT_RW0_DATABASE_PATH;
  if (databasePath.trim() === RW0_MEMORY_DATABASE_PATH) {
    throw new RecoveryWatcherError(
      'RW0_DATABASE_PATH=:memory: is not allowed in runtime config. Isolated file databases only. Tests must use openRecoveryMemoryDatabase.',
      { code: 'configuration' },
    );
  }
  const configuredProductionDatabasePath = parseConfiguredProductionDatabasePath(
    readOptionalEnv(source, 'DATABASE_PATH'),
  );
  assertRecoveryDatabasePathIsolated(databasePath, {
    configuredProductionPath: configuredProductionDatabasePath,
  });
  return {
    tradingEnabled: parseBooleanFlag(
      readOptionalEnv(source, 'TRADING_ENABLED'),
      DEFAULT_TRADING_ENABLED,
      'TRADING_ENABLED',
    ),
    liveBroadcastEnabled: parseBooleanFlag(
      readOptionalEnv(source, 'LIVE_BROADCAST_ENABLED'),
      DEFAULT_LIVE_BROADCAST_ENABLED,
      'LIVE_BROADCAST_ENABLED',
    ),
    databasePath,
    configuredProductionDatabasePath,
    networkTimeoutMs: RW0_NETWORK_TIMEOUT_MS,
    screeningMaxCandidates: RW0_SCREENING_MAX_CANDIDATES,
  };
}

export function parseConfiguredProductionDatabasePath(raw: string | undefined): string {
  if (raw === undefined) {
    return DEFAULT_DATABASE_PATH;
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new RecoveryWatcherError('Invalid DATABASE_PATH. Expected a file path or :memory:.', {
      code: 'configuration',
    });
  }
  return trimmed;
}

export function assertRecoveryDatabasePathIsolated(
  path: string,
  options: RecoveryDatabaseIsolationOptions,
): void {
  if (options.configuredProductionPath.trim() === '') {
    throw new RecoveryWatcherError(
      'Opening a recovery file database requires configuredProductionPath. Isolation is not optional.',
      { code: 'configuration' },
    );
  }
  if (path.trim() === RW0_MEMORY_DATABASE_PATH) {
    throw new RecoveryWatcherError(
      'RW0_DATABASE_PATH=:memory: is not allowed. Isolated file databases only. Tests must use openRecoveryMemoryDatabase.',
      { code: 'configuration' },
    );
  }
  const candidates = [
    FORBIDDEN_PRODUCTION_DATABASE_PATH,
    DEFAULT_DATABASE_PATH,
    ...(options.configuredProductionPath === RW0_MEMORY_DATABASE_PATH ? [] : [options.configuredProductionPath]),
  ];
  for (const productionPath of candidates) {
    if (sameDatabaseIdentity(path, productionPath)) {
      throw new RecoveryWatcherError(
        'RW0_DATABASE_PATH must not be the production SQLite file. Use ./data/recovery-watcher.sqlite or another isolated path.',
        { code: 'production_database_path' },
      );
    }
  }
}

export function sameDatabaseIdentity(left: string, right: string): boolean {
  if (left === RW0_MEMORY_DATABASE_PATH || right === RW0_MEMORY_DATABASE_PATH) {
    return false;
  }
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);
  if (pathsEqual(resolvedLeft, resolvedRight)) {
    return true;
  }
  if (!existsSync(resolvedLeft) || !existsSync(resolvedRight)) {
    return false;
  }
  try {
    if (pathsEqual(realpathSync(resolvedLeft), realpathSync(resolvedRight))) {
      return true;
    }
  } catch {
    // Fall through to inode comparison when realpath is unavailable.
  }
  try {
    const leftStat = statSync(resolvedLeft);
    const rightStat = statSync(resolvedRight);
    if (leftStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function pathsEqual(left: string, right: string): boolean {
  if (left === right) {
    return true;
  }
  return process.platform === 'win32' && left.toLowerCase() === right.toLowerCase();
}
