import type { CoreAppConfig } from '../config/core-types.js';
import type { EnvSource } from '../config/env-source.js';
import { preparePersistenceCommand } from '../persistence/command.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import { PaperError } from './types.js';

export function preparePaperStepCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function preparePaperHistoryCommand(source: EnvSource): CoreAppConfig {
  return preparePersistenceCommand(source);
}

export function requirePaperMintArgument(argv: readonly string[], command: string): string {
  const extras = argv.slice(3).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new PaperError(`Unexpected extra arguments. Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const mint = argv[2];
  if (mint === undefined || mint.trim() === '') {
    throw new PaperError(`Usage: npm run ${command} -- <TOKEN_MINT>`);
  }

  const trimmed = mint.trim();
  if (!isPlausibleSolanaMint(trimmed)) {
    throw new PaperError('Invalid token mint. Provide a syntactically plausible Solana mint address.');
  }

  return trimmed;
}
