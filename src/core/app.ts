import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { printStartupBanner } from './banner.js';
import { assertTradingDisabled } from './safety.js';

export function startApp(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);
  printStartupBanner(config);
  return config;
}
