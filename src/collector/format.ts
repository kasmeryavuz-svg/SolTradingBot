import type { DiscoveryRunResult } from '../discovery/types.js';
import { displayDatabasePath } from '../persistence/path.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type { RecordedRun } from '../persistence/types.js';

export function formatCollectorOnceLines(options: {
  discovery: DiscoveryRunResult;
  recorded: RecordedRun;
  path: string;
}): string[] {
  return [
    'Collector — LOCAL PERSISTENCE',
    '',
    'Discovery sources:',
    ...options.discovery.sourceResults.map((source) => {
      const label = source.source === 'dexscreener_profile' ? 'profiles' : 'boosts';
      return source.ok
        ? `${label}: OK`
        : `${label}: FAILED${source.error === null ? '' : ` (${source.error})`}`;
    }),
    '',
    `Candidates observed: ${String(options.recorded.candidateCount)}`,
    `New canonical tokens inserted: ${String(options.recorded.tokensInserted)}`,
    `Existing tokens updated: ${String(options.recorded.tokensUpdated)}`,
    `Discovery observations written: ${String(options.recorded.observationsWritten)}`,
    `Market snapshots written: ${String(options.recorded.snapshotsWritten)}`,
    '',
    'New canonical token inserted means first time this database recorded the mint, not newly minted on Solana.',
    '',
    `Database: ${displayDatabasePath(options.path)}`,
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatCollectorWatchLines(options: {
  observedAt: string;
  discovery: DiscoveryRunResult;
  recorded: RecordedRun;
}): string[] {
  return [
    `--- ${options.observedAt} ---`,
    'Collector — LOCAL PERSISTENCE',
    ...options.discovery.sourceResults.map((source) => {
      const label =
        source.source === 'dexscreener_profile'
          ? 'DEX Screener latest profiles'
          : 'DEX Screener latest boosts';
      return `${label}: ${source.ok ? 'OK' : 'FAILED'}`;
    }),
    `Candidates: ${String(options.recorded.candidateCount)}`,
    `Tokens inserted: ${String(options.recorded.tokensInserted)}`,
    `Tokens updated: ${String(options.recorded.tokensUpdated)}`,
    `Observations written: ${String(options.recorded.observationsWritten)}`,
    `Market snapshots written: ${String(options.recorded.snapshotsWritten)}`,
    'Inserted tokens are new to this database, not newly minted.',
    ...formatCapabilityFooter(),
  ];
}
