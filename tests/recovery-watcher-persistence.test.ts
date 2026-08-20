import { existsSync, mkdirSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_PATH } from '../src/config/defaults.js';
import { DEFAULT_RW0_DATABASE_PATH } from '../src/recovery-watcher/constants.js';
import { loadRecoveryWatcherConfig } from '../src/recovery-watcher/config.js';
import {
  initializeRecoveryDatabase,
  openRecoveryMemoryDatabase,
  openRecoverySqlite,
} from '../src/recovery-watcher/db/database.js';
import {
  assertRecoveryMigrationIntegrity,
  currentRecoverySchemaVersion,
  recoveryMigrationSqlDigest,
  RW0_MIGRATIONS,
} from '../src/recovery-watcher/db/migrations.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
} from '../src/recovery-watcher/identity.js';
import * as recoveryPersistence from '../src/recovery-watcher/persistence.js';
import {
  countHighResolutionWatchSlots,
  listActiveEpisodes,
  listEpisodesByMint,
  listTransitions,
  loadEpisode,
  persistCreatedEpisode,
  persistMarketObservation,
  persistSafetyEvidence,
  persistShadowExitObservation,
  persistTransition,
} from '../src/recovery-watcher/persistence.js';
import type { MarketObservationRecord } from '../src/recovery-watcher/types.js';
import {
  discoveredEpisodeInput,
  FIXTURE_CONFIRM_AT,
  FIXTURE_DIP_STEP_AT,
  FIXTURE_FIVE_HOURS_LATER,
  FIXTURE_LATE_NOW,
  FIXTURE_MINT,
  FIXTURE_NOW,
  FIXTURE_PAIR,
  FIXTURE_SHADOW_AT,
  FIXTURE_WATCH_AT,
  openInitializedRecoveryDatabase,
  passingConfirmationFields,
  takeProfitCloseEvidence,
  tempRecoveryDatabasePath,
  tempRecoveryDirectory,
} from './recovery-watcher-fixtures.js';

function observationFor(
  episode: {
    episodeId: string;
    mint: string;
    pairAddress: string;
    signalVersion: string;
    watcherSpecVersion: string;
  },
  overrides: Partial<MarketObservationRecord> = {},
): MarketObservationRecord {
  return {
    episodeId: episode.episodeId,
    mint: episode.mint,
    pairAddress: episode.pairAddress,
    collectedAt: FIXTURE_CONFIRM_AT,
    provider: 'fixture',
    source: 'unit_test',
    priceUsd: 1.2,
    liquidityUsd: 10_000,
    volume5mUsd: 15_000,
    priceChange5mPct: -20,
    signalVersion: episode.signalVersion,
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
    watcherSpecVersion: episode.watcherSpecVersion,
    watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
    ...overrides,
  };
}

function persistToShadow(
  database: ReturnType<typeof openInitializedRecoveryDatabase>,
  mint = FIXTURE_MINT,
) {
  const created = persistCreatedEpisode(
    database,
    discoveredEpisodeInput({
      mint,
      pairAddress: mint === FIXTURE_MINT ? FIXTURE_PAIR : mint,
    }),
    { now: FIXTURE_NOW },
  );
  persistTransition(
    database,
    created.episodeId,
    { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'filters_pass' },
    { now: FIXTURE_NOW },
  );
  persistTransition(
    database,
    created.episodeId,
    { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'admitted' },
    { now: FIXTURE_NOW },
  );
  persistMarketObservation(database, observationFor(created), { now: FIXTURE_NOW });
  persistTransition(
    database,
    created.episodeId,
    {
      to: 'SIGNAL_PENDING_SAFETY',
      at: FIXTURE_CONFIRM_AT,
      reason: 'recovery_confirmed',
      ...passingConfirmationFields(),
    },
    { now: FIXTURE_NOW },
  );
  return persistTransition(
    database,
    created.episodeId,
    { to: 'SHADOW_RESEARCH_OPEN', at: FIXTURE_SHADOW_AT, reason: 'unsafe_shadow' },
    { now: FIXTURE_NOW },
  ).episode;
}

describe('recovery watcher isolated persistence', () => {
  it('uses isolated recovery schema 2 with a dedicated safety migration', () => {
    expect(DEFAULT_RW0_DATABASE_PATH).toBe('./data/recovery-watcher.sqlite');
    expect(DEFAULT_RW0_DATABASE_PATH).not.toBe(DEFAULT_DATABASE_PATH);
    expect(RW0_MIGRATIONS).toHaveLength(2);
    expect(RW0_MIGRATIONS[0]?.version).toBe(1);
    expect(RW0_MIGRATIONS[0]?.name).toBe('rw0_001_initial');
    expect(RW0_MIGRATIONS[1]?.version).toBe(2);
    expect(RW0_MIGRATIONS[1]?.name).toBe('rw0_002_safety_evidence');
    expect(recoveryMigrationSqlDigest(1)).toBe(
      '84832895ff70d1d6362058699a2301ed590eb3b5e6ce70bf598b2eb41060f234',
    );
    const database = openInitializedRecoveryDatabase();
    expect(currentRecoverySchemaVersion(database)).toBe(2);
    assertRecoveryMigrationIntegrity(database);
    database.close();
  });

  it('refuses the default production database path', () => {
    expect(() =>
      openRecoverySqlite(DEFAULT_DATABASE_PATH, {
        configuredProductionPath: DEFAULT_DATABASE_PATH,
      }),
    ).toThrow(/must not be the production SQLite file/);
  });

  it('refuses a custom configured DATABASE_PATH collision', () => {
    const custom = join(tempRecoveryDirectory(), 'market.sqlite');
    expect(() =>
      loadRecoveryWatcherConfig({
        DATABASE_PATH: custom,
        RW0_DATABASE_PATH: custom,
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
      }),
    ).toThrow(/must not be the production SQLite file/);
    expect(() => openRecoverySqlite(custom, { configuredProductionPath: custom })).toThrow(
      /must not be the production SQLite file/,
    );
  });

  it('protects against path aliases and symlinks where supported', () => {
    const directory = tempRecoveryDirectory();
    const productionFile = join(directory, 'market.sqlite');
    writeFileSync(productionFile, '');
    const alias = join(directory, 'alias-market.sqlite');
    let linked = false;
    try {
      symlinkSync(productionFile, alias);
      linked = true;
    } catch {
      mkdirSync(join(directory, 'skip'), { recursive: true });
    }
    if (linked) {
      expect(() => openRecoverySqlite(alias, { configuredProductionPath: productionFile })).toThrow(
        /must not be the production SQLite file/,
      );
    } else {
      expect(existsSync(productionFile)).toBe(true);
    }
  });

  it('rejects runtime :memory: and requires configuredProductionPath for file opens', () => {
    expect(() =>
      loadRecoveryWatcherConfig({
        RW0_DATABASE_PATH: ':memory:',
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
      }),
    ).toThrow(/:memory: is not allowed/);
    expect(() =>
      openRecoverySqlite(':memory:', { configuredProductionPath: DEFAULT_DATABASE_PATH }),
    ).toThrow(/:memory: is not allowed/);
    const customProduction = join(tempRecoveryDirectory(), 'market.sqlite');
    expect(() => openRecoverySqlite(customProduction)).toThrow(/configuredProductionPath/);
    const database = openRecoveryMemoryDatabase();
    initializeRecoveryDatabase(database);
    expect(currentRecoverySchemaVersion(database)).toBe(2);
    database.close();
  });

  it('persists transitions, resumes after reopen, and keeps shadow research distinct', () => {
    const path = tempRecoveryDatabasePath();
    const first = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(first);
    const created = persistCreatedEpisode(first, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    persistTransition(
      first,
      created.episodeId,
      { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'filters_pass' },
      { now: FIXTURE_NOW },
    );
    persistTransition(
      first,
      created.episodeId,
      { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'admitted' },
      { now: FIXTURE_NOW },
    );
    expect(countHighResolutionWatchSlots(first)).toBe(1);
    persistMarketObservation(first, observationFor(created), { now: FIXTURE_NOW });
    persistTransition(
      first,
      created.episodeId,
      {
        to: 'SIGNAL_PENDING_SAFETY',
        at: FIXTURE_CONFIRM_AT,
        reason: 'recovery_confirmed',
        ...passingConfirmationFields(),
      },
      { now: FIXTURE_NOW },
    );
    persistTransition(
      first,
      created.episodeId,
      { to: 'SHADOW_RESEARCH_OPEN', at: FIXTURE_SHADOW_AT, reason: 'unsafe_shadow' },
      { now: FIXTURE_NOW },
    );
    persistShadowExitObservation(
      first,
      {
        episodeId: created.episodeId,
        observedAt: '2026-08-19T11:06:00.000Z',
        pairAddress: FIXTURE_PAIR,
        observedPriceUsd: 1.3,
        thresholdPriceUsd: 1.44,
        overshootPct: null,
        gapFlag: false,
        action: 'hold',
      },
      { now: FIXTURE_NOW },
    );
    first.close();

    expect(existsSync(path)).toBe(true);
    const second = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(second);
    const resumed = loadEpisode(second, created.episodeId);
    expect(resumed?.state).toBe('SHADOW_RESEARCH_OPEN');
    expect(resumed?.safetyIncomplete).toBe(true);
    expect(resumed?.completenessGate).toBe('FAIL');
    expect(resumed?.track).toBe('shadow');
    expect(resumed?.costModel).toBe('none');
    expect(resumed?.executionModel).toBe('discrete_observed_price_no_quote');
    expect(listActiveEpisodes(second)).toHaveLength(1);
    expect(listEpisodesByMint(second, FIXTURE_MINT)).toHaveLength(1);
    expect(listTransitions(second, created.episodeId).map((item) => item.toState)).toEqual([
      'DISCOVERED',
      'DIP_CANDIDATE',
      'RECOVERY_WATCH',
      'SIGNAL_PENDING_SAFETY',
      'SHADOW_RESEARCH_OPEN',
    ]);
    const shadowRow = second
      .prepare(
        'SELECT safety_incomplete, completeness_gate, live_readiness FROM rw0_shadow_positions WHERE episode_id = ?',
      )
      .get(created.episodeId) as {
      safety_incomplete: number;
      completeness_gate: string;
      live_readiness: number;
    };
    expect(shadowRow.safety_incomplete).toBe(1);
    expect(shadowRow.completeness_gate).toBe('FAIL');
    expect(shadowRow.live_readiness).toBe(0);
    const paperOpenCount = second
      .prepare(`SELECT COUNT(*) AS count FROM rw0_episodes WHERE state = 'PAPER_OPEN'`)
      .get() as {
      count: number;
    };
    expect(paperOpenCount.count).toBe(0);
    second.close();
  });

  it('does not insert a duplicate shadow position on exact idempotent reopen', () => {
    const database = openInitializedRecoveryDatabase();
    const shadow = persistToShadow(database);
    const again = persistTransition(
      database,
      shadow.episodeId,
      { to: 'SHADOW_RESEARCH_OPEN', at: FIXTURE_SHADOW_AT, reason: 'unsafe_shadow' },
      { now: FIXTURE_NOW },
    );
    expect(again.idempotent).toBe(true);
    expect(() =>
      persistTransition(
        database,
        shadow.episodeId,
        { to: 'SHADOW_RESEARCH_OPEN', at: '2026-08-19T11:05:02.000Z', reason: 'duplicate' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/event identity differs/);
    const count = database.prepare('SELECT COUNT(*) AS count FROM rw0_shadow_positions').get() as {
      count: number;
    };
    expect(count.count).toBe(1);
    database.close();
  });

  it('refuses a stale DISCOVERED object from overwriting a newer DIP_CANDIDATE row', () => {
    const database = openInitializedRecoveryDatabase();
    const discovered = persistCreatedEpisode(database, discoveredEpisodeInput(), {
      now: FIXTURE_NOW,
    });
    persistTransition(
      database,
      discovered.episodeId,
      { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'filters_pass' },
      { now: FIXTURE_NOW },
    );
    expect(() =>
      persistTransition(
        database,
        discovered.episodeId,
        { to: 'CENSORED_UNAVAILABLE', at: '2026-08-19T11:02:00.000Z', reason: 'stale' },
        { now: FIXTURE_NOW },
        { updatedAt: discovered.updatedAt, state: 'DISCOVERED' },
      ),
    ).toThrow(/Stale recovery episode/);
    expect(loadEpisode(database, discovered.episodeId)?.state).toBe('DIP_CANDIDATE');
    expect(() =>
      persistTransition(
        database,
        discovered.episodeId,
        { to: 'EXPIRED', at: '2026-08-19T11:02:00.000Z', reason: 'from_old_object' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Illegal recovery episode transition DIP_CANDIDATE -> EXPIRED/);
    expect(loadEpisode(database, discovered.episodeId)?.state).toBe('DIP_CANDIDATE');
    database.close();
  });

  it('treats exact duplicate market observations as idempotent and conflicting duplicates as fail-closed', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    const first = persistMarketObservation(database, observationFor(created), { now: FIXTURE_NOW });
    const again = persistMarketObservation(database, observationFor(created), { now: FIXTURE_NOW });
    expect(first.idempotent).toBe(false);
    expect(again.idempotent).toBe(true);
    expect(() =>
      persistMarketObservation(database, observationFor(created, { priceUsd: 9.99 }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/Conflicting market observation/);
    const count = database
      .prepare('SELECT COUNT(*) AS count FROM rw0_market_observations')
      .get() as { count: number };
    expect(count.count).toBe(1);
    database.close();
  });

  it('rejects mismatched mint, pair, fingerprint, future evidence, and invalid numerics', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    expect(() =>
      persistMarketObservation(database, observationFor(created, { mint: FIXTURE_PAIR }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/mint must match/);
    expect(() =>
      persistMarketObservation(database, observationFor(created, { pairAddress: FIXTURE_MINT }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/pair must match/);
    expect(() =>
      persistMarketObservation(
        database,
        observationFor(created, { signalFingerprint: 'deadbeef' }),
        {
          now: FIXTURE_NOW,
        },
      ),
    ).toThrow(/fingerprints must match/);
    expect(() =>
      persistMarketObservation(
        database,
        observationFor(created, { collectedAt: '2026-08-19T13:00:00.000Z' }),
        {
          now: FIXTURE_NOW,
        },
      ),
    ).toThrow(/future/);
    expect(() =>
      persistMarketObservation(database, observationFor(created, { priceUsd: -1 }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/price > 0/);
    expect(() =>
      persistMarketObservation(database, observationFor(created, { liquidityUsd: -5 }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/>= 0/);
    database.close();
  });

  it('does not let unbound safety evidence change episode gates', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    expect(() => {
      persistSafetyEvidence(
        database,
        {
          evidenceId: 'unbound',
          episodeId: created.episodeId,
          mint: created.mint,
          pairAddress: created.pairAddress,
          confirmationObservedAt: FIXTURE_CONFIRM_AT,
          confirmationEventId: 'missing',
          kind: 'holder',
          status: 'UNKNOWN',
          observedAt: FIXTURE_CONFIRM_AT,
          collectedAt: FIXTURE_CONFIRM_AT,
          provider: null,
          provenance: 'unit_test',
          signalVersion: created.signalVersion,
          signalFingerprint: created.signalFingerprint,
          watcherSpecVersion: created.watcherSpecVersion,
          watcherSpecFingerprint: created.watcherSpecFingerprint,
          safetySpecVersion: 'rw0_safety_v2',
          safetySpecFingerprint: 'missing',
          payload: {
            kind: 'holder',
            denominatorKind: 'effective_circulating_supply',
            totalSupplyRaw: '1',
            denominatorRaw: '1',
            supplyReconciled: false,
            ownerCoverageComplete: false,
            sourceIsTop20Only: true,
            accounts: [],
          },
          reason:
            'holder coverage or supply reconciliation is incomplete; top-20-only evidence cannot pass',
        },
        { now: FIXTURE_NOW },
      );
    }).toThrow(/identity|confirmed recovery/i);
    expect(loadEpisode(database, created.episodeId)?.completenessGate).toBe('NOT_EVALUATED');
    database.close();
  });

  it('counts high-res slots for shadow positions, blocking a new RECOVERY_WATCH at 10', () => {
    const database = openInitializedRecoveryDatabase();
    const mints = [
      'So11111111111111111111111111111111111111112',
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
      'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So',
      '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
      'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
      'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
      'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
      'bSo13r4TkiE4KumL71LsHTPpL2euVFxQQyQvdKJfp4f',
      'jtojtomepa8beP8AuQc6eXt5FriJwfCMwQm2qJvqx6T',
    ];
    for (const mint of mints) {
      persistToShadow(database, mint);
    }
    expect(countHighResolutionWatchSlots(database)).toBe(10);
    const extraMint = '7dHbWXmci3dT8UFYWYZweBLXgycu7Y3iL6trKn1Y7ARj';
    const extra = persistCreatedEpisode(
      database,
      discoveredEpisodeInput({ mint: extraMint, pairAddress: extraMint }),
      { now: FIXTURE_NOW },
    );
    persistTransition(
      database,
      extra.episodeId,
      { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'filters_pass' },
      { now: FIXTURE_NOW },
    );
    expect(() =>
      persistTransition(
        database,
        extra.episodeId,
        { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'eleventh' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/watch slot cap is 10/);
    expect(loadEpisode(database, extra.episodeId)?.state).toBe('DIP_CANDIDATE');
    database.close();
  });

  it('enforces the DB-level one-active-episode-per-mint invariant', () => {
    const database = openInitializedRecoveryDatabase();
    persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    expect(() =>
      persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW }),
    ).toThrow(/one active recovery episode/);
    database.close();
  });

  it('fails closed on tampered persisted identity and tampered migration digest', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    database
      .prepare('UPDATE rw0_episodes SET signal_fingerprint = ? WHERE episode_id = ?')
      .run('deadbeef', created.episodeId);
    expect(() => loadEpisode(database, created.episodeId)).toThrow(/signal identity/);
    database
      .prepare(
        'UPDATE rw0_episodes SET signal_fingerprint = ?, watcher_spec_fingerprint = ? WHERE episode_id = ?',
      )
      .run(RECOVERY_V0_SIGNAL_FINGERPRINT, 'deadbeef', created.episodeId);
    expect(() => loadEpisode(database, created.episodeId)).toThrow(/watcher identity/);
    database
      .prepare('UPDATE rw0_episodes SET watcher_spec_fingerprint = ? WHERE episode_id = ?')
      .run(RW0_WATCHER_DEFINITION_FINGERPRINT, created.episodeId);
    expect(() =>
      database
        .prepare('UPDATE rw0_episodes SET completeness_gate = ? WHERE episode_id = ?')
        .run('PASS', created.episodeId),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare('UPDATE rw0_episodes SET holder_status = ? WHERE episode_id = ?')
        .run('PASS', created.episodeId),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare('UPDATE rw0_episodes SET bundle_status = ? WHERE episode_id = ?')
        .run('FAIL', created.episodeId),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare('UPDATE rw0_episodes SET creator_status = ? WHERE episode_id = ?')
        .run('PASS', created.episodeId),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare('UPDATE rw0_episodes SET track = ? WHERE episode_id = ?')
        .run('safety_approved', created.episodeId),
    ).toThrow(/CHECK constraint failed/);
    expect(() =>
      database
        .prepare('UPDATE rw0_episodes SET safe_entry_at = ? WHERE episode_id = ?')
        .run(FIXTURE_CONFIRM_AT, created.episodeId),
    ).toThrow(/CHECK constraint failed/);
    database
      .prepare('UPDATE rw0_episodes SET state = ? WHERE episode_id = ?')
      .run('CLOSED', created.episodeId);
    expect(() => loadEpisode(database, created.episodeId)).toThrow(/CLOSED is unreachable/);
    database
      .prepare('UPDATE rw0_episodes SET state = ? WHERE episode_id = ?')
      .run('DISCOVERED', created.episodeId);
    database
      .prepare('UPDATE rw0_episodes SET state = ? WHERE episode_id = ?')
      .run('PAPER_OPEN', created.episodeId);
    expect(() => loadEpisode(database, created.episodeId)).toThrow(
      /PAPER_ELIGIBLE\/PAPER_OPEN is unreachable/,
    );
    database
      .prepare('UPDATE rw0_schema_migrations SET sql_digest = ? WHERE version = 1')
      .run('00'.repeat(32));
    expect(() => {
      assertRecoveryMigrationIntegrity(database);
    }).toThrow(/migration 1 digest/);
    database.close();
  });

  it('rejects mismatched pair, future, and free-text shadow exit actions', () => {
    const database = openInitializedRecoveryDatabase();
    const shadow = persistToShadow(database);
    expect(() =>
      persistShadowExitObservation(
        database,
        {
          episodeId: shadow.episodeId,
          observedAt: '2026-08-19T11:06:00.000Z',
          pairAddress: FIXTURE_MINT,
          observedPriceUsd: 1.3,
          thresholdPriceUsd: null,
          overshootPct: null,
          gapFlag: false,
          action: 'hold',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/pair must match/);
    expect(() =>
      persistShadowExitObservation(
        database,
        {
          episodeId: shadow.episodeId,
          observedAt: '2026-08-19T13:00:00.000Z',
          pairAddress: FIXTURE_PAIR,
          observedPriceUsd: 1.3,
          thresholdPriceUsd: null,
          overshootPct: null,
          gapFlag: false,
          action: 'hold',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/future/);
    expect(() =>
      persistShadowExitObservation(
        database,
        {
          episodeId: shadow.episodeId,
          observedAt: '2026-08-19T11:06:00.000Z',
          pairAddress: FIXTURE_PAIR,
          observedPriceUsd: 1.3,
          thresholdPriceUsd: null,
          overshootPct: null,
          gapFlag: false,
          action: 'explode' as never,
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/defined enum value/);
    database.close();
  });

  it('does not close shadow research in rw0_v1', () => {
    const database = openInitializedRecoveryDatabase();
    const shadow = persistToShadow(database);
    expect(() =>
      persistTransition(
        database,
        shadow.episodeId,
        { to: 'CLOSED', at: '2026-08-19T11:30:00.000Z', reason: 'fake' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Shadow exit execution is not implemented/);
    expect(() =>
      persistTransition(
        database,
        shadow.episodeId,
        {
          to: 'CLOSED',
          at: '2026-08-19T11:30:00.000Z',
          reason: 'take_profit',
          closeEvidence: takeProfitCloseEvidence(),
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Shadow exit execution is not implemented/);
    expect(loadEpisode(database, shadow.episodeId)?.state).toBe('SHADOW_RESEARCH_OPEN');
    const exits = database
      .prepare('SELECT COUNT(*) AS count FROM rw0_shadow_exit_observations')
      .get() as {
      count: number;
    };
    expect(exits.count).toBe(0);
    expect(() =>
      persistShadowExitObservation(
        database,
        {
          episodeId: shadow.episodeId,
          observedAt: '2026-08-19T11:06:00.000Z',
          pairAddress: FIXTURE_PAIR,
          observedPriceUsd: 1.44,
          thresholdPriceUsd: 1.44,
          overshootPct: 0,
          gapFlag: false,
          action: 'take_profit_threshold',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Shadow exit execution is not implemented/);
    database.close();
  });

  it('binds confirmation persist to a stored market observation and rejects fabricated economics', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    persistTransition(
      database,
      created.episodeId,
      { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'filters_pass' },
      { now: FIXTURE_NOW },
    );
    persistTransition(
      database,
      created.episodeId,
      { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'admitted' },
      { now: FIXTURE_NOW },
    );
    expect(() =>
      persistTransition(
        database,
        created.episodeId,
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_CONFIRM_AT,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/persisted rw0_market_observations row/);
    persistMarketObservation(database, observationFor(created), { now: FIXTURE_NOW });
    expect(() =>
      persistTransition(
        database,
        created.episodeId,
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_CONFIRM_AT,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          recoveryConfirmationPriceUsd: 9.99,
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/does not match the persisted market observation/);
    expect(loadEpisode(database, created.episodeId)?.state).toBe('RECOVERY_WATCH');
    expect(loadEpisode(database, created.episodeId)?.recoveryConfirmationPriceUsd).toBeNull();
    expect(() =>
      persistTransition(
        database,
        created.episodeId,
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_CONFIRM_AT,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          observationPairAddress: FIXTURE_MINT,
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Confirmation pair must match/);
    expect(() =>
      persistTransition(
        database,
        created.episodeId,
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: '2026-08-19T11:06:00.000Z',
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          recoveryConfirmedAt: '2026-08-19T11:06:00.000Z',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/persisted rw0_market_observations row/);
    const confirmed = persistTransition(
      database,
      created.episodeId,
      {
        to: 'SIGNAL_PENDING_SAFETY',
        at: '2026-08-19T11:05:00Z',
        reason: 'recovery_confirmed',
        recoveryConfirmedAt: '2026-08-19T11:05:00Z',
      },
      { now: FIXTURE_NOW },
    ).episode;
    expect(confirmed.state).toBe('SIGNAL_PENDING_SAFETY');
    expect(confirmed.recoveryConfirmationPriceUsd).toBe(1.2);
    expect(confirmed.recoveryConfirmationLiquidityUsd).toBe(10_000);
    expect(confirmed.recoveryConfirmationVolume5mUsd).toBe(15_000);
    expect(confirmed.recoveryConfirmationVolumeToLiquidity5m).toBe(1.5);
    database.close();
  });

  it('cannot confirm an episode accidentally left in RECOVERY_WATCH for 5h', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    persistTransition(
      database,
      created.episodeId,
      { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'filters_pass' },
      { now: FIXTURE_NOW },
    );
    persistTransition(
      database,
      created.episodeId,
      { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'admitted' },
      { now: FIXTURE_NOW },
    );
    persistMarketObservation(
      database,
      observationFor(created, { collectedAt: FIXTURE_FIVE_HOURS_LATER }),
      { now: FIXTURE_LATE_NOW },
    );
    expect(() =>
      persistTransition(
        database,
        created.episodeId,
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_FIVE_HOURS_LATER,
          reason: 'recovery_confirmed',
          recoveryConfirmedAt: FIXTURE_FIVE_HOURS_LATER,
        },
        { now: FIXTURE_LATE_NOW },
      ),
    ).toThrow(/Exact TTL boundary belongs to EXPIRED/);
    expect(loadEpisode(database, created.episodeId)?.state).toBe('RECOVERY_WATCH');
    database.close();
  });

  it('rejects empty market-observation provenance and keeps insert bypass private', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput(), { now: FIXTURE_NOW });
    expect(() =>
      persistMarketObservation(database, observationFor(created, { provider: '   ' }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/non-empty provenance/);
    expect(() =>
      persistMarketObservation(database, observationFor(created, { source: '' }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/non-empty provenance/);
    expect(recoveryPersistence).not.toHaveProperty('insertEpisode');
    database.close();
  });
});
