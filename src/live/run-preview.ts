import { config as loadDotenv } from 'dotenv';
import { runLivePreview } from './command.js';
import { formatLivePreviewLines } from './format.js';
import { formatLiveError } from './sanitize.js';

loadDotenv({ quiet: true });

try {
  const report = await runLivePreview(process.env, process.argv);
  for (const line of formatLivePreviewLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(formatLiveError(error));
  process.exitCode = 1;
}
