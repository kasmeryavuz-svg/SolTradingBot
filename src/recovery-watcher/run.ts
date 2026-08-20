import { config as loadDotenv } from 'dotenv';
import { prepareRecoveryRunCommand, assertNoExtraRecoveryArguments } from './command.js';
import { RecoveryWatcherError } from './errors.js';
import { formatRecoveryCycleLines } from './format.js';
import { runRecoveryWatcher } from './runtime.js';
import { sanitizeRecoveryErrorMessage } from './sanitizer.js';

loadDotenv({ quiet: true });

const abort = new AbortController();

function requestStop(): void {
  abort.abort();
}

process.once('SIGINT', requestStop);
process.once('SIGTERM', requestStop);

try {
  assertNoExtraRecoveryArguments(process.argv, 'recovery:run');
  const config = prepareRecoveryRunCommand(process.env);
  await runRecoveryWatcher({
    config,
    abort: abort.signal,
    onCycle: (metrics) => {
      for (const line of formatRecoveryCycleLines(metrics)) {
        console.log(line);
      }
    },
  });
} catch (error: unknown) {
  const message =
    error instanceof RecoveryWatcherError ? error.message : sanitizeRecoveryErrorMessage(error);
  console.error(message);
  process.exitCode = 1;
}
