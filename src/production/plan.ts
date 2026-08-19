import { config as loadDotenv } from 'dotenv';
import { loadProductionConfig } from './config.js';
import { formatProductionPlanLines } from './format.js';
import { sanitizeProductionErrorMessage } from './sanitizer.js';

loadDotenv({ quiet: true });

try {
  const config = loadProductionConfig(process.env);
  for (const line of formatProductionPlanLines(config)) {
    console.log(line);
  }
} catch (error: unknown) {
  console.error(sanitizeProductionErrorMessage(error));
  process.exitCode = 1;
}
