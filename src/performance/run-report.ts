import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraPerformanceArguments,
  executePerformanceReport,
  preparePerformanceCommand,
} from './command.js';
import { formatPerformanceReportLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = preparePerformanceCommand(process.env);
  assertNoExtraPerformanceArguments(process.argv, 'performance:report');
  const report = executePerformanceReport(config);
  for (const line of formatPerformanceReportLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
