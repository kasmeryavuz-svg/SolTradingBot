import { config as loadDotenv } from 'dotenv';
import { preparePersistenceCommand } from '../command.js';
import { formatInitLines } from '../format.js';
import { createSqlitePersistenceRepository } from '../sqlite/index.js';

loadDotenv({ quiet: true });

try {
  const config = preparePersistenceCommand(process.env);
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const stats = repository.getStats();
    for (const line of formatInitLines({
      path: config.database.path,
      schemaVersion: stats.schemaVersion,
      foreignKeysEnabled: stats.foreignKeysEnabled,
    })) {
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
