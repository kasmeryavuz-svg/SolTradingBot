import { config as loadDotenv } from 'dotenv';
import { executePaperStep } from './execute.js';
import { formatPaperStepLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const result = await executePaperStep(process.env, process.argv);
  for (const line of formatPaperStepLines(result.paperEvaluation, result.recorded)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
