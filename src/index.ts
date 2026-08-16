import { config as loadDotenv } from 'dotenv';
import { startApp } from './core/app.js';

loadDotenv({ quiet: true });

try {
  startApp(process.env);
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
