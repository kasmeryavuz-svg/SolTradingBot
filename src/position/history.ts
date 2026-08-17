import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { preparePositionHistoryCommand, requirePositionMintArgument } from './command.js';
import { formatPositionHistoryLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = preparePositionHistoryCommand(process.env);
  const tokenMint = requirePositionMintArgument(process.argv, 'position:history');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getPositionHistory(tokenMint, config.position.historyLimit);
    for (const line of formatPositionHistoryLines(tokenMint, history)) {
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
