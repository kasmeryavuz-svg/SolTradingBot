import { existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_PATH } from '../src/config/defaults.js';
import { DiscoveryError } from '../src/discovery/types.js';
import type { SourceRecord } from '../src/discovery/types.js';
import { MarketDataError } from '../src/market-data/types.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import {
  DEFAULT_RW0_DATABASE_PATH,
  RW0_LOCK_FILE_NAME,
  RW0_MARKET_PROVIDER,
  RW0_SCREENING_FETCH_CONCURRENCY,
  RW0_SCREENING_MARKET_SOURCE,
  RW0_WATCH_FETCH_CONCURRENCY,
  RW0_WATCH_MARKET_SOURCE,
} from '../src/recovery-watcher/constants.js';
import { runRecoveryCycle } from '../src/recovery-watcher/cycle.js';
import {
  initializeRecoveryDatabase,
  openRecoverySqlite,
  openRecoverySqliteReadOnly,
} from '../src/recovery-watcher/db/database.js';
import { RecoveryWatcherError } from '../src/recovery-watcher/errors.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
  recoveryScreeningId,
} from '../src/recovery-watcher/identity.js';
import { acquireRecoveryLock } from '../src/recovery-watcher/lock.js';
import {
  listEpisodesByMint,
  listMarketObservations,
  listScreeningObservations,
  loadRecoveryReportSnapshot,
  persistAdmittedDipWatch,
  persistCreatedEpisode,
  persistScreeningObservation,
  persistTransition,
} from '../src/recovery-watcher/persistence.js';
import { formatRecoveryReportLines, loadRecoveryReport } from '../src/recovery-watcher/report.js';
import { createRecoveryCycleMutex, runRecoveryWatcher } from '../src/recovery-watcher/runtime.js';
import {
  createScreeningObservation,
  screeningFromSnapshot,
  snapshotToMarketObservation,
} from '../src/recovery-watcher/screening.js';
import type {
  RecoveryWatcherConfig,
  ScreeningObservationRecord,
} from '../src/recovery-watcher/types.js';
import {
  discoveredEpisodeInput,
  FIXTURE_MINT,
  FIXTURE_NOW,
  FIXTURE_PAIR,
  openInitializedRecoveryDatabase,
  passingDipFields,
  tempRecoveryDatabasePath,
  tempRecoveryDirectory,
} from './recovery-watcher-fixtures.js';

const T0 = '2026-08-19T12:00:00.000Z';
const T1 = '2026-08-19T12:01:00.000Z';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mintAt(index: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const mark = alphabet[index % alphabet.length] ?? '2';
  return `${FIXTURE_MINT.slice(0, -2)}${mark}${mark}`;
}

function pairAt(index: number): string {
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const mark = alphabet[index % alphabet.length] ?? '2';
  return `${FIXTURE_PAIR.slice(0, -2)}${mark}${mark}`;
}

function sourceRecord(mint: string, source: SourceRecord['source']): SourceRecord {
  return {
    source,
    tokenMint: mint,
    dexScreenerUrl: null,
    description: null,
    links: [],
    profileUpdatedAt: null,
    boostAmount: source === 'dexscreener_boost' ? 1 : null,
    boostTotalAmount: source === 'dexscreener_boost' ? 1 : null,
  };
}

function marketSnapshot(
  overrides: Partial<MarketSnapshot> & { tokenMint: string; pairAddress: string },
): MarketSnapshot {
  return {
    chain: 'solana',
    tokenName: 'Test',
    tokenSymbol: 'TEST',
    dexId: 'raydium',
    quoteTokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    quoteTokenSymbol: 'USDC',
    priceUsd: 1,
    liquidityUsd: 8_000,
    volume5mUsd: 5_000,
    volume1hUsd: 1,
    volume24hUsd: 1,
    buys5m: 1,
    sells5m: 1,
    buys1h: 1,
    sells1h: 1,
    priceChange5mPct: -50,
    priceChange1hPct: 0,
    priceChange24hPct: 0,
    marketCapUsd: 1,
    fdvUsd: 1,
    pairCreatedAt: null,
    collectedAt: T0,
    ...overrides,
  };
}

function dipSnapshot(mint = FIXTURE_MINT, pair = FIXTURE_PAIR): MarketSnapshot {
  return marketSnapshot({
    tokenMint: mint,
    pairAddress: pair,
    priceUsd: 1,
    liquidityUsd: 8_000,
    volume5mUsd: 5_000,
    priceChange5mPct: -50,
  });
}

function notDipSnapshot(mint = FIXTURE_MINT, pair = FIXTURE_PAIR): MarketSnapshot {
  return marketSnapshot({ tokenMint: mint, pairAddress: pair, priceChange5mPct: -10 });
}

function confirmSnapshot(mint = FIXTURE_MINT, pair = FIXTURE_PAIR): MarketSnapshot {
  return marketSnapshot({
    tokenMint: mint,
    pairAddress: pair,
    priceUsd: 1.2,
    liquidityUsd: 10_000,
    volume5mUsd: 15_000,
    priceChange5mPct: -10,
  });
}

function testConfig(overrides: Partial<RecoveryWatcherConfig> = {}): RecoveryWatcherConfig {
  return {
    tradingEnabled: false,
    liveBroadcastEnabled: false,
    databasePath: DEFAULT_RW0_DATABASE_PATH,
    configuredProductionDatabasePath: DEFAULT_DATABASE_PATH,
    networkTimeoutMs: 10_000,
    screeningMaxCandidates: 20,
    ...overrides,
  };
}

function idleProviders() {
  return {
    profileFeed: {
      source: 'dexscreener_profile' as const,
      fetchRecords: () => Promise.resolve([]),
    },
    boostFeed: { source: 'dexscreener_boost' as const, fetchRecords: () => Promise.resolve([]) },
    screeningMarket: { getSnapshot: () => Promise.resolve(dipSnapshot()) },
    exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
  };
}

function admitWatch(
  database: ReturnType<typeof openInitializedRecoveryDatabase>,
  mint: string,
  pair: string,
): void {
  const created = persistCreatedEpisode(
    database,
    discoveredEpisodeInput({ mint, pairAddress: pair, ...passingDipFields() }),
    { now: FIXTURE_NOW },
  );
  persistTransition(
    database,
    created.episodeId,
    { to: 'DIP_CANDIDATE', at: '2026-08-19T11:00:01.000Z', reason: 'filters_pass' },
    { now: FIXTURE_NOW },
  );
  persistTransition(
    database,
    created.episodeId,
    { to: 'RECOVERY_WATCH', at: '2026-08-19T11:00:02.000Z', reason: 'admitted' },
    { now: FIXTURE_NOW },
  );
}

function validAdmissionInput(): {
  mint: string;
  observation: ReturnType<typeof snapshotToMarketObservation>;
  screening: ScreeningObservationRecord;
} {
  const snapshot = dipSnapshot();
  return {
    mint: snapshot.tokenMint,
    observation: snapshotToMarketObservation(snapshot, 'pending', RW0_SCREENING_MARKET_SOURCE),
    screening: screeningFromSnapshot(snapshot, 'dexscreener_profile', {
      disposition: 'DIP_PASS',
      dipFilterResult: 'PASS',
      reason: 'recovery_v0 dip filter passed',
    }),
  };
}

function insertRawScreening(
  database: ReturnType<typeof openInitializedRecoveryDatabase>,
  overrides: {
    mint?: string;
    screenedAt?: string;
    priceUsd?: number | null;
    liquidityUsd?: number | null;
    volume5mUsd?: number | null;
    priceChange5mPct?: number | null;
    dipFilterResult?: string;
    disposition?: string;
    reason?: string;
  } = {},
): void {
  const mint = overrides.mint ?? FIXTURE_MINT;
  const screenedAt = overrides.screenedAt ?? T0;
  const screeningId = recoveryScreeningId({
    mint,
    screenedAt,
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
    watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
  });
  database
    .prepare(
      `INSERT INTO rw0_screening_observations (
        screening_id, mint, screened_at, discovery_sources, provider, source, pair_address,
        price_usd, liquidity_usd, volume_5m_usd, price_change_5m_pct,
        signal_version, signal_fingerprint, watcher_spec_version, watcher_spec_fingerprint,
        dip_filter_result, disposition, reason, collected_at_is_local_collection_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      screeningId,
      mint,
      screenedAt,
      'dexscreener_profile',
      RW0_MARKET_PROVIDER,
      RW0_SCREENING_MARKET_SOURCE,
      FIXTURE_PAIR,
      overrides.priceUsd === undefined ? 1 : overrides.priceUsd,
      overrides.liquidityUsd === undefined ? 8_000 : overrides.liquidityUsd,
      overrides.volume5mUsd === undefined ? 5_000 : overrides.volume5mUsd,
      overrides.priceChange5mPct === undefined ? -10 : overrides.priceChange5mPct,
      'recovery_v0',
      RECOVERY_V0_SIGNAL_FINGERPRINT,
      'rw0_v2',
      RW0_WATCHER_DEFINITION_FINGERPRINT,
      overrides.dipFilterResult ?? 'NOT_DIP',
      overrides.disposition ?? 'NOT_DIP',
      overrides.reason ?? 'price_change_5m_pct outside [-60, -40]',
      1,
    );
}

describe('recovery watcher slice 2 repair', () => {
  it('polls 10 slow watches with bounded concurrency instead of serial 10x delay', async () => {
    const database = openInitializedRecoveryDatabase();
    for (let index = 1; index <= 10; index += 1) {
      admitWatch(database, mintAt(index), pairAt(index));
    }
    let inFlight = 0;
    let maxInFlight = 0;
    const started = performance.now();
    await runRecoveryCycle({
      database,
      config: testConfig(),
      clock: { now: () => new Date(T0) },
      ...idleProviders(),
      exactPairMarket: {
        getSnapshotForPair: async (tokenMint, pairAddress) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await delay(80);
          inFlight -= 1;
          return confirmSnapshot(tokenMint, pairAddress);
        },
      },
    });
    const elapsed = performance.now() - started;
    expect(maxInFlight).toBe(RW0_WATCH_FETCH_CONCURRENCY);
    expect(maxInFlight).toBe(10);
    expect(elapsed).toBeLessThan(80 * 5);
    expect(elapsed).toBeLessThan(80 * 10);
  });

  it('bounds screening enrichment concurrency', async () => {
    const database = openInitializedRecoveryDatabase();
    const mints = Array.from({ length: 8 }, (_, index) => mintAt(index + 1));
    let inFlight = 0;
    let maxInFlight = 0;
    await runRecoveryCycle({
      database,
      config: testConfig(),
      clock: { now: () => new Date(T0) },
      profileFeed: {
        source: 'dexscreener_profile',
        fetchRecords: () =>
          Promise.resolve(mints.map((mint) => sourceRecord(mint, 'dexscreener_profile'))),
      },
      boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
      screeningMarket: {
        getSnapshot: async (tokenMint) => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await delay(40);
          inFlight -= 1;
          return notDipSnapshot(tokenMint, pairAt(1));
        },
      },
      exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
    });
    expect(maxInFlight).toBeLessThanOrEqual(RW0_SCREENING_FETCH_CONCURRENCY);
    expect(maxInFlight).toBe(RW0_SCREENING_FETCH_CONCURRENCY);
  });

  it('does not let slow screening push due watch polling out by several minutes or catch up missed cycles', async () => {
    const path = tempRecoveryDatabasePath();
    const fileDb = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(fileDb);
    admitWatch(fileDb, FIXTURE_MINT, FIXTURE_PAIR);
    fileDb.close();

    const mints = Array.from({ length: 20 }, (_, index) => mintAt(index + 1));
    const watchPolls: number[] = [];
    const sleeps: number[] = [];
    let mono = 0;
    const abort = new AbortController();
    await runRecoveryWatcher({
      config: testConfig({ databasePath: path }),
      abort: abort.signal,
      clock: { now: () => new Date(T0) },
      liveness: { isAlive: () => false },
      pid: 515151,
      processStartedAtMs: 11,
      monotonicNow: () => mono,
      providers: {
        profileFeed: {
          source: 'dexscreener_profile',
          fetchRecords: () =>
            Promise.resolve(mints.map((mint) => sourceRecord(mint, 'dexscreener_profile'))),
        },
        boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
        screeningMarket: {
          getSnapshot: async (tokenMint) => {
            const start = mono;
            await Promise.resolve();
            if (mono < start + 10_000) {
              mono = start + 10_000;
            }
            return notDipSnapshot(tokenMint, pairAt(1));
          },
        },
        exactPairMarket: {
          getSnapshotForPair: () => {
            watchPolls.push(mono);
            return Promise.resolve(dipSnapshot());
          },
        },
      },
      sleep: (ms) => {
        sleeps.push(ms);
        mono += ms;
        return Promise.resolve();
      },
      onCycle: () => {
        if (watchPolls.length >= 2 || sleeps.length >= 3) {
          abort.abort();
        }
      },
    });
    expect(watchPolls[0]).toBe(0);
    expect(watchPolls[1]).toBe(60_000);
    expect((watchPolls[1] ?? 0) - (watchPolls[0] ?? 0)).toBe(60_000);
    expect(watchPolls[1]).toBeLessThan(200_000);
    expect(sleeps.every((ms) => ms >= 0)).toBe(true);
    expect(sleeps.filter((ms) => ms === 0)).toEqual([]);
  });

  it('runs only one overdue pass after an overrun instead of a catch-up storm', async () => {
    const path = tempRecoveryDatabasePath();
    const fileDb = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(fileDb);
    fileDb.close();
    const sleeps: number[] = [];
    const abort = new AbortController();
    let mono = 0;
    let cycles = 0;
    await runRecoveryWatcher({
      config: testConfig({ databasePath: path }),
      abort: abort.signal,
      clock: { now: () => new Date(T0) },
      liveness: { isAlive: () => false },
      pid: 525252,
      processStartedAtMs: 12,
      monotonicNow: () => mono,
      providers: idleProviders(),
      sleep: (ms) => {
        sleeps.push(ms);
        mono += ms;
        return Promise.resolve();
      },
      onCycle: () => {
        cycles += 1;
        if (cycles === 1) {
          mono += 90_000;
        }
        if (cycles >= 3) {
          abort.abort();
        }
      },
    });
    expect(cycles).toBe(3);
    expect(sleeps).toEqual([60_000]);
  });

  it('rejects overlapping cycles while a watch/screening pass is running', async () => {
    const mutex = createRecoveryCycleMutex();
    let release: () => void = () => undefined;
    const hanging = new Promise<MarketSnapshot>((resolve) => {
      release = () => {
        resolve(confirmSnapshot());
      };
    });
    const database = openInitializedRecoveryDatabase();
    admitWatch(database, FIXTURE_MINT, FIXTURE_PAIR);
    const first = mutex.run(() =>
      runRecoveryCycle({
        database,
        config: testConfig(),
        clock: { now: () => new Date(T0) },
        ...idleProviders(),
        exactPairMarket: { getSnapshotForPair: () => hanging },
      }),
    );
    await delay(20);
    await expect(
      mutex.run(() =>
        runRecoveryCycle({
          database,
          config: testConfig(),
          clock: { now: () => new Date(T1) },
          ...idleProviders(),
        }),
      ),
    ).rejects.toMatchObject({ code: 'overlapping_cycle' });
    release();
    await first;
  });

  it('treats known MarketDataError and DiscoveryError as recoverable and TypeError as fatal', async () => {
    const recoverable = openInitializedRecoveryDatabase();
    const metrics = await runRecoveryCycle({
      database: recoverable,
      config: testConfig(),
      clock: { now: () => new Date(T0) },
      profileFeed: {
        source: 'dexscreener_profile',
        fetchRecords: () => Promise.reject(new DiscoveryError('profile unavailable')),
      },
      boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
      screeningMarket: {
        getSnapshot: () => Promise.reject(new MarketDataError('screening unavailable')),
      },
      exactPairMarket: {
        getSnapshotForPair: () => Promise.reject(new MarketDataError('exact pair unavailable')),
      },
    });
    expect(metrics.discoveryFailures).toBe(1);
    expect(metrics.providerFailures).toBe(1);

    const fatal = openInitializedRecoveryDatabase();
    await expect(
      runRecoveryCycle({
        database: fatal,
        config: testConfig(),
        clock: { now: () => new Date(T0) },
        profileFeed: {
          source: 'dexscreener_profile',
          fetchRecords: () => Promise.resolve([sourceRecord(FIXTURE_MINT, 'dexscreener_profile')]),
        },
        boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
        screeningMarket: {
          getSnapshot: () => Promise.reject(new TypeError('programming bug')),
        },
        exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(
      listScreeningObservations(fatal).every((row) => row.disposition !== 'MARKET_UNAVAILABLE'),
    ).toBe(true);
  });

  it('fails the runtime when a provider throws TypeError instead of counting it as provider_unavailable', async () => {
    const path = tempRecoveryDatabasePath();
    const fileDb = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(fileDb);
    fileDb.close();
    await expect(
      runRecoveryWatcher({
        config: testConfig({ databasePath: path }),
        once: true,
        clock: { now: () => new Date(T0) },
        liveness: { isAlive: () => false },
        pid: 535353,
        processStartedAtMs: 13,
        providers: {
          ...idleProviders(),
          profileFeed: {
            source: 'dexscreener_profile',
            fetchRecords: () => Promise.reject(new TypeError('programming bug')),
          },
        },
      }),
    ).rejects.toBeInstanceOf(TypeError);
    const lockPath = join(path, '..', RW0_LOCK_FILE_NAME);
    expect(existsSync(lockPath)).toBe(false);
  });

  it('binds admission evidence and recomputes the dip filter inside the transaction', () => {
    const database = openInitializedRecoveryDatabase();
    const valid = validAdmissionInput();
    const created = persistAdmittedDipWatch(database, valid, { now: new Date(T0) });
    expect(created.created).toBe(true);
    expect(created.episode.state).toBe('RECOVERY_WATCH');

    const cases: Array<[string, () => void]> = [
      [
        'mint mismatch',
        () => {
          persistAdmittedDipWatch(
            database,
            {
              ...validAdmissionInput(),
              mint: mintAt(3),
              screening: { ...validAdmissionInput().screening, mint: mintAt(3) },
            },
            { now: new Date(T0) },
          );
        },
      ],
      [
        'pair mismatch',
        () => {
          const input = validAdmissionInput();
          persistAdmittedDipWatch(
            database,
            { ...input, screening: { ...input.screening, pairAddress: pairAt(4) } },
            { now: new Date(T0) },
          );
        },
      ],
      [
        'timestamp mismatch',
        () => {
          const input = validAdmissionInput();
          persistAdmittedDipWatch(
            database,
            { ...input, screening: { ...input.screening, screenedAt: T1 } },
            { now: new Date(T1) },
          );
        },
      ],
      [
        'price mismatch',
        () => {
          const input = validAdmissionInput();
          persistAdmittedDipWatch(
            database,
            { ...input, screening: { ...input.screening, priceUsd: 9 } },
            { now: new Date(T0) },
          );
        },
      ],
      [
        'volume mismatch',
        () => {
          const input = validAdmissionInput();
          persistAdmittedDipWatch(
            database,
            { ...input, screening: { ...input.screening, volume5mUsd: 9_000 } },
            { now: new Date(T0) },
          );
        },
      ],
      [
        'liquidity mismatch',
        () => {
          const input = validAdmissionInput();
          persistAdmittedDipWatch(
            database,
            { ...input, screening: { ...input.screening, liquidityUsd: 9_000 } },
            { now: new Date(T0) },
          );
        },
      ],
      [
        'change mismatch',
        () => {
          const input = validAdmissionInput();
          persistAdmittedDipWatch(
            database,
            { ...input, screening: { ...input.screening, priceChange5mPct: -45 } },
            { now: new Date(T0) },
          );
        },
      ],
      [
        'forged DIP_PASS',
        () => {
          const snapshot = notDipSnapshot();
          persistAdmittedDipWatch(
            database,
            {
              mint: snapshot.tokenMint,
              observation: snapshotToMarketObservation(
                snapshot,
                'pending',
                RW0_SCREENING_MARKET_SOURCE,
              ),
              screening: screeningFromSnapshot(snapshot, 'dexscreener_profile', {
                disposition: 'DIP_PASS',
                dipFilterResult: 'PASS',
                reason: 'forged',
              }),
            },
            { now: new Date(T0) },
          );
        },
      ],
    ];
    for (const [label, run] of cases) {
      expect(run, label).toThrow(RecoveryWatcherError);
    }
  });

  it('rejects admission when screening and market provenance do not describe the same DexScreener screening event', () => {
    const database = openInitializedRecoveryDatabase();
    const exact = persistAdmittedDipWatch(database, validAdmissionInput(), { now: new Date(T0) });
    expect(exact.created).toBe(true);
    expect(exact.episode.state).toBe('RECOVERY_WATCH');

    const otherMint = mintAt(8);
    const otherDip = dipSnapshot(otherMint, pairAt(8));
    const base = {
      mint: otherMint,
      observation: snapshotToMarketObservation(otherDip, 'pending', RW0_SCREENING_MARKET_SOURCE),
      screening: screeningFromSnapshot(otherDip, 'dexscreener_profile', {
        disposition: 'DIP_PASS',
        dipFilterResult: 'PASS',
        reason: 'recovery_v0 dip filter passed',
      }),
    };
    expect(() =>
      persistAdmittedDipWatch(
        database,
        {
          ...base,
          observation: { ...base.observation, provider: 'birdeye' },
        },
        { now: new Date(T0) },
      ),
    ).toThrow(/provider\/source must match/);
    expect(() =>
      persistAdmittedDipWatch(
        database,
        {
          ...base,
          observation: { ...base.observation, source: RW0_WATCH_MARKET_SOURCE },
        },
        { now: new Date(T0) },
      ),
    ).toThrow(/provider\/source must match/);
    expect(() =>
      persistAdmittedDipWatch(
        database,
        {
          ...base,
          observation: { ...base.observation, provider: 'birdeye', source: 'custom-feed' },
          screening: { ...base.screening, provider: 'birdeye', source: 'custom-feed' },
        },
        { now: new Date(T0) },
      ),
    ).toThrow(/frozen DexScreener screening snapshot provenance/);
  });

  it('rejects screening identity tamper on persist, hydrate, and report', () => {
    const database = openInitializedRecoveryDatabase();
    const fakeSignal = 'ab'.repeat(32);
    const fakeWatcher = 'cd'.repeat(32);
    const screenedAt = T0;
    const screeningId = recoveryScreeningId({
      mint: FIXTURE_MINT,
      screenedAt,
      signalFingerprint: fakeSignal,
      watcherSpecFingerprint: fakeWatcher,
    });
    expect(() =>
      persistScreeningObservation(
        database,
        {
          ...createScreeningObservation({
            mint: FIXTURE_MINT,
            screenedAt,
            discoverySources: 'dexscreener_profile',
            disposition: 'NOT_DIP',
            reason: 'price_change_5m_pct outside [-60, -40]',
            priceUsd: 1,
            liquidityUsd: 8_000,
            volume5mUsd: 5_000,
            priceChange5mPct: -10,
          }),
          screeningId,
          signalFingerprint: fakeSignal,
          watcherSpecFingerprint: fakeWatcher,
        },
        { now: new Date(T0) },
      ),
    ).toThrow(/does not match frozen/);

    database
      .prepare(
        `INSERT INTO rw0_screening_observations (
          screening_id, mint, screened_at, discovery_sources, provider, source, pair_address,
          price_usd, liquidity_usd, volume_5m_usd, price_change_5m_pct,
          signal_version, signal_fingerprint, watcher_spec_version, watcher_spec_fingerprint,
          dip_filter_result, disposition, reason, collected_at_is_local_collection_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        screeningId,
        FIXTURE_MINT,
        screenedAt,
        'dexscreener_profile',
        'dexscreener',
        'token-pairs/v1',
        FIXTURE_PAIR,
        1,
        8_000,
        5_000,
        -10,
        'recovery_v0',
        fakeSignal,
        'rw0_v2',
        fakeWatcher,
        'NOT_DIP',
        'NOT_DIP',
        'tamper',
        1,
      );
    expect(() => listScreeningObservations(database)).toThrow(/does not match frozen/);
    expect(() => loadRecoveryReportSnapshot(database)).toThrow(/does not match frozen/);
    expect(RECOVERY_V0_SIGNAL_FINGERPRINT).not.toBe(fakeSignal);
    expect(RW0_WATCHER_DEFINITION_FINGERPRINT).not.toBe(fakeWatcher);
  });

  it('rejects non-finite and negative screening numeric evidence and requires dip fields for DIP_PASS', () => {
    const database = openInitializedRecoveryDatabase();
    const base = {
      mint: FIXTURE_MINT,
      screenedAt: T0,
      discoverySources: 'dexscreener_profile',
      disposition: 'NOT_DIP' as const,
      reason: 'price_change_5m_pct outside [-60, -40]',
      provider: 'dexscreener',
      source: 'token-pairs/v1',
      pairAddress: FIXTURE_PAIR,
      priceUsd: 1,
      liquidityUsd: 8_000,
      volume5mUsd: 5_000,
      priceChange5mPct: -10,
    };
    expect(() =>
      persistScreeningObservation(
        database,
        createScreeningObservation({ ...base, liquidityUsd: Number.NaN }),
        {
          now: new Date(T0),
        },
      ),
    ).toThrow(/finite number >= 0/);
    expect(() =>
      persistScreeningObservation(
        database,
        createScreeningObservation({ ...base, volume5mUsd: Number.POSITIVE_INFINITY }),
        {
          now: new Date(T0),
        },
      ),
    ).toThrow(/finite number >= 0/);
    expect(() =>
      persistScreeningObservation(
        database,
        createScreeningObservation({ ...base, liquidityUsd: -1 }),
        {
          now: new Date(T0),
        },
      ),
    ).toThrow(/finite number >= 0/);
    expect(() =>
      persistScreeningObservation(
        database,
        createScreeningObservation({ ...base, volume5mUsd: -5 }),
        {
          now: new Date(T0),
        },
      ),
    ).toThrow(/finite number >= 0/);
    expect(() =>
      persistScreeningObservation(
        database,
        createScreeningObservation({ ...base, priceUsd: Number.POSITIVE_INFINITY }),
        {
          now: new Date(T0),
        },
      ),
    ).toThrow(/finite price > 0/);
    expect(() =>
      persistScreeningObservation(
        database,
        createScreeningObservation({
          mint: FIXTURE_MINT,
          screenedAt: T0,
          discoverySources: 'dexscreener_profile',
          disposition: 'DIP_PASS',
          reason: 'recovery_v0 dip filter passed',
          provider: 'dexscreener',
          source: 'token-pairs/v1',
          pairAddress: FIXTURE_PAIR,
          priceUsd: 1,
          liquidityUsd: 8_000,
          volume5mUsd: null,
          priceChange5mPct: -50,
        }),
        { now: new Date(T0) },
      ),
    ).toThrow(/dip_filter_result=PASS must recompute/);
  });

  it('fails closed when hydrated screening SQL evidence is numerically or semantically corrupt', () => {
    const negativeLiquidity = openInitializedRecoveryDatabase();
    insertRawScreening(negativeLiquidity, { liquidityUsd: -1 });
    expect(() => listScreeningObservations(negativeLiquidity)).toThrow(/finite number >= 0/);
    expect(() => loadRecoveryReportSnapshot(negativeLiquidity)).toThrow(/finite number >= 0/);

    const negativeVolume = openInitializedRecoveryDatabase();
    insertRawScreening(negativeVolume, { volume5mUsd: -5 });
    expect(() => listScreeningObservations(negativeVolume)).toThrow(/finite number >= 0/);
    expect(() => loadRecoveryReportSnapshot(negativeVolume)).toThrow(/finite number >= 0/);

    const forgedPass = openInitializedRecoveryDatabase();
    insertRawScreening(forgedPass, {
      disposition: 'DIP_PASS',
      dipFilterResult: 'PASS',
      priceChange5mPct: -10,
      reason: 'forged persisted PASS',
    });
    expect(() => listScreeningObservations(forgedPass)).toThrow(
      /dip_filter_result=PASS must recompute/,
    );
    expect(() => loadRecoveryReportSnapshot(forgedPass)).toThrow(
      /dip_filter_result=PASS must recompute/,
    );

    const path = tempRecoveryDatabasePath();
    const fileDb = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(fileDb);
    insertRawScreening(fileDb, {
      disposition: 'DIP_PASS',
      dipFilterResult: 'PASS',
      priceChange5mPct: -10,
      reason: 'forged persisted PASS',
    });
    fileDb.close();
    expect(() => formatRecoveryReportLines(testConfig({ databasePath: path }))).toThrow(
      /dip_filter_result=PASS must recompute/,
    );

    const valid = openInitializedRecoveryDatabase();
    insertRawScreening(valid);
    const rows = listScreeningObservations(valid);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.disposition).toBe('NOT_DIP');
    expect(rows[0]?.dipFilterResult).toBe('NOT_DIP');
    expect(loadRecoveryReportSnapshot(valid).screeningByDisposition.NOT_DIP).toBe(1);
  });

  it('opens reports read-only without creating a missing database or mutating an existing one', () => {
    const missing = join(tempRecoveryDirectory(), 'recovery-watcher.sqlite');
    const missingLines = formatRecoveryReportLines(testConfig({ databasePath: missing }));
    expect(missingLines.join('\n')).toContain('not initialized');
    expect(existsSync(missing)).toBe(false);

    const path = tempRecoveryDatabasePath();
    const writable = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(writable);
    persistScreeningObservation(
      writable,
      createScreeningObservation({
        mint: FIXTURE_MINT,
        screenedAt: T0,
        discoverySources: 'dexscreener_profile',
        disposition: 'NOT_DIP',
        reason: 'price_change_5m_pct outside [-60, -40]',
        provider: 'dexscreener',
        source: 'token-pairs/v1',
        pairAddress: FIXTURE_PAIR,
        priceUsd: 1,
        liquidityUsd: 8_000,
        volume5mUsd: 5_000,
        priceChange5mPct: -10,
      }),
      { now: new Date(T0) },
    );
    const beforeCount = listScreeningObservations(writable).length;
    writable.close();
    const before = statSync(path);
    const snapshot = loadRecoveryReport(testConfig({ databasePath: path }));
    expect(snapshot?.screeningCount).toBe(1);
    const after = statSync(path);
    expect(after.size).toBe(before.size);
    expect(after.mtimeMs).toBe(before.mtimeMs);

    const reportDb = openRecoverySqliteReadOnly(path, {
      configuredProductionPath: DEFAULT_DATABASE_PATH,
    });
    expect(() => {
      reportDb.exec("UPDATE rw0_screening_observations SET reason = 'tamper'");
    }).toThrow();
    expect(() => {
      reportDb.exec('DELETE FROM rw0_screening_observations');
    }).toThrow();
    reportDb.close();
    const reread = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    expect(listScreeningObservations(reread)).toHaveLength(beforeCount);
    reread.close();
  });

  it('reports chronological first/last bounds across screening and market tables', () => {
    const database = openInitializedRecoveryDatabase();
    persistScreeningObservation(
      database,
      createScreeningObservation({
        mint: mintAt(1),
        screenedAt: '2026-08-19T11:00:00.000Z',
        discoverySources: 'dexscreener_profile',
        disposition: 'NOT_DIP',
        reason: 'price_change_5m_pct outside [-60, -40]',
        provider: 'dexscreener',
        source: 'token-pairs/v1',
        pairAddress: pairAt(1),
        priceUsd: 1,
        liquidityUsd: 8_000,
        volume5mUsd: 5_000,
        priceChange5mPct: -10,
      }),
      { now: new Date('2026-08-19T13:00:00.000Z') },
    );
    persistAdmittedDipWatch(database, validAdmissionInput(), { now: new Date(T0) });
    persistScreeningObservation(
      database,
      createScreeningObservation({
        mint: mintAt(2),
        screenedAt: '2026-08-19T13:00:00.000Z',
        discoverySources: 'dexscreener_profile',
        disposition: 'NOT_DIP',
        reason: 'price_change_5m_pct outside [-60, -40]',
        provider: 'dexscreener',
        source: 'token-pairs/v1',
        pairAddress: pairAt(2),
        priceUsd: 1,
        liquidityUsd: 8_000,
        volume5mUsd: 5_000,
        priceChange5mPct: -10,
      }),
      { now: new Date('2026-08-19T13:00:00.000Z') },
    );
    const snapshot = loadRecoveryReportSnapshot(database);
    expect(snapshot.firstObservationAt).toBe('2026-08-19T11:00:00.000Z');
    expect(snapshot.lastObservationAt).toBe('2026-08-19T13:00:00.000Z');
    const market = listMarketObservations(
      database,
      listEpisodesByMint(database, FIXTURE_MINT)[0]?.episodeId ?? '',
    );
    expect(market[0]?.collectedAt).toBe(T0);
    expect(snapshot.firstObservationAt).not.toBe(T0);
    expect(snapshot.lastObservationAt).not.toBe(T0);
  });

  it('acquires the singleton lock before creating or migrating the recovery database', async () => {
    const directory = tempRecoveryDirectory();
    const dbPath = join(directory, 'recovery-watcher.sqlite');
    acquireRecoveryLock({
      directory,
      pid: 99,
      processStartedAtMs: 1_000,
      runtimeStartedAt: T0,
      liveness: { isAlive: (pid) => pid === 99 },
    });
    await expect(
      runRecoveryWatcher({
        config: testConfig({ databasePath: dbPath }),
        once: true,
        clock: { now: () => new Date(T0) },
        liveness: { isAlive: (pid) => pid === 99 },
        pid: 100,
        processStartedAtMs: 2_000,
        providers: idleProviders(),
      }),
    ).rejects.toMatchObject({ code: 'lock_already_held' });
    expect(existsSync(dbPath)).toBe(false);
  });

  it('releases only the owned lock after a post-lock failure and does not import production runtime', async () => {
    const path = tempRecoveryDatabasePath();
    await expect(
      runRecoveryWatcher({
        config: testConfig({ databasePath: path }),
        once: true,
        clock: { now: () => new Date(T0) },
        liveness: { isAlive: () => false },
        pid: 545454,
        processStartedAtMs: 14,
        providers: {
          ...idleProviders(),
          screeningMarket: {
            getSnapshot: () => Promise.reject(new TypeError('programming bug')),
          },
          profileFeed: {
            source: 'dexscreener_profile',
            fetchRecords: () =>
              Promise.resolve([sourceRecord(FIXTURE_MINT, 'dexscreener_profile')]),
          },
        },
      }),
    ).rejects.toBeInstanceOf(TypeError);
    expect(existsSync(join(path, '..', RW0_LOCK_FILE_NAME))).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  it('timestamps discovery-only screening rows after the discovery HTTP responses complete', async () => {
    const database = openInitializedRecoveryDatabase();
    admitWatch(database, FIXTURE_MINT, FIXTURE_PAIR);
    let nowMs = Date.parse(T0);
    await runRecoveryCycle({
      database,
      config: testConfig(),
      clock: { now: () => new Date(nowMs) },
      profileFeed: {
        source: 'dexscreener_profile',
        fetchRecords: () => {
          nowMs += 5_000;
          return Promise.resolve([sourceRecord(FIXTURE_MINT, 'dexscreener_profile')]);
        },
      },
      boostFeed: {
        source: 'dexscreener_boost',
        fetchRecords: () => {
          nowMs += 1_000;
          return Promise.resolve([]);
        },
      },
      screeningMarket: { getSnapshot: () => Promise.resolve(dipSnapshot()) },
      exactPairMarket: { getSnapshotForPair: () => Promise.resolve(dipSnapshot()) },
    });
    const discoveryRows = listScreeningObservations(database).filter(
      (row) => row.disposition === 'ALREADY_ACTIVE',
    );
    expect(discoveryRows).toHaveLength(1);
    expect(Date.parse(discoveryRows[0]?.screenedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(T0) + 5_000,
    );
    expect(discoveryRows[0]?.screenedAt).not.toBe(T0);
  });
});
