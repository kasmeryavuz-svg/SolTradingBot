import type { EnvSource } from '../config/env-source.js';
import { loadRecoveryWatcherConfig } from './config.js';
import { RecoveryWatcherError } from './errors.js';
import type { RecoveryWatcherConfig } from './types.js';

export function prepareRecoveryStatusCommand(source: EnvSource): RecoveryWatcherConfig {
  return loadRecoveryWatcherConfig(source);
}

export function assertNoExtraRecoveryArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new RecoveryWatcherError(`Unexpected extra arguments. Usage: npm run ${command}.`, {
      code: 'configuration',
    });
  }
}
