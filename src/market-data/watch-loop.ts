import type { MarketDataProvider } from './provider.js';
import { collectWatchlistSnapshots } from './service.js';
import { formatMarketCheckLines } from './format.js';

export async function watchMarketData(options: {
  provider: MarketDataProvider;
  tokenMints: readonly string[];
  intervalMs: number;
  signal: AbortSignal;
  write?: (line: string) => void;
  now?: () => Date;
}): Promise<void> {
  const write = options.write ?? ((line: string) => {
    console.log(line);
  });
  const now = options.now ?? (() => new Date());
  const isStopped = (): boolean => options.signal.aborted;

  while (!isStopped()) {
    write(`--- ${now().toISOString()} ---`);

    try {
      const snapshots = await collectWatchlistSnapshots(options.provider, options.tokenMints);
      for (const line of formatMarketCheckLines(snapshots)) {
        write(line);
      }
    } catch (error: unknown) {
      if (isStopped()) {
        break;
      }
      const message = error instanceof Error ? error.message : String(error);
      write(`Market data cycle failed: ${message}`);
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
