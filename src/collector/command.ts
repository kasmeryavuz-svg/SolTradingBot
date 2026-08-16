import type { AppConfig, EnvSource } from '../config/types.js';
import { preparePersistenceCommand } from '../persistence/command.js';

export function prepareCollectorCommand(source: EnvSource): AppConfig {
  const config = preparePersistenceCommand(source);

  if (!config.discovery.enabled) {
    throw new Error('Discovery is disabled. Set DISCOVERY_ENABLED=true to run this command.');
  }

  return config;
}
