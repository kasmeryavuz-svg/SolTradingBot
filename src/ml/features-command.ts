import { config as loadDotenv } from 'dotenv';
import { assertNoExtraMlArguments, prepareMlStatusCommand } from './cli.js';
import { formatMlFeatureLines } from './format.js';

loadDotenv({ quiet: true });

try {
  prepareMlStatusCommand(process.env);
  assertNoExtraMlArguments(process.argv, 'ml:features');
  for (const line of formatMlFeatureLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
