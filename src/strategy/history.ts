import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareStrategyHistoryCommand, requireStrategyMintArgument } from './command.js';
import { formatStrategyHistoryLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareStrategyHistoryCommand(process.env);
  const tokenMint = requireStrategyMintArgument(process.argv, 'strategy:history');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getStrategyHistory(tokenMint, config.strategy.historyLimit);
    for (const line of formatStrategyHistoryLines(tokenMint, history)) {
      console.log(line);
    }
  } finally {
    repository.close();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
