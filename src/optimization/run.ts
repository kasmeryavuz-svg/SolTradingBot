import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraOptimizationArguments,
  executeOptimizationRun,
  prepareOptimizationCommand,
} from './command.js';
import { formatOptimizationRunLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareOptimizationCommand(process.env);
  assertNoExtraOptimizationArguments(process.argv, 'optimization:run');
  const report = executeOptimizationRun(config);
  for (const line of formatOptimizationRunLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
