import { config as loadDotenv } from 'dotenv';
import { assertNoExtraWalletArguments, executeWalletVerify } from './command.js';
import { formatWalletVerifyLines } from './format.js';
import { formatWalletError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraWalletArguments(process.argv, 'wallet:verify');
  const report = await executeWalletVerify(process.env);
  for (const line of formatWalletVerifyLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatWalletError(error));
  process.exitCode = 1;
}
