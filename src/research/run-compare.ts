import { config as loadDotenv } from 'dotenv';
import {
  assertNoExtraResearchArguments,
  executeResearchCompare,
  prepareResearchCommand,
} from './command.js';
import { formatResearchCompareLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareResearchCommand(process.env);
  assertNoExtraResearchArguments(process.argv, 'research:compare');
  const report = executeResearchCompare(config);
  for (const line of formatResearchCompareLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
