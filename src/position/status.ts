import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { preparePositionStatusCommand, requirePositionMintArgument } from './command.js';
import { formatPositionStatusLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = preparePositionStatusCommand(process.env);
  const tokenMint = requirePositionMintArgument(process.argv, 'position:status');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const position = repository.getOpenPaperPosition(tokenMint);
    for (const line of formatPositionStatusLines(tokenMint, position)) {
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
