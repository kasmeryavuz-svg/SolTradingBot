import { config as loadDotenv } from 'dotenv';
import { createDefaultDiscoveryFeeds, createDefaultDiscoveryMarketProvider } from '../discovery/service.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareCollectorCommand } from './command.js';
import { watchCollector } from './watch-loop.js';

loadDotenv({ quiet: true });

const controller = new AbortController();
const shutdown = { stopped: false };

const stop = (): void => {
  if (shutdown.stopped) {
    return;
  }
  shutdown.stopped = true;
  console.log('\nCollector stopped.');
  controller.abort();
  process.exitCode = 0;
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  const config = prepareCollectorCommand(process.env);
  const repository = createSqlitePersistenceRepository(config.database);

  try {
    repository.initialize();
    await watchCollector({
      config: config.discovery,
      feeds: createDefaultDiscoveryFeeds(config.discovery),
      repository,
      intervalMs: config.discovery.pollIntervalMs,
      signal: controller.signal,
      ...(config.discovery.enrichMarketData
        ? { marketData: createDefaultDiscoveryMarketProvider(config.marketData.timeoutMs) }
        : {}),
    });
  } finally {
    repository.close();
  }
} catch (error: unknown) {
  if (!shutdown.stopped) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
