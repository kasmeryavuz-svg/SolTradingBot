import { config as loadDotenv } from 'dotenv';
import { DEFAULT_HISTORY_LIMIT } from '../../config/defaults.js';
import { isPlausibleSolanaMint } from '../../utils/solana-mint.js';
import { preparePersistenceCommand } from '../command.js';
import { formatHistoryLines } from '../format.js';
import { createSqlitePersistenceRepository } from '../sqlite/index.js';

loadDotenv({ quiet: true });

try {
  const config = preparePersistenceCommand(process.env);
  const mint = process.argv[2];
  if (mint === undefined || mint.trim() === '') {
    throw new Error('Usage: npm run db:history -- <TOKEN_MINT>');
  }
  if (!isPlausibleSolanaMint(mint)) {
    throw new Error('Invalid token mint. Provide a syntactically plausible Solana mint address.');
  }
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const history = repository.getMarketHistory(mint, DEFAULT_HISTORY_LIMIT);
    for (const line of formatHistoryLines(mint, history)) {
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
