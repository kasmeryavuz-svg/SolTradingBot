import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_DATABASE_PATH } from '../src/config/defaults.js';
import type { DiscoveryFeedProvider } from '../src/discovery/provider.js';
import type { SourceRecord } from '../src/discovery/types.js';
import type { ExactPairMarketDataProvider, MarketDataProvider } from '../src/market-data/provider.js';
import { MarketDataError, type MarketSnapshot } from '../src/market-data/types.js';
import { RecoveryWatcherError } from '../src/recovery-watcher/errors.js';
import { prepareRecoveryRunCommand } from '../src/recovery-watcher/command.js';
import { runRecoveryCycle } from '../src/recovery-watcher/cycle.js';
import {
  countHighResolutionWatchSlots,
  countShadowPositions,
  listActiveEpisodes,
  listEpisodesByMint,
  listEpisodesInState,
  listMarketObservations,
  listSafetyEvidence,
  listScreeningObservations,
  listTransitions,
  loadEpisode,
  persistCreatedEpisode,
  persistMarketObservation,
  persistScreeningObservation,
  persistTransition,
} from '../src/recovery-watcher/persistence.js';
import { createScreeningObservation, snapshotToMarketObservation } from '../src/recovery-watcher/screening.js';
import { RW0_WATCH_MARKET_SOURCE } from '../src/recovery-watcher/constants.js';
import { createRecoveryCycleMutex, runRecoveryWatcher } from '../src/recovery-watcher/runtime.js';
import { formatRecoveryReportLines } from '../src/recovery-watcher/report.js';
import { RECOVERY_V0_SIGNAL_FINGERPRINT, RW0_WATCHER_DEFINITION_FINGERPRINT } from '../src/recovery-watcher/identity.js';
import { recoveryMigrationSqlDigest } from '../src/recovery-watcher/db/migrations.js';
import type { RecoveryWatcherConfig } from '../src/recovery-watcher/types.js';
import {
  discoveredEpisodeInput,
  FIXTURE_MINT,
  FIXTURE_NOW,
  FIXTURE_PAIR,
  openInitializedRecoveryDatabase,
  passingConfirmationFields,
  passingDipFields,
  tempRecoveryDatabasePath,
  tempRecoveryDirectory,
} from './recovery-watcher-fixtures.js';
import { DEFAULT_RW0_DATABASE_PATH } from '../src/recovery-watcher/constants.js';
import { initializeRecoveryDatabase, openRecoverySqlite } from '../src/recovery-watcher/db/database.js';
import { addMs } from '../src/recovery-watcher/clock.js';

const T0 = '2026-08-19T12:00:00.000Z';
const T1 = '2026-08-19T12:01:00.000Z';
const TTL = addMs(T0, 7_200_000);
const TTL_MINUS_1MS = '2026-08-19T13:59:59.999Z';

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

function marketSnapshot(overrides: Partial<MarketSnapshot> & { tokenMint: string; pairAddress: string }): MarketSnapshot {
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

function notDipSnapshot(mint = FIXTURE_MINT, pair = FIXTURE_PAIR): MarketSnapshot {
  return marketSnapshot({
    tokenMint: mint,
    pairAddress: pair,
    priceChange5mPct: -10,
  });
}

function incompleteSnapshot(mint = FIXTURE_MINT, pair = FIXTURE_PAIR): MarketSnapshot {
  return marketSnapshot({
    tokenMint: mint,
    pairAddress: pair,
    priceChange5mPct: null,
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

function createHarness(overrides: Partial<RecoveryWatcherConfig> = {}) {
  const database = openInitializedRecoveryDatabase();
  let nowMs = Date.parse(T0);
  const clock = { now: () => new Date(nowMs) };
  let profileRecords: SourceRecord[] = [];
  let boostRecords: SourceRecord[] = [];
  const screening = new Map<string, MarketSnapshot | Error>();
  const exact = new Map<string, MarketSnapshot | Error>();
  let screeningFetches = 0;
  let exactFetches = 0;
  let discoveryCalls = 0;
  const config = testConfig(overrides);
  const profileFeed: DiscoveryFeedProvider = {
    source: 'dexscreener_profile',
    fetchRecords: () => {
      discoveryCalls += 1;
      return Promise.resolve(profileRecords);
    },
  };
  const boostFeed: DiscoveryFeedProvider = {
    source: 'dexscreener_boost',
    fetchRecords: () => {
      discoveryCalls += 1;
      return Promise.resolve(boostRecords);
    },
  };
  const screeningMarket: MarketDataProvider = {
    getSnapshot: (tokenMint) => {
      screeningFetches += 1;
      const value = screening.get(tokenMint);
      if (value instanceof Error) {
        return Promise.reject(value);
      }
      if (value === undefined) {
        return Promise.reject(new MarketDataError('screening snapshot missing'));
      }
      return Promise.resolve({ ...value, tokenMint, collectedAt: clock.now().toISOString() });
    },
  };
  const exactPairMarket: ExactPairMarketDataProvider = {
    getSnapshotForPair: (tokenMint, pairAddress) => {
      exactFetches += 1;
      const value = exact.get(`${tokenMint}:${pairAddress}`) ?? exact.get(tokenMint);
      if (value instanceof Error) {
        return Promise.reject(value);
      }
      if (value === undefined) {
        return Promise.reject(new MarketDataError('exact pair snapshot missing'));
      }
      if (value.pairAddress !== pairAddress) {
        return Promise.reject(new Error('exact-pair provider must not fall back to another pair'));
      }
      return Promise.resolve({ ...value, tokenMint, pairAddress, collectedAt: clock.now().toISOString() });
    },
  };
  return {
    database,
    config,
    clock,
    get discoveryCalls() {
      return discoveryCalls;
    },
    get screeningFetches() {
      return screeningFetches;
    },
    get exactFetches() {
      return exactFetches;
    },
    setNow(iso: string) {
      nowMs = Date.parse(iso);
    },
    setProfile(mints: string[]) {
      profileRecords = mints.map((mint) => sourceRecord(mint, 'dexscreener_profile'));
    },
    setBoost(mints: string[]) {
      boostRecords = mints.map((mint) => sourceRecord(mint, 'dexscreener_boost'));
    },
    setScreening(mint: string, snapshot: MarketSnapshot | Error) {
      screening.set(mint, snapshot);
    },
    setExact(mint: string, pair: string, snapshot: MarketSnapshot | Error) {
      exact.set(`${mint}:${pair}`, snapshot);
    },
    cycle() {
      return runRecoveryCycle({
        database,
        config,
        clock,
        profileFeed,
        boostFeed,
        screeningMarket,
        exactPairMarket,
      });
    },
  };
}

describe('recovery watcher slice 2', () => {
  it('does not create an episode for ordinary NOT_DIP screening', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, notDipSnapshot());
    const metrics = await harness.cycle();
    expect(metrics.screeningByDisposition.NOT_DIP).toBe(1);
    expect(listEpisodesByMint(harness.database, FIXTURE_MINT)).toEqual([]);
    expect(listActiveEpisodes(harness.database)).toEqual([]);
  });

  it('does not consume the 3/day cap with repeated ordinary screening', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, notDipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    await harness.cycle();
    harness.setNow('2026-08-19T12:02:00.000Z');
    await harness.cycle();
    expect(listEpisodesByMint(harness.database, FIXTURE_MINT)).toEqual([]);
    expect(listScreeningObservations(harness.database).every((row) => row.disposition === 'NOT_DIP')).toBe(true);
  });

  it('can admit a later real dip after prior NOT_DIP', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, notDipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    const episodes = listEpisodesByMint(harness.database, FIXTURE_MINT);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.state).toBe('RECOVERY_WATCH');
    expect(episodes[0]?.pairAddress).toBe(FIXTURE_PAIR);
  });

  it('can re-observe an incomplete screening later', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, incompleteSnapshot());
    await harness.cycle();
    expect(listEpisodesByMint(harness.database, FIXTURE_MINT)).toEqual([]);
    harness.setNow(T1);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    expect(listEpisodesByMint(harness.database, FIXTURE_MINT)).toHaveLength(1);
    expect(listScreeningObservations(harness.database).map((row) => row.disposition)).toEqual([
      'INCOMPLETE',
      'DIP_PASS',
    ]);
  });

  it('treats exact duplicate screening evidence as idempotent', () => {
    const database = openInitializedRecoveryDatabase();
    const observation = createScreeningObservation({
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
    });
    const first = persistScreeningObservation(database, observation, { now: new Date(T0) });
    const again = persistScreeningObservation(database, observation, { now: new Date(T0) });
    expect(first.idempotent).toBe(false);
    expect(again.idempotent).toBe(true);
    expect(listScreeningObservations(database)).toHaveLength(1);
  });

  it('fails closed on conflicting duplicate screening identity', () => {
    const database = openInitializedRecoveryDatabase();
    const observation = createScreeningObservation({
      mint: FIXTURE_MINT,
      screenedAt: T0,
      discoverySources: 'dexscreener_profile',
      disposition: 'NOT_DIP',
      reason: 'not a dip',
      priceUsd: 1,
      liquidityUsd: 8_000,
      volume5mUsd: 5_000,
      priceChange5mPct: -10,
    });
    persistScreeningObservation(database, observation, { now: new Date(T0) });
    expect(() =>
      persistScreeningObservation(database, { ...observation, priceUsd: 9 }, { now: new Date(T0) }),
    ).toThrow(/Conflicting screening observation/);
  });

  it('does not re-admit a mint that already has an active episode', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    const metrics = await harness.cycle();
    expect(metrics.screeningByDisposition.ALREADY_ACTIVE).toBe(1);
    expect(listEpisodesByMint(harness.database, FIXTURE_MINT)).toHaveLength(1);
  });

  it('enforces the high-resolution watch slot cap without creating extra episodes', async () => {
    const harness = createHarness();
    const mints = Array.from({ length: 11 }, (_, index) => mintAt(index + 1));
    harness.setProfile(mints);
    for (const [index, mint] of mints.entries()) {
      harness.setScreening(mint, dipSnapshot(mint, pairAt(index + 1)));
    }
    const metrics = await harness.cycle();
    expect(countHighResolutionWatchSlots(harness.database)).toBe(10);
    expect(listActiveEpisodes(harness.database)).toHaveLength(10);
    expect(metrics.screeningByDisposition.DIP_PASS).toBe(10);
    expect(metrics.screeningByDisposition.WATCH_CAP_FULL).toBe(1);
    expect(metrics.dipFilterPassCount).toBe(11);
    expect(listScreeningObservations(harness.database).some((row) => row.disposition === 'WATCH_CAP_FULL' && row.dipFilterResult === 'PASS')).toBe(true);
  });

  it('pins the admitted pair and never switches it', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    harness.setScreening(FIXTURE_MINT, dipSnapshot(FIXTURE_MINT, pairAt(9)));
    harness.setExact(FIXTURE_MINT, FIXTURE_PAIR, confirmSnapshot());
    await harness.cycle();
    const episode = listEpisodesByMint(harness.database, FIXTURE_MINT)[0];
    expect(episode?.pairAddress).toBe(FIXTURE_PAIR);
    expect(listMarketObservations(harness.database, episode?.episodeId ?? '').every((row) => row.pairAddress === FIXTURE_PAIR)).toBe(
      true,
    );
  });

  it('does not fall back when the exact pinned pair is missing', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    harness.setExact(FIXTURE_MINT, FIXTURE_PAIR, new MarketDataError('Opening pair is unavailable.'));
    const metrics = await harness.cycle();
    const episode = listEpisodesByMint(harness.database, FIXTURE_MINT)[0];
    expect(episode?.state).toBe('RECOVERY_WATCH');
    expect(listMarketObservations(harness.database, episode?.episodeId ?? '')).toHaveLength(1);
    expect(metrics.providerFailures).toBeGreaterThan(0);
  });

  it('persists the observation before confirming and derives confirmation from that row', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    const episode = listEpisodesByMint(harness.database, FIXTURE_MINT)[0];
    expect(episode).toBeDefined();
    persistMarketObservation(
      harness.database,
      snapshotToMarketObservation(
        { ...confirmSnapshot(), collectedAt: T1 },
        episode?.episodeId ?? '',
        RW0_WATCH_MARKET_SOURCE,
      ),
      { now: new Date(T1) },
    );
    harness.setNow(T1);
    harness.setExact(FIXTURE_MINT, FIXTURE_PAIR, new MarketDataError('provider down after persist'));
    const metrics = await harness.cycle();
    const updated = loadEpisode(harness.database, episode?.episodeId ?? '');
    expect(updated?.state).toBe('REJECTED_SAFETY_UNKNOWN');
    expect(updated?.recoveryConfirmedAt).toBe(T1);
    expect(updated?.recoveryConfirmationPriceUsd).toBe(1.2);
    expect(metrics.confirmations).toBe(1);
    const transitions = listTransitions(harness.database, episode?.episodeId ?? '');
    expect(transitions.map((item) => item.toState)).toContain('SIGNAL_PENDING_SAFETY');
    expect(transitions.map((item) => item.toState)).toContain('REJECTED_SAFETY_UNKNOWN');
  });

  it('confirms 1ms before TTL and expires at the exact TTL without confirming', async () => {
    const before = createHarness();
    before.setProfile([FIXTURE_MINT]);
    before.setScreening(FIXTURE_MINT, dipSnapshot());
    await before.cycle();
    before.setNow(TTL_MINUS_1MS);
    before.setExact(FIXTURE_MINT, FIXTURE_PAIR, confirmSnapshot());
    await before.cycle();
    expect(listEpisodesByMint(before.database, FIXTURE_MINT)[0]?.state).toBe('REJECTED_SAFETY_UNKNOWN');
    expect(listEpisodesByMint(before.database, FIXTURE_MINT)[0]?.recoveryConfirmedAt).toBe(TTL_MINUS_1MS);

    const expired = createHarness();
    expired.setProfile([FIXTURE_MINT]);
    expired.setScreening(FIXTURE_MINT, dipSnapshot());
    await expired.cycle();
    expired.setNow(TTL);
    expired.setExact(FIXTURE_MINT, FIXTURE_PAIR, confirmSnapshot());
    await expired.cycle();
    const episode = listEpisodesByMint(expired.database, FIXTURE_MINT)[0];
    expect(episode?.state).toBe('EXPIRED');
    expect(episode?.recoveryConfirmedAt).toBeNull();
  });

  it('leaves the watch open on provider failure before TTL and does not invent a price', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    harness.setExact(FIXTURE_MINT, FIXTURE_PAIR, new MarketDataError('DEX Screener rate-limited the request. Wait and try again.'));
    await harness.cycle();
    const episode = listEpisodesByMint(harness.database, FIXTURE_MINT)[0];
    expect(episode?.state).toBe('RECOVERY_WATCH');
    const observations = listMarketObservations(harness.database, episode?.episodeId ?? '');
    expect(observations).toHaveLength(1);
    expect(observations[0]?.priceUsd).toBe(1);
    expect(observations[0]?.collectedAt).toBe(T0);
  });

  it('expires an overdue watch on restart and resumes a pinned-pair watch that is still live', async () => {
    const overdue = createHarness();
    overdue.setProfile([FIXTURE_MINT]);
    overdue.setScreening(FIXTURE_MINT, dipSnapshot());
    await overdue.cycle();
    overdue.setNow(TTL);
    overdue.setExact(FIXTURE_MINT, FIXTURE_PAIR, new MarketDataError('provider down'));
    await overdue.cycle();
    expect(listEpisodesByMint(overdue.database, FIXTURE_MINT)[0]?.state).toBe('EXPIRED');

    const live = createHarness();
    live.setProfile([FIXTURE_MINT]);
    live.setScreening(FIXTURE_MINT, dipSnapshot());
    await live.cycle();
    live.setNow(T1);
    live.setExact(FIXTURE_MINT, FIXTURE_PAIR, confirmSnapshot());
    await live.cycle();
    expect(listMarketObservations(live.database, listEpisodesByMint(live.database, FIXTURE_MINT)[0]?.episodeId ?? '').every((row) => row.pairAddress === FIXTURE_PAIR)).toBe(
      true,
    );
  });

  it('re-evaluates a crash-persisted confirmation observation without substituting newer data', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    const episode = listEpisodesByMint(harness.database, FIXTURE_MINT)[0];
    persistMarketObservation(
      harness.database,
      snapshotToMarketObservation(
        { ...confirmSnapshot(), collectedAt: T1, priceUsd: 1.2 },
        episode?.episodeId ?? '',
        RW0_WATCH_MARKET_SOURCE,
      ),
      { now: new Date(T1) },
    );
    harness.setNow('2026-08-19T12:02:00.000Z');
    harness.setExact(FIXTURE_MINT, FIXTURE_PAIR, { ...confirmSnapshot(), priceUsd: 9.99 });
    await harness.cycle();
    const updated = loadEpisode(harness.database, episode?.episodeId ?? '');
    expect(updated?.recoveryConfirmedAt).toBe(T1);
    expect(updated?.recoveryConfirmationPriceUsd).toBe(1.2);
    expect(updated?.recoveryConfirmationPriceUsd).not.toBe(9.99);
  });

  it('drains leftover SIGNAL_PENDING_SAFETY to REJECTED_SAFETY_UNKNOWN and frees the watch slot', () => {
    const database = openInitializedRecoveryDatabase();
    const created = persistCreatedEpisode(database, discoveredEpisodeInput({ ...passingDipFields() }), {
      now: FIXTURE_NOW,
    });
    persistTransition(database, created.episodeId, { to: 'DIP_CANDIDATE', at: '2026-08-19T11:00:01.000Z', reason: 'filters_pass' }, { now: FIXTURE_NOW });
    persistTransition(
      database,
      created.episodeId,
      { to: 'RECOVERY_WATCH', at: '2026-08-19T11:00:02.000Z', reason: 'admitted' },
      { now: FIXTURE_NOW },
    );
    persistMarketObservation(
      database,
      snapshotToMarketObservation(
        { ...confirmSnapshot(), collectedAt: '2026-08-19T11:05:00.000Z' },
        created.episodeId,
        RW0_WATCH_MARKET_SOURCE,
      ),
      { now: FIXTURE_NOW },
    );
    persistTransition(
      database,
      created.episodeId,
      {
        to: 'SIGNAL_PENDING_SAFETY',
        at: '2026-08-19T11:05:00.000Z',
        reason: 'recovery_confirmed',
        recoveryConfirmedAt: '2026-08-19T11:05:00.000Z',
        observationPairAddress: FIXTURE_PAIR,
        ...passingConfirmationFields(),
      },
      { now: FIXTURE_NOW },
    );
    expect(countHighResolutionWatchSlots(database)).toBe(1);
    return runRecoveryCycle({
      database,
      config: testConfig(),
      clock: { now: () => FIXTURE_NOW },
      profileFeed: { source: 'dexscreener_profile', fetchRecords: () => Promise.resolve([]) },
      boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
      screeningMarket: { getSnapshot: () => Promise.resolve(dipSnapshot()) },
      exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
    }).then((metrics) => {
      expect(loadEpisode(database, created.episodeId)?.state).toBe('REJECTED_SAFETY_UNKNOWN');
      expect(countHighResolutionWatchSlots(database)).toBe(0);
      expect(metrics.rejectedSafetyUnknown).toBe(1);
      const unavailable = listSafetyEvidence(database, created.episodeId, { now: FIXTURE_NOW });
      const holderEvidence = unavailable.find((row) => row.kind === 'holder');
      const bundleEvidence = unavailable.find((row) => row.kind === 'bundle');
      expect(holderEvidence?.payload).toMatchObject({
        kind: 'holder',
        totalSupplyRaw: null,
        denominatorRaw: null,
      });
      expect(bundleEvidence?.payload).toMatchObject({
        kind: 'bundle',
        denominatorRaw: null,
      });
      expect(countShadowPositions(database)).toBe(0);
      expect(listEpisodesInState(database, 'SHADOW_RESEARCH_OPEN')).toEqual([]);
      expect(listEpisodesInState(database, 'PAPER_ELIGIBLE')).toEqual([]);
      expect(listEpisodesInState(database, 'PAPER_OPEN')).toEqual([]);
      expect(listEpisodesInState(database, 'CLOSED')).toEqual([]);
    });
  });

  it('never opens shadow/paper/closed from a Slice 2 confirmation', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    harness.setNow(T1);
    harness.setExact(FIXTURE_MINT, FIXTURE_PAIR, confirmSnapshot());
    await harness.cycle();
    expect(listEpisodesByMint(harness.database, FIXTURE_MINT)[0]?.state).toBe('REJECTED_SAFETY_UNKNOWN');
    expect(countShadowPositions(harness.database)).toBe(0);
    expect(listEpisodesInState(harness.database, 'SHADOW_RESEARCH_OPEN')).toEqual([]);
    expect(listEpisodesInState(harness.database, 'PAPER_ELIGIBLE')).toEqual([]);
    expect(listEpisodesInState(harness.database, 'PAPER_OPEN')).toEqual([]);
    expect(listEpisodesInState(harness.database, 'CLOSED')).toEqual([]);
    expect(countHighResolutionWatchSlots(harness.database)).toBe(0);
  });

  it('does not import live/wallet/execution/production and has no Math.random jitter', () => {
    const root = join(process.cwd(), 'src/recovery-watcher');
    const files = readdirSync(root, { recursive: true }).filter(
      (name): name is string => typeof name === 'string' && name.endsWith('.ts'),
    );
    const text = files.map((name) => readFileSync(join(root, name), 'utf8')).join('\n');
    expect(text).not.toMatch(/from ['"][^'"]*\/(?:live|wallet|production|execution)(?:\/|['"])/);
    expect(text).not.toMatch(/Math\.random\s*\(/);
    expect(text).not.toMatch(/sendTransaction/);
  });

  it('fails live flags before any network call', async () => {
    let fetched = false;
    expect(() => prepareRecoveryRunCommand({ TRADING_ENABLED: 'true', LIVE_BROADCAST_ENABLED: 'false' })).toThrow(
      RecoveryWatcherError,
    );
    await expect(
      runRecoveryWatcher({
        config: testConfig({ tradingEnabled: true, databasePath: tempRecoveryDatabasePath() }),
        once: true,
        fetchImpl: () => {
          fetched = true;
          return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('[]') });
        },
      }),
    ).rejects.toThrow(/TRADING_ENABLED=true/);
    expect(fetched).toBe(false);
  });

  it('still fails isolated DB collision and does not write the production database', async () => {
    expect(() =>
      prepareRecoveryRunCommand({
        RW0_DATABASE_PATH: DEFAULT_DATABASE_PATH,
        TRADING_ENABLED: 'false',
        LIVE_BROADCAST_ENABLED: 'false',
      }),
    ).toThrow(/must not be the production SQLite file/);
    const productionPath = join(tempRecoveryDirectory(), 'soltradingbot.sqlite');
    const recoveryPath = join(tempRecoveryDirectory(), 'recovery-watcher.sqlite');
    const before = existsSync(productionPath) ? statSync(productionPath).mtimeMs : 0;
    const harness = createHarness({ databasePath: recoveryPath, configuredProductionDatabasePath: productionPath });
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, notDipSnapshot());
    await harness.cycle();
    expect(existsSync(productionPath)).toBe(false);
    expect(before).toBe(0);
  });

  it('bounds candidate enrichment and discovery calls and exposes cap skips', async () => {
    const harness = createHarness({ screeningMaxCandidates: 1 });
    const mints = [mintAt(1), mintAt(2), mintAt(3)];
    harness.setProfile(mints);
    for (const mint of mints) {
      harness.setScreening(mint, notDipSnapshot(mint, pairAt(1)));
    }
    const metrics = await harness.cycle();
    expect(metrics.discoveryCalls).toBe(2);
    expect(metrics.candidatesSelected).toBe(1);
    expect(metrics.candidatesSkippedCap).toBe(2);
    expect(metrics.candidatesEnriched).toBe(1);
    expect(harness.screeningFetches).toBe(1);
    expect(metrics.screeningByDisposition.SKIPPED_CAP).toBe(2);
  });

  it('labels collectedAt as local collection time and requires non-empty provenance', async () => {
    const harness = createHarness();
    harness.setProfile([FIXTURE_MINT]);
    harness.setScreening(FIXTURE_MINT, dipSnapshot());
    await harness.cycle();
    const episode = listEpisodesByMint(harness.database, FIXTURE_MINT)[0];
    const observations = listMarketObservations(harness.database, episode?.episodeId ?? '');
    expect(observations[0]?.collectedAt).toBe(T0);
    expect(observations[0]?.provider).toBe('dexscreener');
    expect(observations[0]?.source.length).toBeGreaterThan(0);
    const screening = listScreeningObservations(harness.database)[0];
    expect(screening?.collectedAtIsLocalCollectionTime).toBe(true);
    expect(screening?.provider).toBe('dexscreener');
    const report = formatRecoveryReportLines(testConfig());
    expect(report.join('\n')).toContain('local collection time');
    expect(report.join('\n')).not.toMatch(/\bwin rate\b/i);
    expect(report.join('\n')).not.toMatch(/\bexpected profit\b/i);
  });

  it('rejects overlapping cycles and uses due-target sleep with no catch-up', async () => {
    const mutex = createRecoveryCycleMutex();
    let release: () => void = () => undefined;
    let markEntered: () => void = () => undefined;
    const enteredScreening = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const hanging = new Promise<MarketSnapshot>((resolve) => {
      release = () => {
        resolve(dipSnapshot());
      };
    });
    const database = openInitializedRecoveryDatabase();
    const hangingCycle = mutex.run(() =>
      runRecoveryCycle({
        database,
        config: testConfig(),
        clock: { now: () => new Date(T0) },
        profileFeed: {
          source: 'dexscreener_profile',
          fetchRecords: () => Promise.resolve([sourceRecord(FIXTURE_MINT, 'dexscreener_profile')]),
        },
        boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
        screeningMarket: {
          getSnapshot: () => {
            markEntered();
            return hanging;
          },
        },
        exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
      }),
    );
    await enteredScreening;
    await expect(
      mutex.run(() =>
        runRecoveryCycle({
          database,
          config: testConfig(),
          clock: { now: () => new Date(T0) },
          profileFeed: { source: 'dexscreener_profile', fetchRecords: () => Promise.resolve([]) },
          boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
          screeningMarket: { getSnapshot: () => Promise.resolve(dipSnapshot()) },
          exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
        }),
      ),
    ).rejects.toMatchObject({ code: 'overlapping_cycle' });
    release();
    await hangingCycle;

    const sleeps: number[] = [];
    const abort = new AbortController();
    const path = tempRecoveryDatabasePath();
    const fileDb = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(fileDb);
    fileDb.close();
    let mono = 0;
    await runRecoveryWatcher({
      config: testConfig({ databasePath: path }),
      once: false,
      abort: abort.signal,
      clock: { now: () => new Date(T0) },
      liveness: { isAlive: () => false },
      pid: 424242,
      processStartedAtMs: 1,
      monotonicNow: () => mono,
      providers: {
        profileFeed: { source: 'dexscreener_profile', fetchRecords: () => Promise.resolve([]) },
        boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
        screeningMarket: { getSnapshot: () => Promise.resolve(dipSnapshot()) },
        exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
      },
      sleep: (ms) => {
        sleeps.push(ms);
        mono += ms;
        if (sleeps.length >= 2) {
          abort.abort();
        }
        return Promise.resolve();
      },
    });
    expect(sleeps).toEqual([60_000, 60_000]);
  });

  it('stops after the current cycle on graceful abort and keeps schema digest frozen to version 1', async () => {
    const abort = new AbortController();
    let cycles = 0;
    const path = tempRecoveryDatabasePath();
    const fileDb = openRecoverySqlite(path, { configuredProductionPath: DEFAULT_DATABASE_PATH });
    initializeRecoveryDatabase(fileDb);
    fileDb.close();
    await runRecoveryWatcher({
      config: testConfig({ databasePath: path }),
      abort: abort.signal,
      clock: { now: () => new Date(T0) },
      liveness: { isAlive: () => false },
      pid: 434343,
      processStartedAtMs: 2,
      providers: {
        profileFeed: { source: 'dexscreener_profile', fetchRecords: () => Promise.resolve([]) },
        boostFeed: { source: 'dexscreener_boost', fetchRecords: () => Promise.resolve([]) },
        screeningMarket: { getSnapshot: () => Promise.resolve(dipSnapshot()) },
        exactPairMarket: { getSnapshotForPair: () => Promise.resolve(confirmSnapshot()) },
      },
      onCycle: () => {
        cycles += 1;
        abort.abort();
      },
      sleep: () => Promise.reject(new Error('sleep should not run after abort')),
    });
    expect(cycles).toBe(1);
    expect(recoveryMigrationSqlDigest(1)).toMatch(/^[a-f0-9]{64}$/);
    expect(RECOVERY_V0_SIGNAL_FINGERPRINT).toBe('4e91a7d77a4e1699c5263b99dc468d3b579816525a6232e17eb966d5d0f6c06b');
    expect(RW0_WATCHER_DEFINITION_FINGERPRINT).toMatch(/^[a-f0-9]{64}$/);
  });
});
