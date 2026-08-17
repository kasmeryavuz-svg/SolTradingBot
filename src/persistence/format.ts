import { DEFAULT_HISTORY_LIMIT } from '../config/defaults.js';
import { formatUsd } from '../market-data/format.js';
import { displayDatabasePath } from './path.js';
import type { PersistenceStats, TokenHistory } from './types.js';

export function formatCapabilityFooter(): string[] {
  return [
    'Blockchain capability: READ ONLY',
    'Local persistence: ENABLED',
    'Token risk scanner: available',
    'Trading capability: DISABLED',
    'Checkpoint: 05',
  ];
}

export function formatInitLines(options: {
  path: string;
  schemaVersion: number;
  foreignKeysEnabled: boolean;
}): string[] {
  return [
    'Database initialization',
    '',
    `Path: ${displayDatabasePath(options.path)}`,
    `Schema version: ${String(options.schemaVersion)}`,
    `Foreign keys: ${options.foreignKeysEnabled ? 'enabled' : 'disabled'}`,
    'Status: OK',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatStatusLines(path: string, stats: PersistenceStats): string[] {
  return [
    'Database status',
    `Path: ${displayDatabasePath(path)}`,
    `Schema version: ${String(stats.schemaVersion)}`,
    `Integrity status: ${stats.integrity.ok ? 'OK' : 'FAILED'}`,
    `Foreign keys: ${stats.foreignKeysEnabled ? 'enabled' : 'disabled'}`,
    `Journal mode: ${stats.journalMode}`,
    '',
    `Tokens: ${String(stats.tokenCount)}`,
    `Discovery runs: ${String(stats.discoveryRunCount)}`,
    `Discovery observations: ${String(stats.discoveryObservationCount)}`,
    `Market snapshots: ${String(stats.marketSnapshotCount)}`,
    `Risk scans: ${String(stats.riskScanCount)}`,
    '',
    `Earliest observation: ${stats.earliestObservationAt ?? 'n/a'}`,
    `Latest observation: ${stats.latestObservationAt ?? 'n/a'}`,
    '',
    'First/last observation times are when this database recorded a mint, not token launch time.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatHistoryLines(tokenMint: string, history: TokenHistory | null): string[] {
  if (history === null) {
    return [
      'Token history',
      `Mint: ${tokenMint}`,
      '',
      'No history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token history',
    `Mint: ${history.token.mint}`,
    '',
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
    `Recent market snapshots (up to ${String(DEFAULT_HISTORY_LIMIT)}):`,
  ];

  if (history.snapshots.length === 0) {
    lines.push('No market snapshots stored for this mint.');
  }

  for (const snapshot of history.snapshots) {
    lines.push('');
    lines.push(`Collected at: ${snapshot.collectedAt}`);
    lines.push(`DEX: ${snapshot.dexId}`);
    lines.push(`Pair: ${snapshot.pairAddress}`);
    lines.push(`Price: ${formatUsd(snapshot.priceUsd)}`);
    lines.push(`Pair liquidity: ${formatUsd(snapshot.liquidityUsd)}`);
    lines.push(`Volume 5m: ${formatUsd(snapshot.volume5mUsd)}`);
    lines.push(`Volume 1h: ${formatUsd(snapshot.volume1hUsd)}`);
    lines.push(`Market cap: ${formatUsd(snapshot.marketCapUsd)}`);
    lines.push(`FDV: ${formatUsd(snapshot.fdvUsd)}`);
    lines.push(`Pair created at (DEX pair, not mint time): ${snapshot.pairCreatedAt ?? 'n/a'}`);
  }

  lines.push('');
  lines.push(...formatCapabilityFooter());
  return lines;
}
