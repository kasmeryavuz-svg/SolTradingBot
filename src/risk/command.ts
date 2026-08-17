import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { assertTradingDisabled } from '../core/safety.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { RiskScanError } from './types.js';

export function prepareRiskCheckCommand(source: EnvSource): AppConfig {
  const config = loadConfig(source);
  assertTradingDisabled(config);
  return config;
}

export function prepareRiskRecordCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function prepareRiskHistoryCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function requireRiskMintArgument(argv: readonly string[], command: string): string {
  const mint = argv[2];
  if (mint === undefined || mint.trim() === '') {
    throw new RiskScanError(`Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const trimmed = mint.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new RiskScanError(
      'Invalid token mint. Provide a syntactically plausible Solana mint address.',
    );
  }

  return trimmed;
}
