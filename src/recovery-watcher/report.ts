import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE,
  RW0_MAX_CONCURRENT_WATCHES,
  RW0_NETWORK_TIMEOUT_MS,
  RW0_SCHEDULING_POLICY,
  RW0_SCREENING_DISPOSITIONS,
  RW0_SCREENING_FETCH_CONCURRENCY,
  RW0_SCREENING_MAX_CANDIDATES,
  RW0_SCREENING_WALL_BUDGET_MS,
  RW0_WATCH_CADENCE_MS,
  RW0_WATCH_FETCH_CONCURRENCY,
} from './constants.js';
import { openRecoverySqliteReadOnlyFromConfig } from './db/database.js';
import { loadRecoveryReportSnapshot } from './persistence.js';
import { sanitizeRecoveryDatabasePathDisplay } from './sanitizer.js';
import type { RecoveryReportSnapshot, RecoveryWatcherConfig } from './types.js';

export function loadRecoveryReport(config: RecoveryWatcherConfig): RecoveryReportSnapshot | null {
  const resolved = resolve(config.databasePath);
  if (!existsSync(resolved)) {
    return null;
  }
  const database = openRecoverySqliteReadOnlyFromConfig(config);
  try {
    return loadRecoveryReportSnapshot(database);
  } finally {
    database.close();
  }
}

export function formatRecoveryReportLines(config: RecoveryWatcherConfig): string[] {
  const snapshot = loadRecoveryReport(config);
  const lines = [
    'RECOVERY WATCHER REPORT',
    'Slice: 2 networked forward observation only',
    `Database: ${sanitizeRecoveryDatabasePathDisplay(config.databasePath)}`,
    `Scheduling: ${RW0_SCHEDULING_POLICY}`,
    `Watch cadence ms: ${String(RW0_WATCH_CADENCE_MS)} (target from pass start; approximately one observation per minute; not exact 60.000s sampling)`,
    `Watch fetch concurrency: ${String(RW0_WATCH_FETCH_CONCURRENCY)}`,
    `Screening fetch concurrency: ${String(RW0_SCREENING_FETCH_CONCURRENCY)}`,
    `Screening wall-time budget ms: ${String(RW0_SCREENING_WALL_BUDGET_MS)}`,
    `Screening candidate cap: ${String(RW0_SCREENING_MAX_CANDIDATES)}`,
    `Discovery calls per screening cycle: ${String(RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE)}`,
    `Max high-resolution watches: ${String(RW0_MAX_CONCURRENT_WATCHES)}`,
    `Network timeout ms: ${String(RW0_NETWORK_TIMEOUT_MS)}`,
    'collectedAt: local collection time of this process, not token launch or exchange trade time',
    'DexScreener quote timestamp: untrustworthy / not used',
    'Discovery coverage: INCOMPLETE (latest profile/boost only; first seen here is not a new launch)',
    'Positions, fills, and live execution are out of scope for Slice 2.',
    'Prior bounded public one-cycle DexScreener smoke is disposable engineering smoke only and is excluded from strategy forward-validation evidence. Do not merge that DB.',
    'Do not run another public smoke until this Slice-2 repair is reviewed. The first retained forward run freezes watcher fingerprint and schema digest for that dataset.',
  ];
  if (snapshot === null) {
    lines.push('Recovery DB: not initialized');
    return lines;
  }
  lines.push(`Screening observations: ${String(snapshot.screeningCount)}`);
  for (const disposition of RW0_SCREENING_DISPOSITIONS) {
    lines.push(`  ${disposition}: ${String(snapshot.screeningByDisposition[disposition])}`);
  }
  lines.push(`Genuine dip-filter PASS rows: ${String(snapshot.dipFilterPassCount)} (includes capacity-blocked dips)`);
  lines.push(`  dip_filter NOT_DIP: ${String(snapshot.dipFilterNotDipCount)}`);
  lines.push(`  dip_filter INCOMPLETE: ${String(snapshot.dipFilterIncompleteCount)}`);
  lines.push(`  dip_filter NOT_EVALUATED: ${String(snapshot.dipFilterNotEvaluatedCount)}`);
  lines.push(`Admitted watches: ${String(snapshot.admittedWatchCount)}`);
  lines.push(`Currently active watches: ${String(snapshot.activeWatchCount)}`);
  lines.push(`Confirmed recovery signals: ${String(snapshot.confirmedRecoveryCount)}`);
  lines.push(`Rejected safety unknown: ${String(snapshot.rejectedSafetyUnknownCount)}`);
  lines.push(`Expired: ${String(snapshot.expiredCount)}`);
  lines.push(`Provider-unavailable screenings: ${String(snapshot.marketUnavailableCount)}`);
  lines.push(`First observation: ${snapshot.firstObservationAt ?? 'none'}`);
  lines.push(`Last observation: ${snapshot.lastObservationAt ?? 'none'}`);
  lines.push(`Shadow positions: ${String(snapshot.shadowPositionCount)} (must remain 0 in Slice 2)`);
  lines.push(`PAPER states: ${String(snapshot.paperStateCount)} (must remain 0 in Slice 2)`);
  lines.push(`CLOSED states: ${String(snapshot.closedStateCount)} (must remain 0 in Slice 2)`);
  return lines;
}
