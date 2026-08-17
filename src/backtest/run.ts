import { config as loadDotenv } from 'dotenv';
import { prepareBacktestCommand, executeHistoricalBacktest } from './command.js';
import { formatBacktestLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareBacktestCommand(process.env);
  const result = executeHistoricalBacktest(config, process.argv);
  for (const line of formatBacktestLines(result)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
