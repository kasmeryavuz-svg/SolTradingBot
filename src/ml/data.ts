import { config as loadDotenv } from 'dotenv';
import { assertNoExtraMlArguments, executeMlData, prepareMlCommand } from './command.js';
import { formatMlDataLines } from './format-data.js';

loadDotenv({ quiet: true });

try {
  const config = prepareMlCommand(process.env);
  assertNoExtraMlArguments(process.argv, 'ml:data');
  const dataset = executeMlData(config);
  for (const line of formatMlDataLines(dataset)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
