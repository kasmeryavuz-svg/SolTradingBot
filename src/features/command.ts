import { loadConfig } from '../config/load-config.js';
import type { CoreAppConfig } from '../config/core-types.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled } from '../core/safety.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { FeatureEngineError } from './types.js';

export function prepareFeatureCheckCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);
  return config;
}

export function prepareFeatureRecordCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function prepareFeatureHistoryCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function requireFeatureMintArgument(argv: readonly string[], command: string): string {
  const mint = argv[2];
  if (mint === undefined || mint.trim() === '') {
    throw new FeatureEngineError(`Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const trimmed = mint.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new FeatureEngineError(
      'Invalid token mint. Provide a syntactically plausible Solana mint address.',
    );
  }

  return trimmed;
}
