import { config as loadDotenv } from 'dotenv';
import { assertNoExtraOptimizationArguments, prepareOptimizationCatalogCommand } from './command.js';
import { formatOptimizationStatusLines } from './format.js';

loadDotenv({ quiet: true });

try {
  prepareOptimizationCatalogCommand(process.env);
  assertNoExtraOptimizationArguments(process.argv, 'optimization:status');
  for (const line of formatOptimizationStatusLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
