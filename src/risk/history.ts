import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareRiskHistoryCommand, requireRiskMintArgument } from './command.js';
import { formatRiskHistoryLines } from './format.js';

loadDotenv({ quiet: true });

try {
  const config = prepareRiskHistoryCommand(process.env);
  const tokenMint = requireRiskMintArgument(process.argv, 'risk:history');
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getRiskHistory(tokenMint, config.risk.historyLimit);
    for (const line of formatRiskHistoryLines(tokenMint, history)) {
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
