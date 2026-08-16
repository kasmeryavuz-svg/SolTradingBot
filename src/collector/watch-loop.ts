import type { DiscoveryConfig } from '../config/types.js';
import type { DiscoveryFeedProvider } from '../discovery/provider.js';
import type { MarketDataProvider } from '../market-data/provider.js';
import type { PersistenceRepository } from '../persistence/repository.js';
import { formatCollectorWatchLines } from './format.js';
import { runCollectorCycle } from './service.js';

export async function watchCollector(options: {
  config: DiscoveryConfig;
  feeds: readonly DiscoveryFeedProvider[];
  repository: PersistenceRepository;
  intervalMs: number;
  signal: AbortSignal;
  marketData?: MarketDataProvider;
  write?: (line: string) => void;
  now?: () => Date;
}): Promise<void> {
  const write = options.write ?? ((line: string) => {
    console.log(line);
  });
  const now = options.now ?? (() => new Date());
  const isStopped = (): boolean => options.signal.aborted;

  while (!isStopped()) {
    try {
      const cycle = await runCollectorCycle({
        config: options.config,
        feeds: options.feeds,
        repository: options.repository,
        now,
        ...(options.marketData === undefined ? {} : { marketData: options.marketData }),
      });

      for (const line of formatCollectorWatchLines({
        observedAt: cycle.discovery.observedAt,
        discovery: cycle.discovery,
        recorded: cycle.recorded,
      })) {
        write(line);
      }
    } catch (error: unknown) {
      if (isStopped()) {
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      write(`Collector cycle failed: ${message}`);
    }

    if (isStopped()) {
      break;
    }

    await sleep(options.intervalMs, options.signal);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }

    const timer = setTimeout(() => {
      resolve();
    }, ms);

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}
