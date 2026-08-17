import { config as loadDotenv } from 'dotenv';
import { readOptionalEnv } from '../utils/parse-env.js';
import { assertNoExtraWalletArguments, runWalletSignPreflight } from './command.js';
import { formatWalletSignPreflightLines } from './format.js';
import { formatWalletError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraWalletArguments(process.argv, 'wallet:sign-preflight');
  const report = await runWalletSignPreflight(process.env);
  for (const line of formatWalletSignPreflightLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const apiKey = readOptionalEnv(process.env, 'JUPITER_API_KEY');
  const rpcUrl = process.env['SOLANA_RPC_URL'];
  const secrets = [
    ...(apiKey === undefined ? [] : [apiKey]),
    ...(rpcUrl === undefined || rpcUrl.trim() === '' ? [] : [rpcUrl]),
  ];
  console.error(formatWalletError(error, secrets));
  process.exitCode = 1;
}
