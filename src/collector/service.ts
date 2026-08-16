import type { DiscoveryConfig } from '../config/types.js';
import type { DiscoveryFeedProvider } from '../discovery/provider.js';
import { runDiscovery } from '../discovery/service.js';
import type { DiscoveryRunResult } from '../discovery/types.js';
import type { MarketDataProvider } from '../market-data/provider.js';
import type { PersistenceRepository } from '../persistence/repository.js';
import type { RecordedRun } from '../persistence/types.js';

export type RecordedCollectorCycle = {
  discovery: DiscoveryRunResult;
  recorded: RecordedRun;
};

export async function runCollectorCycle(options: {
  config: DiscoveryConfig;
  feeds: readonly DiscoveryFeedProvider[];
  repository: PersistenceRepository;
  marketData?: MarketDataProvider;
  now?: () => Date;
}): Promise<RecordedCollectorCycle> {
  const discovery = await runDiscovery({
    config: options.config,
    feeds: options.feeds,
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.marketData === undefined ? {} : { marketData: options.marketData }),
  });

  return {
    discovery,
    recorded: options.repository.recordDiscoveryRun(discovery),
  };
}
