import { config as loadDotenv } from 'dotenv';
import { preparePersistenceCommand } from '../command.js';
import { formatStatusLines } from '../format.js';
import { createSqlitePersistenceRepository } from '../sqlite/index.js';

loadDotenv({ quiet: true });

try {
  const config = preparePersistenceCommand(process.env);
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const stats = repository.getStats();
    for (const line of formatStatusLines(config.database.path, stats)) {
      console.log(line);
    }
    if (!stats.integrity.ok) {
      process.exitCode = 1;
    }
  } finally {
    repository.close();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
