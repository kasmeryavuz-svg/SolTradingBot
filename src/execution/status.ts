import { config as loadDotenv } from 'dotenv';
import { assertNoExtraExecutionArguments, executeExecutionStatus } from './command.js';
import { formatExecutionStatusLines } from './format.js';

loadDotenv({ quiet: true });

try {
  assertNoExtraExecutionArguments(process.argv, 'execution:status');
  const report = executeExecutionStatus(process.env);
  for (const line of formatExecutionStatusLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
