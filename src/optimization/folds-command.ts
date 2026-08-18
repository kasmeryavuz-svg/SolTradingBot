import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraOptimizationArguments,
  executeOptimizationFolds,
  prepareOptimizationCommand,
} from './command.js';
import { formatOptimizationFoldLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareOptimizationCommand(process.env);
  assertNoExtraOptimizationArguments(process.argv, 'optimization:folds');
  const report = executeOptimizationFolds(config);
  for (const line of formatOptimizationFoldLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
