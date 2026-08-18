import { config as loadDotenv } from 'dotenv';
import { runLiveHistory } from './command.js';
import { formatLiveHistoryLines } from './format.js';
import { formatLiveError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  const entries = runLiveHistory(process.env, process.argv);
  for (const line of formatLiveHistoryLines(entries)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatLiveError(error));
  process.exitCode = 1;
}
