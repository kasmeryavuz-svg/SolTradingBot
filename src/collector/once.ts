import { config as loadDotenv } from 'dotenv';
import { createDefaultDiscoveryFeeds, createDefaultDiscoveryMarketProvider } from '../discovery/service.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareCollectorCommand } from './command.js';
import { formatCollectorOnceLines } from './format.js';
import { runCollectorCycle } from './service.js';

loadDotenv({ quiet: true });

try {
  const config = prepareCollectorCommand(process.env);
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    const cycle = await runCollectorCycle({
      config: config.discovery,
      feeds: createDefaultDiscoveryFeeds(config.discovery),
      repository,
      ...(config.discovery.enrichMarketData
        ? { marketData: createDefaultDiscoveryMarketProvider(config.marketData.timeoutMs) }
        : {}),
    });

    for (const line of formatCollectorOnceLines({
      discovery: cycle.discovery,
      recorded: cycle.recorded,
      path: config.database.path,
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
