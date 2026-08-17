import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareFeatureHistoryCommand, requireFeatureMintArgument } from './command.js';
import { formatFeatureHistoryLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareFeatureHistoryCommand(process.env);
  const tokenMint = requireFeatureMintArgument(process.argv, 'feature:history');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getFeatureHistory(tokenMint, config.features.historyLimit);
    for (const line of formatFeatureHistoryLines(tokenMint, history)) {
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
