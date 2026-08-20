import type { DatabaseSync } from 'node:sqlite';
import { interleaveMints, mergeSourceRecords, uniqueMintsInOrder } from '../discovery/dedupe.js';
import type { DiscoveryFeedProvider } from '../discovery/provider.js';
import type { SourceRecord } from '../discovery/types.js';
import type { ExactPairMarketDataProvider, MarketDataProvider } from '../market-data/provider.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { mapBoundedChunks } from './concurrency.js';
import {
  RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE,
  RW0_MAX_CONCURRENT_WATCHES,
  RW0_SCREENING_FETCH_CONCURRENCY,
  RW0_SCREENING_MARKET_SOURCE,
  RW0_SAFETY_SPEC_VERSION,
  RW0_WATCH_FETCH_CONCURRENCY,
  RW0_WATCH_MARKET_SOURCE,
  RW0_WATCH_TTL_MS,
} from './constants.js';
import { parseUtcInstant, watchExpiresAtMs } from './clock.js';
import { RecoveryWatcherError } from './errors.js';
import {
  countHighResolutionWatchSlots,
  emptyScreeningDispositionCounts,
  listActiveEpisodes,
  listEpisodesByMint,
  listEpisodesInState,
  listMarketObservations,
  persistAdmittedDipWatch,
  persistMarketObservation,
  persistScreeningObservation,
  persistSafetyDecision,
  persistSafetyEvidence,
  persistTransition,
  loadEpisode,
} from './persistence.js';
import {
  fetchDiscoveryRecords,
  fetchExactPairSnapshot,
  fetchScreeningSnapshot,
} from './providers.js';
import {
  classifyDipSnapshot,
  createScreeningObservation,
  screeningFromSnapshot,
  snapshotToMarketObservation,
} from './screening.js';
import { evaluateRecoveryConfirmation, evaluateRecoveryV0DipFilters } from './signal.js';
import { assertCanCreateEpisode, isActiveRecoveryEpisode } from './state.js';
import type {
  MarketObservationRecord,
  RecoveryClock,
  RecoveryCycleMetrics,
  RecoveryEpisode,
  RecoveryWatcherConfig,
  ScreeningDisposition,
  ScreeningObservationRecord,
} from './types.js';
import { canonicalizeSafetyEvidence, RW0_SAFETY_SPEC_FINGERPRINT } from './safety.js';

export type RecoveryCycleDependencies = {
  database: DatabaseSync;
  config: RecoveryWatcherConfig;
  clock: RecoveryClock;
  profileFeed: DiscoveryFeedProvider;
  boostFeed: DiscoveryFeedProvider;
  screeningMarket: MarketDataProvider;
  exactPairMarket: ExactPairMarketDataProvider;
  monotonicNow?: () => number;
  screeningWallBudgetMs?: number;
};

export async function runRecoveryCycle(
  deps: RecoveryCycleDependencies,
): Promise<RecoveryCycleMetrics> {
  const metrics = emptyCycleMetrics(deps.clock.now().toISOString());
  await runRecoveryWatchPass(deps, metrics);
  await runRecoveryScreeningPass(deps, metrics);
  return metrics;
}

export async function runRecoveryWatchPass(
  deps: RecoveryCycleDependencies,
  metrics: RecoveryCycleMetrics,
): Promise<void> {
  const now = deps.clock.now();
  drainPendingSafety(deps.database, now, metrics);
  reevaluatePersistedWatchObservations(deps.database, now, metrics);
  expireOverdueWatches(deps.database, now, metrics);
  resumeLeftoverAdmissions(deps.database, now);
  await pollActiveWatches(deps, metrics);
}

export async function runRecoveryScreeningPass(
  deps: RecoveryCycleDependencies,
  metrics: RecoveryCycleMetrics,
  options?: { wallBudgetMs?: number },
): Promise<void> {
  const monotonicNow = deps.monotonicNow ?? defaultMonotonicNow;
  const wallBudgetMs = options?.wallBudgetMs ?? deps.screeningWallBudgetMs;
  const deadline =
    wallBudgetMs === undefined ? Number.POSITIVE_INFINITY : monotonicNow() + wallBudgetMs;
  const remaining = (): number => deadline - monotonicNow();
  if (remaining() <= 0) {
    metrics.screeningBudgetExhausted = true;
    return;
  }
  await screenDiscoveredMints(deps, metrics, remaining);
}

export function emptyCycleMetrics(at: string): RecoveryCycleMetrics {
  return {
    at,
    discoveryCalls: 0,
    discoveryFailures: 0,
    candidatesDiscovered: 0,
    candidatesDeduped: 0,
    candidatesSelected: 0,
    candidatesSkippedCap: 0,
    candidatesEnriched: 0,
    candidatesEnrichmentFailed: 0,
    activeWatchesAtStart: 0,
    marketFetchSuccesses: 0,
    marketFetchFailures: 0,
    confirmations: 0,
    expiries: 0,
    rejectedSafetyUnknown: 0,
    providerFailures: 0,
    screeningByDisposition: emptyScreeningDispositionCounts(),
    dipFilterPassCount: 0,
    candidatesSkippedBudget: 0,
    screeningBudgetExhausted: false,
  };
}

function defaultMonotonicNow(): number {
  return performance.now();
}

function drainPendingSafety(
  database: DatabaseSync,
  now: Date,
  metrics: RecoveryCycleMetrics,
): void {
  for (const episode of listEpisodesInState(database, 'SIGNAL_PENDING_SAFETY')) {
    persistUnavailableSafetyEvidence(database, episode, now);
    persistSafetyDecision(database, episode.episodeId, now.toISOString(), { now });
    metrics.rejectedSafetyUnknown += 1;
  }
}

function reevaluatePersistedWatchObservations(
  database: DatabaseSync,
  now: Date,
  metrics: RecoveryCycleMetrics,
): void {
  for (const episode of listEpisodesInState(database, 'RECOVERY_WATCH')) {
    confirmFromPersistedObservations(database, episode, now, metrics);
  }
}

function expireOverdueWatches(
  database: DatabaseSync,
  now: Date,
  metrics: RecoveryCycleMetrics,
): void {
  for (const episode of listEpisodesInState(database, 'RECOVERY_WATCH')) {
    if (episode.watchStartedAt === null) {
      continue;
    }
    if (now.getTime() < watchExpiresAtMs(episode.watchStartedAt, RW0_WATCH_TTL_MS)) {
      continue;
    }
    persistTransition(
      database,
      episode.episodeId,
      { to: 'EXPIRED', at: now.toISOString(), reason: 'slice2_watch_ttl' },
      { now },
    );
    metrics.expiries += 1;
  }
}

function resumeLeftoverAdmissions(database: DatabaseSync, now: Date): void {
  const leftovers = [
    ...listEpisodesInState(database, 'DISCOVERED'),
    ...listEpisodesInState(database, 'DIP_CANDIDATE'),
  ];
  for (const episode of leftovers) {
    const filters = evaluateRecoveryV0DipFilters({
      observedPriceUsd: episode.dipPriceUsd,
      priceChange5mPct: episode.dipPriceChange5mPct,
      volume5mUsd: episode.dipVolume5mUsd,
      liquidityUsd: episode.dipLiquidityUsd,
      volumeToLiquidity5m: episode.dipVolumeToLiquidity5m,
    });
    if (filters.kind !== 'pass') {
      persistTransition(
        database,
        episode.episodeId,
        {
          to: filters.kind === 'reject_filter' ? 'REJECTED_FILTER' : 'REJECTED_INCOMPLETE',
          at: now.toISOString(),
          reason: `slice2_resume_${filters.kind}`,
        },
        { now },
      );
      continue;
    }
    let current = episode;
    if (current.state === 'DISCOVERED') {
      persistTransition(
        database,
        current.episodeId,
        { to: 'DIP_CANDIDATE', at: now.toISOString(), reason: 'slice2_resume_discovered' },
        { now },
      );
      current = { ...current, state: 'DIP_CANDIDATE', updatedAt: now.toISOString() };
    }
    if (countHighResolutionWatchSlots(database) >= RW0_MAX_CONCURRENT_WATCHES) {
      persistTransition(
        database,
        current.episodeId,
        { to: 'REJECTED_CAP', at: now.toISOString(), reason: 'slice2_resume_watch_cap' },
        { now },
      );
      continue;
    }
    persistTransition(
      database,
      current.episodeId,
      { to: 'RECOVERY_WATCH', at: now.toISOString(), reason: 'slice2_resume_dip_candidate' },
      { now },
    );
  }
}

async function pollActiveWatches(
  deps: RecoveryCycleDependencies,
  metrics: RecoveryCycleMetrics,
): Promise<void> {
  const watches = listEpisodesInState(deps.database, 'RECOVERY_WATCH')
    .filter((episode) => episode.watchStartedAt !== null)
    .sort((left, right) => left.episodeId.localeCompare(right.episodeId));
  metrics.activeWatchesAtStart = watches.length;
  const fetched = await mapBoundedChunks(watches, RW0_WATCH_FETCH_CONCURRENCY, async (episode) => ({
    episode,
    result: await fetchExactPairSnapshot(deps.exactPairMarket, episode.mint, episode.pairAddress),
  }));
  for (const item of fetched.completed) {
    persistWatchFetchResult(deps, item.episode, item.result, metrics);
  }
}

function persistWatchFetchResult(
  deps: RecoveryCycleDependencies,
  episode: RecoveryEpisode,
  fetchResult: Awaited<ReturnType<typeof fetchExactPairSnapshot>>,
  metrics: RecoveryCycleMetrics,
): void {
  if (episode.watchStartedAt === null) {
    return;
  }
  const persistAt = deps.clock.now();
  if (!fetchResult.ok) {
    metrics.marketFetchFailures += 1;
    metrics.providerFailures += 1;
    if (persistAt.getTime() >= watchExpiresAtMs(episode.watchStartedAt, RW0_WATCH_TTL_MS)) {
      persistTransition(
        deps.database,
        episode.episodeId,
        {
          to: 'EXPIRED',
          at: persistAt.toISOString(),
          reason: 'slice2_watch_ttl_provider_unavailable',
        },
        { now: persistAt },
      );
      metrics.expiries += 1;
    }
    return;
  }
  metrics.marketFetchSuccesses += 1;
  persistMarketObservation(
    deps.database,
    snapshotToMarketObservation(fetchResult.snapshot, episode.episodeId, RW0_WATCH_MARKET_SOURCE),
    { now: persistAt },
  );
  const stored = requireStoredObservation(
    deps.database,
    episode.episodeId,
    fetchResult.snapshot.collectedAt,
  );
  if (
    parseUtcInstant(stored.collectedAt, 'collected_at') >=
    watchExpiresAtMs(episode.watchStartedAt, RW0_WATCH_TTL_MS)
  ) {
    persistTransition(
      deps.database,
      episode.episodeId,
      { to: 'EXPIRED', at: stored.collectedAt, reason: 'slice2_watch_ttl' },
      { now: persistAt },
    );
    metrics.expiries += 1;
    return;
  }
  confirmFromStoredObservation(deps.database, episode, stored, persistAt, metrics);
}

function confirmFromPersistedObservations(
  database: DatabaseSync,
  episode: RecoveryEpisode,
  now: Date,
  metrics: RecoveryCycleMetrics,
): boolean {
  if (episode.watchStartedAt === null) {
    return false;
  }
  const observations = listMarketObservations(database, episode.episodeId);
  for (const observation of observations) {
    if (isSamePinnedDipObservation(episode, observation)) {
      continue;
    }
    if (confirmFromStoredObservation(database, episode, observation, now, metrics)) {
      return true;
    }
  }
  return false;
}

function confirmFromStoredObservation(
  database: DatabaseSync,
  episode: RecoveryEpisode,
  observation: MarketObservationRecord,
  now: Date,
  metrics: RecoveryCycleMetrics,
): boolean {
  if (episode.watchStartedAt === null) {
    return false;
  }
  const confirmation = evaluateRecoveryConfirmation({
    dipPairAddress: episode.pairAddress,
    dipPriceUsd: episode.dipPriceUsd,
    dipObservedAt: episode.dipObservedAt,
    watchStartedAt: episode.watchStartedAt,
    observationPairAddress: observation.pairAddress,
    observationPriceUsd: observation.priceUsd,
    observationCollectedAt: observation.collectedAt,
    observationLiquidityUsd: observation.liquidityUsd,
    observationVolume5mUsd: observation.volume5mUsd,
  });
  if (confirmation.kind !== 'confirmed') {
    return false;
  }
  persistTransition(
    database,
    episode.episodeId,
    {
      to: 'SIGNAL_PENDING_SAFETY',
      at: observation.collectedAt,
      reason: 'slice2_recovery_confirmed_persisted_observation',
      recoveryConfirmedAt: observation.collectedAt,
      observationPairAddress: observation.pairAddress,
    },
    { now },
  );
  const pending = loadEpisode(database, episode.episodeId);
  if (pending === null) {
    throw new RecoveryWatcherError(
      'Confirmed recovery episode disappeared before safety evidence.',
      {
        code: 'persistence_failed',
      },
    );
  }
  persistUnavailableSafetyEvidence(database, pending, now);
  persistSafetyDecision(database, episode.episodeId, now.toISOString(), { now });
  metrics.confirmations += 1;
  metrics.rejectedSafetyUnknown += 1;
  return true;
}

function persistUnavailableSafetyEvidence(
  database: DatabaseSync,
  episode: RecoveryEpisode,
  now: Date,
): void {
  if (episode.recoveryConfirmedAt === null) {
    throw new RecoveryWatcherError('Unavailable safety evidence requires recovery confirmation.', {
      code: 'evidence_invalid',
    });
  }
  const base = {
    episodeId: episode.episodeId,
    mint: episode.mint,
    pairAddress: episode.pairAddress,
    confirmationObservedAt: episode.recoveryConfirmedAt,
    confirmationEventId: episode.lastTransitionEventId,
    observedAt: now.toISOString(),
    collectedAt: now.toISOString(),
    provider: null,
    provenance: 'slice3a:no_safety_provider_configured',
    signalVersion: episode.signalVersion,
    signalFingerprint: episode.signalFingerprint,
    watcherSpecVersion: episode.watcherSpecVersion,
    watcherSpecFingerprint: episode.watcherSpecFingerprint,
    safetySpecVersion: RW0_SAFETY_SPEC_VERSION,
    safetySpecFingerprint: RW0_SAFETY_SPEC_FINGERPRINT,
  } as const;
  const payloads = [
    {
      kind: 'token_rights',
      tokenProgram: 'unsupported',
      mintAuthority: null,
      freezeAuthority: null,
      extensions: [],
      factsComplete: false,
    },
    {
      kind: 'holder',
      denominatorKind: 'effective_circulating_supply',
      totalSupplyRaw: null,
      denominatorRaw: null,
      supplyReconciled: false,
      ownerCoverageComplete: false,
      sourceIsTop20Only: false,
      accounts: [],
    },
    {
      kind: 'bundle',
      rule: 'unavailable:no_safety_provider_configured',
      denominatorKind: 'effective_circulating_supply',
      denominatorRaw: null,
      graphComplete: false,
      membershipComplete: false,
      confidence: 'low',
      members: [],
    },
    {
      kind: 'creator',
      creatorIdentity: null,
      identityProvenance: null,
      identityTrustworthy: false,
      controlledAccountsComplete: false,
      retainedControlCapabilities: [],
      controlledBalanceRaw: null,
      denominatorRaw: null,
    },
  ] as const;
  for (const payload of payloads) {
    const evidence = canonicalizeSafetyEvidence({ ...base, kind: payload.kind, payload }, now);
    persistSafetyEvidence(database, evidence, { now });
  }
}

async function screenDiscoveredMints(
  deps: RecoveryCycleDependencies,
  metrics: RecoveryCycleMetrics,
  remaining: () => number,
): Promise<void> {
  const [profile, boost] = await Promise.all([
    fetchDiscoveryRecords(deps.profileFeed),
    fetchDiscoveryRecords(deps.boostFeed),
  ]);
  metrics.discoveryCalls = RW0_DISCOVERY_CALLS_PER_SCREENING_CYCLE;
  if (!profile.ok) {
    metrics.discoveryFailures += 1;
    metrics.providerFailures += 1;
  }
  if (!boost.ok) {
    metrics.discoveryFailures += 1;
    metrics.providerFailures += 1;
  }

  const discoveryObservedAt = deps.clock.now().toISOString();
  const records: SourceRecord[] = [...profile.records, ...boost.records];
  const merged = mergeSourceRecords(records, discoveryObservedAt);
  const orderedMints = interleaveMints(
    [uniqueMintsInOrder(profile.records), uniqueMintsInOrder(boost.records)],
    Number.MAX_SAFE_INTEGER,
  );
  metrics.candidatesDiscovered = records.length;
  metrics.candidatesDeduped = orderedMints.length;

  const activeMints = new Set(
    listActiveEpisodes(deps.database)
      .filter((episode) => isActiveRecoveryEpisode(episode))
      .map((episode) => episode.mint),
  );
  const byMint = new Map(merged.map((candidate) => [candidate.tokenMint, candidate]));
  const enrichmentQueue: string[] = [];
  for (const mint of orderedMints) {
    const candidate = byMint.get(mint);
    const discoverySources = candidate?.sources.join(',') ?? 'dexscreener_profile';
    if (activeMints.has(mint)) {
      recordScreening(
        deps.database,
        deps.clock.now(),
        metrics,
        createScreeningObservation({
          mint,
          screenedAt: discoveryObservedAt,
          discoverySources,
          disposition: 'ALREADY_ACTIVE',
          dipFilterResult: 'NOT_EVALUATED',
          reason: 'mint already has an active recovery episode',
        }),
      );
      continue;
    }
    if (enrichmentQueue.length >= deps.config.screeningMaxCandidates) {
      recordScreening(
        deps.database,
        deps.clock.now(),
        metrics,
        createScreeningObservation({
          mint,
          screenedAt: discoveryObservedAt,
          discoverySources,
          disposition: 'SKIPPED_CAP',
          dipFilterResult: 'NOT_EVALUATED',
          reason: `screening enrichment cap ${String(deps.config.screeningMaxCandidates)}`,
        }),
      );
      metrics.candidatesSkippedCap += 1;
      continue;
    }
    enrichmentQueue.push(mint);
  }
  metrics.candidatesSelected = enrichmentQueue.length;

  const fetched = await mapBoundedChunks(
    enrichmentQueue,
    RW0_SCREENING_FETCH_CONCURRENCY,
    async (mint) => {
      const candidate = byMint.get(mint);
      const discoverySources = candidate?.sources.join(',') ?? 'dexscreener_profile';
      const result = await fetchScreeningSnapshot(deps.screeningMarket, mint);
      return { mint, discoverySources, result };
    },
    { shouldStop: () => remaining() <= 0 },
  );

  for (const item of fetched.completed) {
    const persistAt = deps.clock.now();
    if (!item.result.ok) {
      metrics.marketFetchFailures += 1;
      metrics.candidatesEnrichmentFailed += 1;
      metrics.providerFailures += 1;
      recordScreening(
        deps.database,
        persistAt,
        metrics,
        createScreeningObservation({
          mint: item.mint,
          screenedAt: persistAt.toISOString(),
          discoverySources: item.discoverySources,
          disposition: 'MARKET_UNAVAILABLE',
          dipFilterResult: 'NOT_EVALUATED',
          reason: item.result.error,
        }),
      );
      continue;
    }
    metrics.marketFetchSuccesses += 1;
    metrics.candidatesEnriched += 1;
    admitOrRecordScreening(
      deps.database,
      item.result.snapshot,
      item.discoverySources,
      persistAt,
      metrics,
    );
  }

  for (const mint of fetched.remaining) {
    const candidate = byMint.get(mint);
    const discoverySources = candidate?.sources.join(',') ?? 'dexscreener_profile';
    const persistAt = deps.clock.now();
    recordScreening(
      deps.database,
      persistAt,
      metrics,
      createScreeningObservation({
        mint,
        screenedAt: persistAt.toISOString(),
        discoverySources,
        disposition: 'SKIPPED_CAP',
        dipFilterResult: 'NOT_EVALUATED',
        reason: 'screening wall-time budget exhausted',
      }),
    );
    metrics.candidatesSkippedBudget += 1;
    metrics.screeningBudgetExhausted = true;
  }
}

function admitOrRecordScreening(
  database: DatabaseSync,
  snapshot: MarketSnapshot,
  discoverySources: string,
  now: Date,
  metrics: RecoveryCycleMetrics,
): void {
  const classification = classifyDipSnapshot(snapshot);
  if (classification.dipFilterResult !== 'PASS') {
    recordScreening(
      database,
      now,
      metrics,
      screeningFromSnapshot(snapshot, discoverySources, classification),
    );
    return;
  }

  const admission = classifyAdmissionBarrier(database, snapshot.tokenMint, now);
  if (admission !== null) {
    recordScreening(
      database,
      now,
      metrics,
      screeningFromSnapshot(snapshot, discoverySources, {
        ...admission,
        dipFilterResult: 'PASS',
      }),
    );
    return;
  }

  const observation = snapshotToMarketObservation(snapshot, 'pending', RW0_SCREENING_MARKET_SOURCE);
  try {
    persistAdmittedDipWatch(
      database,
      {
        mint: snapshot.tokenMint,
        observation,
        screening: screeningFromSnapshot(snapshot, discoverySources, classification),
      },
      { now },
    );
  } catch (error: unknown) {
    const barrier = admissionErrorBarrier(error);
    if (barrier !== null) {
      recordScreening(
        database,
        now,
        metrics,
        screeningFromSnapshot(snapshot, discoverySources, {
          ...barrier,
          dipFilterResult: 'PASS',
        }),
      );
      return;
    }
    throw error;
  }
  metrics.screeningByDisposition.DIP_PASS += 1;
  metrics.dipFilterPassCount += 1;
}

function admissionErrorBarrier(
  error: unknown,
): { disposition: ScreeningDisposition; reason: string } | null {
  if (!(error instanceof RecoveryWatcherError)) {
    return null;
  }
  if (error.code === 'active_episode_exists') {
    return { disposition: 'ALREADY_ACTIVE', reason: error.message };
  }
  if (error.code === 'mint_in_cooldown') {
    return { disposition: 'COOLDOWN', reason: error.message };
  }
  if (error.code === 'episode_day_cap') {
    return { disposition: 'EPISODE_LIMIT', reason: error.message };
  }
  if (error.code === 'watch_cap') {
    return { disposition: 'WATCH_CAP_FULL', reason: error.message };
  }
  return null;
}

function classifyAdmissionBarrier(
  database: DatabaseSync,
  mint: string,
  now: Date,
): { disposition: ScreeningDisposition; reason: string } | null {
  const existing = listEpisodesByMint(database, mint);
  try {
    assertCanCreateEpisode({ mint, existing, now });
  } catch (error: unknown) {
    if (error instanceof RecoveryWatcherError && error.code === 'active_episode_exists') {
      return { disposition: 'ALREADY_ACTIVE', reason: error.message };
    }
    if (error instanceof RecoveryWatcherError && error.code === 'mint_in_cooldown') {
      return { disposition: 'COOLDOWN', reason: error.message };
    }
    if (error instanceof RecoveryWatcherError && error.code === 'episode_day_cap') {
      return { disposition: 'EPISODE_LIMIT', reason: error.message };
    }
    throw error;
  }
  if (countHighResolutionWatchSlots(database) >= RW0_MAX_CONCURRENT_WATCHES) {
    return { disposition: 'WATCH_CAP_FULL', reason: 'high-resolution watch slot cap is 10' };
  }
  return null;
}

function recordScreening(
  database: DatabaseSync,
  now: Date,
  metrics: RecoveryCycleMetrics,
  observation: ScreeningObservationRecord,
): void {
  persistScreeningObservation(database, observation, { now });
  metrics.screeningByDisposition[observation.disposition] += 1;
  if (observation.dipFilterResult === 'PASS') {
    metrics.dipFilterPassCount += 1;
  }
}

function requireStoredObservation(
  database: DatabaseSync,
  episodeId: string,
  collectedAt: string,
): MarketObservationRecord {
  const stored = listMarketObservations(database, episodeId).find(
    (observation) =>
      parseUtcInstant(observation.collectedAt, 'collected_at') ===
      parseUtcInstant(collectedAt, 'collected_at'),
  );
  if (stored === undefined) {
    throw new RecoveryWatcherError('Expected the just-persisted market observation to exist.', {
      code: 'persistence_failed',
    });
  }
  return stored;
}

function isSamePinnedDipObservation(
  episode: RecoveryEpisode,
  observation: MarketObservationRecord,
): boolean {
  return (
    observation.pairAddress === episode.pairAddress &&
    parseUtcInstant(observation.collectedAt, 'collected_at') ===
      parseUtcInstant(episode.dipObservedAt, 'dip_observed_at')
  );
}
