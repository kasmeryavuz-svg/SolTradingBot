import { config as loadDotenv } from 'dotenv';
import { formatProductionPreflightLines } from './format.js';
import { runProductionPreflight } from './preflight.js';
import { sanitizeProductionErrorMessage } from './sanitizer.js';

loadDotenv({ quiet: true });

try {
  runProductionPreflight(process.env);
  for (const line of formatProductionPreflightLines()) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(sanitizeProductionErrorMessage(error));
  process.exitCode = 1;
}
