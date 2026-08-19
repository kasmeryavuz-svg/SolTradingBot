import { config as loadDotenv } from 'dotenv';
import { sanitizeProductionErrorMessage } from './sanitizer.js';
import { runProductionSupervisor } from './supervisor.js';

loadDotenv({ quiet: true });

try {
  const code = await runProductionSupervisor(process.env);
  process.exitCode = code;
} catch (error: unknown) {
  console.error(sanitizeProductionErrorMessage(error));
  process.exitCode = 1;
}
