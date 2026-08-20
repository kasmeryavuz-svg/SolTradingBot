import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_DATABASE_PATH } from '../src/config/defaults.js';
import {
  initializeRecoveryDatabase,
  openRecoveryMemoryDatabase,
  openRecoverySqlite,
} from '../src/recovery-watcher/db/database.js';
import {
  buildRecoveryDatasetManifest,
  initializeRecoveryDatasetManifest,
} from '../src/recovery-watcher/dataset-manifest.js';
import { applyTransition, createEpisode } from '../src/recovery-watcher/state.js';
import type {
  CreateEpisodeInput,
  RecoveryEpisode,
  TransitionRequest,
} from '../src/recovery-watcher/types.js';

export const FIXTURE_MINT = 'So11111111111111111111111111111111111111112';
export const FIXTURE_PAIR = '58oQChx4yWmvKdwLLZzBi4ChoCc2fqCUWBkwMihLYQo2';
export const FIXTURE_NOW = new Date('2026-08-19T12:00:00.000Z');
export const FIXTURE_DIP_AT = '2026-08-19T11:00:00.000Z';
export const FIXTURE_DIP_STEP_AT = '2026-08-19T11:00:01.000Z';
export const FIXTURE_WATCH_AT = '2026-08-19T11:00:02.000Z';
export const FIXTURE_CONFIRM_AT = '2026-08-19T11:05:00.000Z';
export const FIXTURE_SHADOW_AT = '2026-08-19T11:05:01.000Z';
export const FIXTURE_TTL_ELIGIBLE_AT = '2026-08-19T13:00:02.000Z';
export const FIXTURE_TTL_NOW = new Date('2026-08-19T13:00:02.000Z');
export const FIXTURE_CONFIRM_1MS_BEFORE_EXPIRY = '2026-08-19T13:00:01.999Z';
export const FIXTURE_CONFIRM_1MS_AFTER_EXPIRY = '2026-08-19T13:00:02.001Z';
export const FIXTURE_FIVE_HOURS_LATER = '2026-08-19T16:00:02.000Z';
export const FIXTURE_LATE_NOW = new Date('2026-08-19T16:00:02.000Z');

export function passingDipFields(): Pick<
  CreateEpisodeInput,
  'dipPriceUsd' | 'dipVolume5mUsd' | 'dipPriceChange5mPct'
> {
  return {
    dipPriceUsd: 1,
    dipVolume5mUsd: 5_000,
    dipPriceChange5mPct: -50,
  };
}

export function passingConfirmationFields(): Pick<
  TransitionRequest,
  | 'recoveryConfirmedAt'
  | 'recoveryConfirmationPriceUsd'
  | 'recoveryConfirmationLiquidityUsd'
  | 'recoveryConfirmationVolume5mUsd'
> {
  return {
    recoveryConfirmedAt: FIXTURE_CONFIRM_AT,
    recoveryConfirmationPriceUsd: 1.2,
    recoveryConfirmationLiquidityUsd: 10_000,
    recoveryConfirmationVolume5mUsd: 15_000,
  };
}

export function takeProfitCloseEvidence(): NonNullable<TransitionRequest['closeEvidence']> {
  return {
    observedAt: '2026-08-19T11:30:00.000Z',
    pairAddress: FIXTURE_PAIR,
    observedPriceUsd: 1.44,
    reason: 'take_profit_threshold',
    observationCollectedAt: '2026-08-19T11:30:00.000Z',
  };
}

export function discoveredEpisodeInput(
  overrides: Partial<CreateEpisodeInput> = {},
): CreateEpisodeInput {
  return {
    mint: FIXTURE_MINT,
    pairAddress: FIXTURE_PAIR,
    dipObservedAt: FIXTURE_DIP_AT,
    createdAt: FIXTURE_DIP_AT,
    ...passingDipFields(),
    ...overrides,
  };
}

export function createDiscoveredEpisode(
  overrides: Partial<CreateEpisodeInput> = {},
): RecoveryEpisode {
  return createEpisode(discoveredEpisodeInput(overrides), { now: FIXTURE_NOW });
}

export function stepEpisode(
  current: RecoveryEpisode,
  request: TransitionRequest,
  context: { now?: Date; concurrentWatchCount?: number } = {},
): RecoveryEpisode {
  return applyTransition(current, request, {
    now: context.now ?? FIXTURE_NOW,
    ...(context.concurrentWatchCount === undefined
      ? {}
      : { concurrentWatchCount: context.concurrentWatchCount }),
  }).episode;
}

export function toDipCandidate(
  current: RecoveryEpisode = createDiscoveredEpisode(),
): RecoveryEpisode {
  return stepEpisode(current, {
    to: 'DIP_CANDIDATE',
    at: FIXTURE_DIP_STEP_AT,
    reason: 'filters_pass',
  });
}

export function toWatch(current: RecoveryEpisode = createDiscoveredEpisode()): RecoveryEpisode {
  return stepEpisode(
    toDipCandidate(current),
    { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'admitted' },
    { concurrentWatchCount: 0 },
  );
}

export function toSignalPending(
  current: RecoveryEpisode = createDiscoveredEpisode(),
): RecoveryEpisode {
  return stepEpisode(toWatch(current), {
    to: 'SIGNAL_PENDING_SAFETY',
    at: FIXTURE_CONFIRM_AT,
    reason: 'recovery_confirmed',
    ...passingConfirmationFields(),
  });
}

export function toShadow(current: RecoveryEpisode = createDiscoveredEpisode()): RecoveryEpisode {
  return stepEpisode(toSignalPending(current), {
    to: 'SHADOW_RESEARCH_OPEN',
    at: FIXTURE_SHADOW_AT,
    reason: 'unsafe_shadow',
  });
}

export function openInitializedRecoveryDatabase() {
  const database = openRecoveryMemoryDatabase();
  initializeRecoveryDatabase(database);
  return database;
}

export function openInitializedRecoveryFileDatabase(path: string) {
  const database = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
  initializeRecoveryDatabase(database);
  return database;
}

export function initializeTestRecoveryDataset(database: DatabaseSync, path: string): void {
  initializeRecoveryDatasetManifest(
    database,
    buildRecoveryDatasetManifest({
      datasetId: 'rw0-test-dataset',
      createdAt: FIXTURE_NOW.toISOString(),
      startAt: FIXTURE_NOW.toISOString(),
      evidenceClass: 'test',
      databasePath: path,
    }),
  );
}

export function tempRecoveryDatabasePath(): string {
  return join(mkdtempSync(join(tmpdir(), 'rw0-')), 'recovery-watcher.sqlite');
}

export function tempRecoveryDirectory(): string {
  return mkdtempSync(join(tmpdir(), 'rw0-lock-'));
}
