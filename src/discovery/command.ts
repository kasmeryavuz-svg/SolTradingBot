import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled } from '../core/safety.js';

export function prepareDiscoveryCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);

  if (!config.discovery.enabled) {
    throw new Error('Discovery is disabled. Set DISCOVERY_ENABLED=true to run this command.');
  }

  return config;
}
