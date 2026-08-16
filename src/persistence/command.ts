import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled } from '../core/safety.js';
import { PersistenceError } from './types.js';

export function preparePersistenceCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);

  if (!config.database.enabled) {
    throw new PersistenceError(
      'Persistence is disabled. Set DATABASE_ENABLED=true to run this command.',
    );
  }

  return config;
}
