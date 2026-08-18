import {
  DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
  DEFAULT_DATABASE_ENABLED,
  DEFAULT_DATABASE_PATH,
  DEFAULT_TRADING_ENABLED,
} from '../config/defaults.js';
import type { DatabaseConfig, EnvSource } from '../config/types.js';
import {
  ConfigError,
  parseBooleanFlag,
  parsePositiveInteger,
  readOptionalEnv,
} from '../utils/parse-env.js';
import { MlError } from './errors.js';

export type MlRuntimeConfig = {
  database: DatabaseConfig;
};

export function assertMlTradingDisabled(source: EnvSource): void {
  const tradingEnabled = parseBooleanFlag(
    readOptionalEnv(source, 'TRADING_ENABLED'),
    DEFAULT_TRADING_ENABLED,
    'TRADING_ENABLED',
  );
  if (tradingEnabled) {
    throw new MlError(
      'Refusing to start because TRADING_ENABLED=true. Checkpoint 19 ML commands do not trade. Set TRADING_ENABLED=false to continue.',
    );
  }
}

function parseMlDatabasePath(raw: string | undefined, fallback: string): string {
  if (raw === undefined) {
    return fallback;
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw new ConfigError('Invalid DATABASE_PATH. Expected a file path or :memory:.');
  }
  return trimmed;
}

export function loadMlDatabaseConfig(source: EnvSource): DatabaseConfig {
  return {
    enabled: parseBooleanFlag(
      readOptionalEnv(source, 'DATABASE_ENABLED'),
      DEFAULT_DATABASE_ENABLED,
      'DATABASE_ENABLED',
    ),
    path: parseMlDatabasePath(source['DATABASE_PATH'], DEFAULT_DATABASE_PATH),
    busyTimeoutMs: parsePositiveInteger(
      readOptionalEnv(source, 'DATABASE_BUSY_TIMEOUT_MS'),
      DEFAULT_DATABASE_BUSY_TIMEOUT_MS,
      'DATABASE_BUSY_TIMEOUT_MS',
    ),
  };
}
