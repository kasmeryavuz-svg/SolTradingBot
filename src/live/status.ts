import { config as loadDotenv } from 'dotenv';
import { runLiveStatus } from './command.js';
import { formatLiveStatusLines } from './format.js';
import { formatLiveError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  const report = runLiveStatus(process.env, process.argv);
  for (const line of formatLiveStatusLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatLiveError(error));
  process.exitCode = 1;
}
