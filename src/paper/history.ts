import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { preparePaperHistoryCommand, requirePaperMintArgument } from './command.js';
import { formatPaperHistoryLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = preparePaperHistoryCommand(process.env);
  const tokenMint = requirePaperMintArgument(process.argv, 'paper:history');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getPaperHistory(tokenMint, config.paper.historyLimit);
    for (const line of formatPaperHistoryLines(tokenMint, history)) {
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
