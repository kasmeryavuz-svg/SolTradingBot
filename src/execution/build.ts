import { config as loadDotenv } from 'dotenv';
import { assertNoExtraExecutionArguments, readJupiterApiKey, runExecutionBuild } from './command.js';
import { formatExecutionBuildLines } from './format.js';
import { formatExecutionError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraExecutionArguments(process.argv, 'execution:build');
  const report = await runExecutionBuild(process.env);
  for (const line of formatExecutionBuildLines(report)) {
    console.log(line);
  }
  if (report.status !== 'build_validated') {
    process.exitCode = 1;
  }
} catch (error: unknown) {
  const apiKey = readJupiterApiKey(process.env);
  console.error(formatExecutionError(error, apiKey === undefined ? [] : [apiKey]));
  process.exitCode = 1;
}
