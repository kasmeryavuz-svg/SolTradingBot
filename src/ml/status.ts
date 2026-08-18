import { config as loadDotenv } from 'dotenv';
import { assertNoExtraMlArguments, prepareMlStatusCommand } from './cli.js';
import { formatMlStatusLines } from './format.js';

loadDotenv({ quiet: true });

try {
  prepareMlStatusCommand(process.env);
  assertNoExtraMlArguments(process.argv, 'ml:status');
  for (const line of formatMlStatusLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
