import { config as loadDotenv } from 'dotenv';
import { assertNoExtraMlArguments, prepareMlCommand } from './cli.js';
import { executeMlCandidate } from './pipeline.js';
import { formatMlCandidateLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareMlCommand(process.env);
  assertNoExtraMlArguments(process.argv, 'ml:candidate');
  const report = executeMlCandidate(config);
  for (const line of formatMlCandidateLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
