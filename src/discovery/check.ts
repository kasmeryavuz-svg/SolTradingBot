import { config as loadDotenv } from 'dotenv';
import { prepareDiscoveryCommand } from './command.js';
import { formatDiscoveryCheckLines } from './format.js';
import {
  createDefaultDiscoveryFeeds,
  createDefaultDiscoveryMarketProvider,
  runDiscovery,
} from './service.js';

loadDotenv({ quiet: true });

try {
  const config = prepareDiscoveryCommand(process.env);

  const result = await runDiscovery({
    config: config.discovery,
    feeds: createDefaultDiscoveryFeeds(config.discovery),
    ...(config.discovery.enrichMarketData
      ? { marketData: createDefaultDiscoveryMarketProvider(config.marketData.timeoutMs) }
      : {}),
  });

  for (const line of formatDiscoveryCheckLines(result)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
