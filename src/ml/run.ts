import { config as loadDotenv } from 'dotenv';
import { assertNoExtraMlArguments, prepareMlCommand } from './cli.js';
import { executeMlRun } from './pipeline.js';
import { formatMlRunLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareMlCommand(process.env);
  assertNoExtraMlArguments(process.argv, 'ml:run');
  const report = executeMlRun(config);
  for (const line of formatMlRunLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
