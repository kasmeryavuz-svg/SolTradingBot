import { config as loadDotenv } from 'dotenv';
import { assertNoExtraExecutionArguments, readJupiterApiKey, runExecutionSimulate } from './command.js';
import { formatExecutionSimulateLines } from './format.js';
import { formatExecutionError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraExecutionArguments(process.argv, 'execution:simulate');
  const report = await runExecutionSimulate(process.env);
  for (const line of formatExecutionSimulateLines(report)) {
    console.log(line);
  }
  if (report.status !== 'simulation_passed') {
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const apiKey = readJupiterApiKey(process.env);
  const rpcUrl = process.env['SOLANA_RPC_URL'];
  const secrets = [
    ...(apiKey === undefined ? [] : [apiKey]),
    ...(rpcUrl === undefined || rpcUrl.trim() === '' ? [] : [rpcUrl]),
  ];
  console.error(formatExecutionError(error, secrets));
  process.exitCode = 1;
}
