import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../config/load-config.js';
import { assertTradingDisabled } from '../core/safety.js';
import { formatMarketCheckLines } from './format.js';
import { collectWatchlistSnapshots, createDefaultMarketDataProvider } from './service.js';

loadDotenv({ quiet: true });

try {
  const config = loadConfig(process.env);
  assertTradingDisabled(config);

  const snapshots = await collectWatchlistSnapshots(
    createDefaultMarketDataProvider(config.marketData),
    config.marketData.tokenMints,
  );

  for (const line of formatMarketCheckLines(snapshots)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
