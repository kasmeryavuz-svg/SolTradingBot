import type { CoreAppConfig } from '../config/core-types.js';
import type { EnvSource } from '../config/env-source.js';
import { loadCoreConfig } from '../config/load-core-config.js';
import { assertTradingDisabled } from '../core/safety.js';
import { PersistenceError } from './types.js';

export function preparePersistenceCommand(source: EnvSource): CoreAppConfig {
  const config = loadCoreConfig(source);
  assertTradingDisabled(config);

  if (!config.database.enabled) {
    throw new PersistenceError(
      'Persistence is disabled. Set DATABASE_ENABLED=true to run this command.',
    );
  }

  return config;
}
