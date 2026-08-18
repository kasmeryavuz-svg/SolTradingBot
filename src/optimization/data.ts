import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraOptimizationArguments,
  executeOptimizationData,
  prepareOptimizationCommand,
} from './command.js';
import { formatOptimizationDataLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareOptimizationCommand(process.env);
  assertNoExtraOptimizationArguments(process.argv, 'optimization:data');
  const report = executeOptimizationData(config);
  for (const line of formatOptimizationDataLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
