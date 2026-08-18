import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraOptimizationArguments,
  executeOptimizationCatalog,
  prepareOptimizationCatalogCommand,
} from './command.js';
import { formatOptimizationCatalogLines } from './format.js';

loadDotenv({ quiet: true });

try {
  prepareOptimizationCatalogCommand(process.env);
  assertNoExtraOptimizationArguments(process.argv, 'optimization:catalog');
  executeOptimizationCatalog();
  for (const line of formatOptimizationCatalogLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
