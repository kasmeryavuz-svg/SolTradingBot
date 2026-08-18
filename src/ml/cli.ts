import type { EnvSource } from '../config/types.js';
import { MlError } from './errors.js';
import { assertMlTradingDisabled, loadMlDatabaseConfig, type MlRuntimeConfig } from './env.js';

export function prepareMlStatusCommand(source: EnvSource): void {
  assertMlTradingDisabled(source);
}

export function prepareMlCommand(source: EnvSource): MlRuntimeConfig {
  assertMlTradingDisabled(source);
  const database = loadMlDatabaseConfig(source);
  if (!database.enabled) {
    throw new MlError('Persistence is disabled. Set DATABASE_ENABLED=true to run this ML command.');
  }
  return { database };
}

export function assertNoExtraMlArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new MlError(
      `Unexpected extra arguments. Usage: npm run ${command}. ML commands do not accept date, token, threshold, or live flags.`,
    );
  }
}
