import { config as loadDotenv } from 'dotenv';
import { executeExitStep } from './execute.js';
import { formatExitStepLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const result = await executeExitStep(process.env, process.argv);
  for (const line of formatExitStepLines(result)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
