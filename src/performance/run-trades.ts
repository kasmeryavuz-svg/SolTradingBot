import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraPerformanceArguments,
  executePerformanceTrades,
  preparePerformanceCommand,
} from './command.js';
import { formatPerformanceTradeLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = preparePerformanceCommand(process.env);
  assertNoExtraPerformanceArguments(process.argv, 'performance:trades');
  const report = executePerformanceTrades(config);
  for (const line of formatPerformanceTradeLines(report, config.performance.tradeLimit)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
