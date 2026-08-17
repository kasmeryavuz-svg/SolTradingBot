import { config as loadDotenv } from 'dotenv';
import { assertNoExtraWalletArguments, executeWalletStatus } from './command.js';
import { formatWalletStatusLines } from './format.js';
import { formatWalletError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraWalletArguments(process.argv, 'wallet:status');
  const report = executeWalletStatus(process.env);
  for (const line of formatWalletStatusLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatWalletError(error));
  process.exitCode = 1;
}
