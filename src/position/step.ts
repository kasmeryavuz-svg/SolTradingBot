import { config as loadDotenv } from 'dotenv';
import { executePositionStep } from './execute.js';
import { formatPositionStepLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const result = await executePositionStep(process.env, process.argv);
  for (const line of formatPositionStepLines(
    result.positionEvaluation,
    result.recorded,
    result.currentOpenPosition,
  )) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
