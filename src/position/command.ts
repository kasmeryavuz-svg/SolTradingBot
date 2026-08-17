import type { AppConfig, EnvSource } from '../config/types.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { PositionError } from './types.js';

export function preparePositionStepCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function preparePositionStatusCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function preparePositionHistoryCommand(source: EnvSource): AppConfig {
  return preparePersistenceCommand(source);
}

export function requirePositionMintArgument(argv: readonly string[], command: string): string {
  const extras = argv.slice(3).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new PositionError(`Unexpected extra arguments. Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const mint = argv[2];
  if (mint === undefined || mint.trim() === '') {
    throw new PositionError(`Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const trimmed = mint.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new PositionError('Invalid token mint. Provide a syntactically plausible Solana mint address.');
  }

  return trimmed;
}
