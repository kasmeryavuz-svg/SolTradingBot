import { config as loadDotenv } from 'dotenv';
import { prepareDiscoveryCommand } from './command.js';
import { createDefaultDiscoveryFeeds, createDefaultDiscoveryMarketProvider } from './service.js';
import { watchDiscovery } from './watch-loop.js';

loadDotenv({ quiet: true });

const controller = new AbortController();
const shutdown = { stopped: false };

const stop = (): void => {
  if (shutdown.stopped) {
    return;
  }
  shutdown.stopped = true;
  console.log('\nDiscovery watch stopped.');
  controller.abort();
  process.exitCode = 0;
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  const config = prepareDiscoveryCommand(process.env);

  await watchDiscovery({
    config: config.discovery,
    feeds: createDefaultDiscoveryFeeds(config.discovery),
    ...(config.discovery.enrichMarketData
      ? { marketData: createDefaultDiscoveryMarketProvider(config.marketData.timeoutMs) }
      : {}),
    intervalMs: config.discovery.pollIntervalMs,
    signal: controller.signal,
  });
} catch (error: unknown) {
  if (!shutdown.stopped) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
