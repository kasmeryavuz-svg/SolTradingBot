import type { EnvSource } from '../config/env-source.js';
import {
  parseBooleanFlag,
  parseIntegerInInclusiveRange,
  readOptionalEnv,
} from '../utils/parse-env.js';
import {
  DEFAULT_DATABASE_ENABLED,
  DEFAULT_DATABASE_PATH,
  DEFAULT_DISCOVERY_ENABLED,
  DEFAULT_LIVE_BROADCAST_ENABLED,
  DEFAULT_TRADING_ENABLED,
} from '../config/defaults.js';
import {
  DEFAULT_PROD20_COLLECTOR_ENABLED,
  DEFAULT_PROD20_ENABLED,
  DEFAULT_PROD20_HEALTH_PORT,
  DEFAULT_PROD20_INTERVAL_MS,
  DEFAULT_PROD20_PAPER_ENABLED,
  PROD20_HEALTH_HOST,
  PROD20_HEALTH_PORT_MAX,
  PROD20_HEALTH_PORT_MIN,
  PROD20_INTERVAL_MS_MAX,
  PROD20_INTERVAL_MS_MIN,
} from './constants.js';
import { ProductionError } from './errors.js';
import type { ProductionRuntimeConfig, ProductionWorkMode } from './types.js';
import { parseProductionWatchlist } from './watchlist.js';

export type LoadProductionConfigOptions = {
  requireEnabled?: boolean;
  requireWork?: boolean;
};

export function loadProductionConfig(
  source: EnvSource,
  options: LoadProductionConfigOptions = {},
): ProductionRuntimeConfig {
  const enabled = parseBooleanFlag(
    readOptionalEnv(source, 'PROD20_ENABLED'),
    DEFAULT_PROD20_ENABLED,
    'PROD20_ENABLED',
  );
  if (options.requireEnabled === true && !enabled) {
    throw new ProductionError(
      'production_disabled',
      'prod:run requires PROD20_ENABLED=true. Status, plan, and preflight do not.',
    );
  }

  const collectorEnabled = parseBooleanFlag(
    readOptionalEnv(source, 'PROD20_COLLECTOR_ENABLED'),
    DEFAULT_PROD20_COLLECTOR_ENABLED,
    'PROD20_COLLECTOR_ENABLED',
  );
  const paperEnabled = parseBooleanFlag(
    readOptionalEnv(source, 'PROD20_PAPER_ENABLED'),
    DEFAULT_PROD20_PAPER_ENABLED,
    'PROD20_PAPER_ENABLED',
  );

  let intervalMs: number;
  try {
    intervalMs = parseIntegerInInclusiveRange(
      readOptionalEnv(source, 'PROD20_INTERVAL_MS'),
      DEFAULT_PROD20_INTERVAL_MS,
      'PROD20_INTERVAL_MS',
      PROD20_INTERVAL_MS_MIN,
      PROD20_INTERVAL_MS_MAX,
    );
  } catch (error: unknown) {
    throw new ProductionError(
      'invalid_interval',
      error instanceof Error
        ? error.message
        : 'Invalid PROD20_INTERVAL_MS. Expected an integer from 60000 to 3600000.',
      { cause: error },
    );
  }

  let healthPort: number;
  try {
    healthPort = parseIntegerInInclusiveRange(
      readOptionalEnv(source, 'PROD20_HEALTH_PORT'),
      DEFAULT_PROD20_HEALTH_PORT,
      'PROD20_HEALTH_PORT',
      PROD20_HEALTH_PORT_MIN,
      PROD20_HEALTH_PORT_MAX,
    );
  } catch (error: unknown) {
    throw new ProductionError(
      'invalid_health_port',
      error instanceof Error ? error.message : 'Invalid PROD20_HEALTH_PORT.',
      { cause: error },
    );
  }

  const paperMints = parseProductionWatchlist(readOptionalEnv(source, 'PROD20_PAPER_MINTS'), paperEnabled);
  const workMode = resolveWorkMode(collectorEnabled, paperEnabled);
  if ((options.requireWork === true || options.requireEnabled === true) && workMode === 'NONE') {
    throw new ProductionError(
      'no_production_work_enabled',
      'prod20 refuses to start when collector and paper are both disabled.',
    );
  }

  return {
    enabled,
    intervalMs,
    collectorEnabled,
    paperEnabled,
    paperMints,
    healthPort,
    healthHost: PROD20_HEALTH_HOST,
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
    databaseEnabled: parseBooleanFlag(
      readOptionalEnv(source, 'DATABASE_ENABLED'),
      DEFAULT_DATABASE_ENABLED,
      'DATABASE_ENABLED',
    ),
    databasePath: readOptionalEnv(source, 'DATABASE_PATH') ?? DEFAULT_DATABASE_PATH,
    discoveryEnabled: parseBooleanFlag(
      readOptionalEnv(source, 'DISCOVERY_ENABLED'),
      DEFAULT_DISCOVERY_ENABLED,
      'DISCOVERY_ENABLED',
    ),
    workMode,
  };
}

export function resolveWorkMode(
  collectorEnabled: boolean,
  paperEnabled: boolean,
): ProductionWorkMode {
  if (collectorEnabled && paperEnabled) {
    return 'DATA_AND_PAPER';
  }
  if (collectorEnabled) {
    return 'DATA_ONLY';
  }
  if (paperEnabled) {
    return 'PAPER_ONLY';
  }
  return 'NONE';
}
