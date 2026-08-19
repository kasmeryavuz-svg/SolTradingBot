import type { CoreAppConfig } from '../config/core-types.js';
import type { EnvSource } from '../config/env-source.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { ExitError } from './types.js';

export function prepareExitStepCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function prepareExitHistoryCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function requireExitMintArgument(argv: readonly string[], command: string): string {
  const extras = argv.slice(3).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new ExitError(`Unexpected extra arguments. Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const mint = argv[2];
  if (mint === undefined || mint.trim() === '') {
    throw new ExitError(`Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const trimmed = mint.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new ExitError('Invalid token mint. Provide a syntactically plausible Solana mint address.');
  }

  return trimmed;
}
