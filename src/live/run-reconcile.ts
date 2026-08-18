import { config as loadDotenv } from 'dotenv';
import { runLiveReconcile } from './command.js';
import { formatLiveReceiptLines } from './format.js';
import { formatLiveError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  const report = await runLiveReconcile(process.env, process.argv);
  for (const line of formatLiveReceiptLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatLiveError(error));
  process.exitCode = 1;
}
