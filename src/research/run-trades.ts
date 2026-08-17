import { config as loadDotenv } from 'dotenv';
import {
  executeResearchTrades,
  parseResearchTradesArgv,
  prepareResearchCommand,
} from './command.js';
import { formatResearchTradeLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareResearchCommand(process.env);
  const { candidateId } = parseResearchTradesArgv(process.argv);
  const report = executeResearchTrades(config, candidateId);
  for (const line of formatResearchTradeLines(report, config.research.tradeLimit)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
