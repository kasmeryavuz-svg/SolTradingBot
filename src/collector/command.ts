import type { CoreAppConfig } from '../config/core-types.js';
import type { EnvSource } from '../config/env-source.js';
import { preparePersistenceCommand } from '../persistence/command.js';

export function prepareCollectorCommand(source: EnvSource): CoreAppConfig {
  const config = preparePersistenceCommand(source);

  if (!config.discovery.enabled) {
    throw new Error('Discovery is disabled. Set DISCOVERY_ENABLED=true to run this command.');
  }

  return config;
}
