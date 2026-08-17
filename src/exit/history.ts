import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareExitHistoryCommand, requireExitMintArgument } from './command.js';
import { formatExitHistoryLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareExitHistoryCommand(process.env);
  const tokenMint = requireExitMintArgument(process.argv, 'exit:history');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getExitHistory(tokenMint, config.exit.historyLimit);
    for (const line of formatExitHistoryLines(tokenMint, history)) {
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
