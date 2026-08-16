import type { DiscoveryConfig } from '../config/types.js';
import { formatUsd } from '../market-data/format.js';
import type { MarketDataProvider } from '../market-data/provider.js';
import { createFirstSeenTracker, type FirstSeenTracker } from './first-seen.js';
import type { DiscoveryFeedProvider } from './provider.js';
import { runDiscovery } from './service.js';

export async function watchDiscovery(options: {
  config: DiscoveryConfig;
  feeds: readonly DiscoveryFeedProvider[];
  marketData?: MarketDataProvider;
  intervalMs: number;
  signal: AbortSignal;
  tracker?: FirstSeenTracker;
  write?: (line: string) => void;
  now?: () => Date;
}): Promise<void> {
  const write = options.write ?? ((line: string) => {
    console.log(line);
  });
  const now = options.now ?? (() => new Date());
  const tracker = options.tracker ?? createFirstSeenTracker();
  const isStopped = (): boolean => options.signal.aborted;

  while (!isStopped()) {
    write(`--- ${now().toISOString()} ---`);
    write('Token Discovery — READ ONLY');
    write('NEW/first-seen means new to this running discovery:watch process, not newly minted or launched.');

    try {
      const result = await runDiscovery({
        config: options.config,
        feeds: options.feeds,
        now,
        ...(options.marketData === undefined ? {} : { marketData: options.marketData }),
      });
      const firstSeen = new Set(tracker.remember(result.candidates.map((candidate) => candidate.tokenMint)));

      for (const source of result.sourceResults) {
        const label =
          source.source === 'dexscreener_profile'
            ? 'DEX Screener latest profiles'
            : 'DEX Screener latest boosts';
        write(`${label}: ${source.ok ? 'OK' : `FAILED${source.error === null ? '' : ` (${source.error})`}`}`);
      }
      write(`Candidates: ${String(result.candidates.length)}`);
      write('Candidate cap is an operational limit, not a quality ranking.');

      for (const [index, candidate] of result.candidates.entries()) {
        const isNew = firstSeen.has(candidate.tokenMint);
        write('');
        write(`Candidate ${String(index + 1)}${isNew ? ' — NEW to this process' : ''}`);
        write(`Mint: ${candidate.tokenMint}`);
        write(`Sources: ${candidate.sources.join(', ')}`);
        write(
          isNew
            ? 'First seen by this process: yes (not a mint-creation time)'
            : 'First seen by this process: no',
        );
        write(`Market data: ${candidate.marketDataStatus}`);
        if (candidate.marketSnapshot !== null) {
          write(`Symbol: ${candidate.marketSnapshot.tokenSymbol ?? 'n/a'}`);
          write(`Price: ${formatUsd(candidate.marketSnapshot.priceUsd)}`);
        }
      }

      write('');
      write('Discovery is not a buy signal. No trading capability. Checkpoint: 03');
    } catch (error: unknown) {
      if (isStopped()) {
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      write(`Discovery cycle failed: ${message}`);
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
