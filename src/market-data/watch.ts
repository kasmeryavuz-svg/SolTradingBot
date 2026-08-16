import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../config/load-config.js';
import { assertTradingDisabled } from '../core/safety.js';
import { createDefaultMarketDataProvider } from './service.js';
import { watchMarketData } from './watch-loop.js';

loadDotenv({ quiet: true });

const controller = new AbortController();
const shutdown = { stopped: false };

const stop = (): void => {
  if (shutdown.stopped) {
    return;
  }
  shutdown.stopped = true;
  console.log('\nMarket watch stopped.');
  controller.abort();
  process.exitCode = 0;
};

process.on('SIGINT', stop);
process.on('SIGTERM', stop);

try {
  const config = loadConfig(process.env);
  assertTradingDisabled(config);

  await watchMarketData({
    provider: createDefaultMarketDataProvider(config.marketData),
    tokenMints: config.marketData.tokenMints,
    intervalMs: config.marketData.pollIntervalMs,
    signal: controller.signal,
  });
} catch (error: unknown) {
  if (!shutdown.stopped) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  }
}
