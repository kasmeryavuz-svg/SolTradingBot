import { config as loadDotenv } from 'dotenv';
import { assertNoExtraWalletArguments, executeWalletSignTest } from './command.js';
import { formatWalletSignTestLines } from './format.js';
import { formatWalletError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraWalletArguments(process.argv, 'wallet:sign-test');
  const proof = await executeWalletSignTest(process.env);
  for (const line of formatWalletSignTestLines(proof)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatWalletError(error));
  process.exitCode = 1;
}
