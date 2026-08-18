import { config as loadDotenv } from 'dotenv';
import { assertNoExtraMlArguments, prepareMlCommand } from './cli.js';
import { executeMlFolds } from './pipeline.js';
import { formatMlFoldLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareMlCommand(process.env);
  assertNoExtraMlArguments(process.argv, 'ml:folds');
  const report = executeMlFolds(config);
  for (const line of formatMlFoldLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
