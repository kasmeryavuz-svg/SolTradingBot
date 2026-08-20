import { config as loadDotenv } from 'dotenv';
import { prepareRecoveryReportCommand, assertNoExtraRecoveryArguments } from './command.js';
import { RecoveryWatcherError } from './errors.js';
import { formatRecoveryReportLines } from './report.js';
import { sanitizeRecoveryErrorMessage } from './sanitizer.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraRecoveryArguments(process.argv, 'recovery:report');
  const config = prepareRecoveryReportCommand(process.env);
  for (const line of formatRecoveryReportLines(config)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message =
    error instanceof RecoveryWatcherError ? error.message : sanitizeRecoveryErrorMessage(error);
  console.error(message);
  process.exitCode = 1;
}
