import { config as loadDotenv } from 'dotenv';
import { prepareRecoveryStatusCommand, assertNoExtraRecoveryArguments } from './command.js';
import { RecoveryWatcherError } from './errors.js';
import { formatRecoveryStatusLines } from './format.js';
import { sanitizeRecoveryErrorMessage } from './sanitizer.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraRecoveryArguments(process.argv, 'recovery:status');
  const config = prepareRecoveryStatusCommand(process.env);
  for (const line of formatRecoveryStatusLines(config)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message =
    error instanceof RecoveryWatcherError ? error.message : sanitizeRecoveryErrorMessage(error);
  console.error(message);
  process.exitCode = 1;
}
