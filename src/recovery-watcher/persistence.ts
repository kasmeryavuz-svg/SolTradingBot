import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import {
  RW0_DIP_FILTER_RESULTS,
  RW0_MARKET_PROVIDER,
  RW0_MAX_CONCURRENT_WATCHES,
  RW0_SCREENING_DISPOSITIONS,
  RW0_SCREENING_MARKET_SOURCE,
  RW0_SAFETY_SPEC_VERSION,
  RW0_WATCH_SLOT_STATES,
  SHADOW_CLOSE_REASONS,
} from './constants.js';
import {
  assertNotFuture,
  assertTimestampOrder,
  isSameUtcInstant,
  parseUtcInstant,
} from './clock.js';
import { RecoveryWatcherError } from './errors.js';
import { inspectRecoveryDatasetManifest } from './dataset-manifest.js';
import {
  asRecoveryCostModel,
  asRecoveryExecutionModel,
  assertCurrentScreeningIdentity,
  assertFrozenScreeningIdentity,
  assertPersistedRw0Identity,
  isCurrentRw0WatcherIdentity,
  recoveryEpisodeId,
  recoveryScreeningId,
} from './identity.js';
import {
  assertOptionalFiniteNonNegative,
  assertOptionalPositivePrice,
  computeVolumeToLiquidity5m,
  evaluateRecoveryV0DipFilters,
  isKnownFinite,
  suppliedRatioDisagrees,
} from './signal.js';
import {
  applyTransition,
  assertCanCreateEpisode,
  createEpisode,
  applyPersistedSafetyRejectionInternal,
  isActiveRecoveryEpisode,
  isShadowExitAction,
  isShadowResearch,
} from './state.js';
import type {
  CompletenessGate,
  CreateEpisodeInput,
  MarketObservationRecord,
  PersistObservationResult,
  PersistTransitionExpected,
  RecoveryEpisode,
  RecoveryEpisodeState,
  RecoveryReportSnapshot,
  ResearchTrack,
  SafetyEvidenceRecord,
  SafetyDecisionRecord,
  SafetyGateKind,
  SafetyGateStatus,
  ScreeningDipFilterResult,
  ScreeningDisposition,
  ScreeningObservationRecord,
  ShadowCloseReason,
  ShadowExitObservationRecord,
  ShadowPositionRecord,
  TransitionContext,
  TransitionRequest,
  TransitionResult,
} from './types.js';
import { assertRecoverySchema } from './db/database.js';
import {
  canonicalizeSafetyEvidence,
  emptySafetyEvidenceCounts,
  RW0_SAFETY_GATE_KINDS,
} from './safety.js';
import { fingerprintCanonicalJson, RW0_SAFETY_SPEC_FINGERPRINT } from './identity.js';

const WATCH_SLOT_IN_LIST = RW0_WATCH_SLOT_STATES.map((state) => `'${state}'`).join(', ');

export function persistCreatedEpisode(
  database: DatabaseSync,
  input: CreateEpisodeInput,
  context: { now: Date },
): RecoveryEpisode {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const episode = persistCreatedEpisodeUnlocked(database, input, context);
    database.exec('COMMIT');
    return episode;
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    if (isUniqueConstraint(error)) {
      throw new RecoveryWatcherError('Only one active recovery episode is allowed per mint.', {
        code: 'active_episode_exists',
        cause: error,
      });
    }
    throw new RecoveryWatcherError('Failed to persist recovery episode.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

export function persistTransition(
  database: DatabaseSync,
  episodeId: string,
  request: TransitionRequest,
  context: TransitionContext,
  expected?: PersistTransitionExpected,
): TransitionResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = persistTransitionUnlocked(database, episodeId, request, context, expected);
    database.exec('COMMIT');
    return result;
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    throw new RecoveryWatcherError('Failed to persist recovery transition.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

export function persistMarketObservation(
  database: DatabaseSync,
  observation: MarketObservationRecord,
  context: { now: Date },
): PersistObservationResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = persistMarketObservationUnlocked(database, observation, context.now);
    database.exec('COMMIT');
    return result;
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    throw new RecoveryWatcherError('Failed to persist market observation.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

function persistMarketObservationUnlocked(
  database: DatabaseSync,
  observation: MarketObservationRecord,
  now: Date,
): PersistObservationResult {
  const episode = requireEpisode(database, observation.episodeId);
  const normalized = normalizeMarketObservation(observation);
  assertMarketObservationProvenance(episode, normalized, now);
  const existing = findMarketObservationsByInstant(
    database,
    normalized.episodeId,
    normalized.pairAddress,
    normalized.collectedAt,
  );
  if (existing.length > 0) {
    if (existing.some((row) => !marketObservationMatches(row, normalized))) {
      throw new RecoveryWatcherError(
        'Conflicting market observation for the same episode, pair, and collected_at.',
        { code: 'observation_conflict' },
      );
    }
    return { idempotent: true };
  }
  database
    .prepare(
      `INSERT INTO rw0_market_observations (
        episode_id, mint, pair_address, collected_at, provider, source,
        price_usd, liquidity_usd, volume_5m_usd, price_change_5m_pct,
        signal_version, signal_fingerprint, watcher_spec_version, watcher_spec_fingerprint
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      observation.episodeId,
      observation.mint,
      observation.pairAddress,
      observation.collectedAt,
      normalized.provider,
      normalized.source,
      observation.priceUsd,
      observation.liquidityUsd,
      observation.volume5mUsd,
      observation.priceChange5mPct,
      observation.signalVersion,
      observation.signalFingerprint,
      observation.watcherSpecVersion,
      observation.watcherSpecFingerprint,
    );
  return { idempotent: false };
}

export function persistScreeningObservation(
  database: DatabaseSync,
  observation: ScreeningObservationRecord,
  context: { now: Date },
): PersistObservationResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = persistScreeningObservationUnlocked(database, observation, context.now);
    database.exec('COMMIT');
    return result;
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    throw new RecoveryWatcherError('Failed to persist screening observation.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

function persistScreeningObservationUnlocked(
  database: DatabaseSync,
  observation: ScreeningObservationRecord,
  now: Date,
): PersistObservationResult {
  const normalized = normalizeScreeningObservation(observation, 'current');
  assertNotFuture(normalized.screenedAt, now, 'screening screenedAt');
  const expectedId = recoveryScreeningId({
    mint: normalized.mint,
    screenedAt: normalized.screenedAt,
    signalFingerprint: normalized.signalFingerprint,
    watcherSpecFingerprint: normalized.watcherSpecFingerprint,
  });
  if (normalized.screeningId !== expectedId) {
    throw new RecoveryWatcherError(
      'Screening identity does not match frozen screening identity inputs.',
      {
        code: 'observation_conflict',
      },
    );
  }
  const existing = findScreeningObservation(database, normalized.screeningId);
  if (existing !== null) {
    if (!screeningObservationMatches(existing, normalized)) {
      throw new RecoveryWatcherError(
        'Conflicting screening observation for the same semantic screening identity.',
        { code: 'observation_conflict' },
      );
    }
    return { idempotent: true };
  }
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
      normalized.screeningId,
      normalized.mint,
      normalized.screenedAt,
      normalized.discoverySources,
      normalized.provider,
      normalized.source,
      normalized.pairAddress,
      normalized.priceUsd,
      normalized.liquidityUsd,
      normalized.volume5mUsd,
      normalized.priceChange5mPct,
      normalized.signalVersion,
      normalized.signalFingerprint,
      normalized.watcherSpecVersion,
      normalized.watcherSpecFingerprint,
      normalized.dipFilterResult,
      normalized.disposition,
      normalized.reason,
      1,
    );
  return { idempotent: false };
}

export type PersistAdmittedDipWatchResult = {
  episode: RecoveryEpisode;
  screening: PersistObservationResult;
  observation: PersistObservationResult;
  created: boolean;
};

export function persistAdmittedDipWatch(
  database: DatabaseSync,
  input: {
    mint: string;
    observation: MarketObservationRecord;
    screening: ScreeningObservationRecord;
  },
  context: { now: Date },
): PersistAdmittedDipWatchResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = persistAdmittedDipWatchUnlocked(database, input, context);
    database.exec('COMMIT');
    return result;
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    throw new RecoveryWatcherError('Failed to persist admitted dip watch.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

function persistCreatedEpisodeUnlocked(
  database: DatabaseSync,
  input: CreateEpisodeInput,
  context: { now: Date },
): RecoveryEpisode {
  const existing = listEpisodesByMintUnlocked(database, input.mint);
  assertCanCreateEpisode({ mint: input.mint, existing, now: context.now });
  const episode = createEpisode(input, context);
  insertEpisodeUnlocked(database, episode);
  return episode;
}

function persistTransitionUnlocked(
  database: DatabaseSync,
  episodeId: string,
  request: TransitionRequest,
  context: TransitionContext,
  expected?: PersistTransitionExpected,
): TransitionResult {
  const current = loadEpisodeUnlocked(database, episodeId);
  if (current === null) {
    throw new RecoveryWatcherError('Recovery episode does not exist.', {
      code: 'persistence_failed',
    });
  }
  if (expected !== undefined && !isSameUtcInstant(expected.updatedAt, current.updatedAt)) {
    throw new RecoveryWatcherError(
      'Stale recovery episode object. Refusing to overwrite newer persisted state.',
      {
        code: 'stale_episode',
      },
    );
  }
  if (expected?.state !== undefined && expected.state !== current.state) {
    throw new RecoveryWatcherError(
      'Stale recovery episode object. Refusing to overwrite newer persisted state.',
      {
        code: 'stale_episode',
      },
    );
  }
  const boundRequest =
    request.to === 'SIGNAL_PENDING_SAFETY'
      ? bindConfirmationRequestToPersistedObservation(database, current, request)
      : request;
  const slotCount = countHighResolutionWatchSlotsUnlocked(database);
  const result = applyTransition(current, boundRequest, {
    now: context.now,
    concurrentWatchCount: slotCount,
  });
  if (!result.idempotent) {
    updateEpisodeRow(database, result.episode);
    database
      .prepare(
        `INSERT INTO rw0_state_transitions (episode_id, from_state, to_state, at, reason, event_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        result.episode.episodeId,
        result.fromState,
        result.toState,
        result.at,
        result.reason,
        result.eventId,
      );
    if (result.toState === 'SHADOW_RESEARCH_OPEN') {
      insertShadowPositionIfAbsent(database, result.episode);
    }
  }
  return result;
}

function persistAdmittedDipWatchUnlocked(
  database: DatabaseSync,
  input: {
    mint: string;
    observation: MarketObservationRecord;
    screening: ScreeningObservationRecord;
  },
  context: { now: Date },
): PersistAdmittedDipWatchResult {
  const observation = normalizeMarketObservation(input.observation);
  const screening = normalizeScreeningObservation(input.screening, 'current');
  assertAdmittedDipEvidenceBinding({
    mint: input.mint,
    observation,
    screening,
  });
  const episodeId = recoveryEpisodeId({
    mint: input.mint,
    pairAddress: observation.pairAddress,
    dipObservedAt: observation.collectedAt,
    signalFingerprint: observation.signalFingerprint,
  });
  const existingSame = loadEpisodeUnlocked(database, episodeId);
  if (existingSame !== null) {
    const persistedObservation = persistMarketObservationUnlocked(
      database,
      { ...observation, episodeId },
      context.now,
    );
    const persistedScreening = persistScreeningObservationUnlocked(
      database,
      screening,
      context.now,
    );
    let episode = existingSame;
    if (episode.state === 'DISCOVERED') {
      persistTransitionUnlocked(
        database,
        episode.episodeId,
        { to: 'DIP_CANDIDATE', at: observation.collectedAt, reason: 'slice2_resume_discovered' },
        { now: context.now },
      );
      episode = requireEpisode(database, episode.episodeId);
    }
    if (episode.state === 'DIP_CANDIDATE') {
      persistTransitionUnlocked(
        database,
        episode.episodeId,
        {
          to: 'RECOVERY_WATCH',
          at: observation.collectedAt,
          reason: 'slice2_resume_dip_candidate',
        },
        { now: context.now },
      );
      episode = requireEpisode(database, episode.episodeId);
    }
    return {
      episode,
      screening: persistedScreening,
      observation: persistedObservation,
      created: false,
    };
  }

  assertCanCreateEpisode({
    mint: input.mint,
    existing: listEpisodesByMintUnlocked(database, input.mint),
    now: context.now,
  });
  if (countHighResolutionWatchSlotsUnlocked(database) >= RW0_MAX_CONCURRENT_WATCHES) {
    throw new RecoveryWatcherError('High-resolution watch slot cap is 10.', { code: 'watch_cap' });
  }

  const created = persistCreatedEpisodeUnlocked(
    database,
    {
      mint: input.mint,
      pairAddress: observation.pairAddress,
      dipObservedAt: observation.collectedAt,
      createdAt: observation.collectedAt,
      dipPriceUsd: observation.priceUsd,
      dipLiquidityUsd: observation.liquidityUsd,
      dipVolume5mUsd: observation.volume5mUsd,
      dipPriceChange5mPct: observation.priceChange5mPct,
    },
    context,
  );
  persistTransitionUnlocked(
    database,
    created.episodeId,
    { to: 'DIP_CANDIDATE', at: observation.collectedAt, reason: 'slice2_dip_pass' },
    { now: context.now },
  );
  persistTransitionUnlocked(
    database,
    created.episodeId,
    { to: 'RECOVERY_WATCH', at: observation.collectedAt, reason: 'slice2_start_watch' },
    { now: context.now },
  );
  const persistedObservation = persistMarketObservationUnlocked(
    database,
    { ...observation, episodeId: created.episodeId },
    context.now,
  );
  const persistedScreening = persistScreeningObservationUnlocked(database, screening, context.now);
  return {
    episode: requireEpisode(database, created.episodeId),
    screening: persistedScreening,
    observation: persistedObservation,
    created: true,
  };
}

export function persistSafetyEvidence(
  database: DatabaseSync,
  evidence: SafetyEvidenceRecord,
  context: { now: Date },
): PersistObservationResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const episode = requireEpisode(database, evidence.episodeId);
    const normalized = canonicalizeSafetyEvidence(evidence, context.now);
    assertSafetyEvidenceBinding(database, episode, normalized);
    const existing = findSafetyEvidenceByInstant(
      database,
      normalized.episodeId,
      normalized.kind,
      normalized.observedAt,
    );
    if (existing.length > 0) {
      if (existing.some((row) => !safetyEvidenceMatches(row, normalized))) {
        throw new RecoveryWatcherError(
          'Conflicting safety evidence for the same episode, kind, and observed_at.',
          { code: 'observation_conflict' },
        );
      }
      database.exec('COMMIT');
      return { idempotent: true };
    }
    database
      .prepare(
        `INSERT INTO rw0_safety_evidence_v2 (
          evidence_id, episode_id, mint, pair_address, confirmation_observed_at, confirmation_event_id,
          kind, status, observed_at, collected_at, provider, provenance,
          signal_version, signal_fingerprint, watcher_spec_version, watcher_spec_fingerprint,
          safety_spec_version, safety_spec_fingerprint, payload_json, reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        normalized.evidenceId,
        normalized.episodeId,
        normalized.mint,
        normalized.pairAddress,
        normalized.confirmationObservedAt,
        normalized.confirmationEventId,
        normalized.kind,
        normalized.status,
        normalized.observedAt,
        normalized.collectedAt,
        normalized.provider,
        normalized.provenance,
        normalized.signalVersion,
        normalized.signalFingerprint,
        normalized.watcherSpecVersion,
        normalized.watcherSpecFingerprint,
        normalized.safetySpecVersion,
        normalized.safetySpecFingerprint,
        JSON.stringify(normalized.payload),
        normalized.reason,
      );
    database.exec('COMMIT');
    return { idempotent: false };
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    throw new RecoveryWatcherError('Failed to persist safety evidence.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

export function listSafetyEvidence(
  database: DatabaseSync,
  episodeId: string,
  context: { now: Date } = { now: new Date() },
): SafetyEvidenceRecord[] {
  assertRecoverySchema(database);
  const episode = requireEpisode(database, episodeId);
  return database
    .prepare(
      'SELECT * FROM rw0_safety_evidence_v2 WHERE episode_id = ? ORDER BY collected_at ASC, evidence_id ASC',
    )
    .all(episodeId)
    .map((row) => hydrateSafetyEvidence(database, row, episode, context.now));
}

export function persistSafetyDecision(
  database: DatabaseSync,
  episodeId: string,
  decidedAt: string,
  context: { now: Date },
): { decision: SafetyDecisionRecord; idempotent: boolean } {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    assertNotFuture(decidedAt, context.now, 'safety decision decidedAt');
    const existingRow = database
      .prepare('SELECT * FROM rw0_safety_decisions WHERE episode_id = ?')
      .get(episodeId);
    if (existingRow !== undefined) {
      const existing = hydrateSafetyDecision(existingRow);
      const episode = requireEpisode(database, episodeId);
      assertPersistedSafetyDecision(database, episode, existing, context.now);
      if (!isSameUtcInstant(existing.decidedAt, decidedAt)) {
        throw new RecoveryWatcherError('Conflicting safety decision retry for this episode.', {
          code: 'transition_conflict',
        });
      }
      database.exec('COMMIT');
      return { decision: existing, idempotent: true };
    }
    const episode = requireEpisode(database, episodeId);
    if (episode.state !== 'SIGNAL_PENDING_SAFETY' || episode.recoveryConfirmedAt === null) {
      throw new RecoveryWatcherError(
        'Safety decision requires SIGNAL_PENDING_SAFETY with confirmed recovery.',
        {
          code: 'evidence_invalid',
        },
      );
    }
    assertTimestampOrder(
      episode.recoveryConfirmedAt,
      decidedAt,
      'Safety decision cannot precede recovery confirmation.',
    );
    const evidence = database
      .prepare('SELECT * FROM rw0_safety_evidence_v2 WHERE episode_id = ?')
      .all(episodeId)
      .map((row) => hydrateSafetyEvidence(database, row, episode, context.now))
      .filter(
        (row) =>
          parseUtcInstant(row.collectedAt, 'collected_at') <=
          parseUtcInstant(decidedAt, 'decided_at'),
      );
    const selected = selectDecisionEvidence(evidence);
    const statuses = RW0_SAFETY_GATE_KINDS.map((kind) => selected.get(kind)?.status ?? 'UNKNOWN');
    const hasFail = statuses.includes('FAIL');
    const hasUnknown = statuses.includes('UNKNOWN');
    const outcome = hasFail ? 'REJECTED_SAFETY' : 'REJECTED_SAFETY_UNKNOWN';
    const reason = hasFail
      ? `hard gate FAIL: ${RW0_SAFETY_GATE_KINDS.filter((_, index) => statuses[index] === 'FAIL').join(',')}`
      : hasUnknown
        ? `hard gate UNKNOWN: ${RW0_SAFETY_GATE_KINDS.filter((_, index) => statuses[index] === 'UNKNOWN').join(',')}`
        : 'all four evidence gates PASS; safety-evidence-only slice cannot make paper eligibility reachable';
    const evidenceIds = RW0_SAFETY_GATE_KINDS.map((kind) => selected.get(kind)?.evidenceId)
      .filter((value): value is string => value !== undefined)
      .sort();
    const decisionId = fingerprintCanonicalJson({
      episodeId,
      decidedAt,
      outcome,
      reason,
      statuses,
      evidenceIds,
    });
    const transition = applyPersistedSafetyRejectionInternal(
      episode,
      { to: outcome, at: decidedAt, reason: `slice3a:${decisionId}` },
      { now: context.now },
      statuses,
    );
    updateEpisodeRow(database, transition.episode);
    database
      .prepare(
        `INSERT INTO rw0_state_transitions (episode_id, from_state, to_state, at, reason, event_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        episodeId,
        transition.fromState,
        transition.toState,
        transition.at,
        transition.reason,
        transition.eventId,
      );
    const decision: SafetyDecisionRecord = {
      decisionId,
      episodeId,
      decidedAt,
      outcome,
      reason,
      tokenRightsStatus: statuses[0] ?? 'UNKNOWN',
      holderStatus: statuses[1] ?? 'UNKNOWN',
      bundleStatus: statuses[2] ?? 'UNKNOWN',
      creatorStatus: statuses[3] ?? 'UNKNOWN',
      evidenceIds,
    };
    database
      .prepare(
        `INSERT INTO rw0_safety_decisions (
          decision_id, episode_id, decided_at, outcome, reason,
          token_rights_status, holder_status, bundle_status, creator_status, evidence_ids_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        decision.decisionId,
        decision.episodeId,
        decision.decidedAt,
        decision.outcome,
        decision.reason,
        decision.tokenRightsStatus,
        decision.holderStatus,
        decision.bundleStatus,
        decision.creatorStatus,
        JSON.stringify(decision.evidenceIds),
      );
    database.exec('COMMIT');
    return { decision, idempotent: false };
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) throw error;
    throw new RecoveryWatcherError('Failed to persist safety decision.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

export function persistShadowExitObservation(
  database: DatabaseSync,
  observation: ShadowExitObservationRecord,
  context: { now: Date },
): PersistObservationResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const result = persistShadowExitObservationUnlocked(database, observation, context.now);
    database.exec('COMMIT');
    return result;
  } catch (error: unknown) {
    rollbackQuietly(database);
    if (error instanceof RecoveryWatcherError) {
      throw error;
    }
    throw new RecoveryWatcherError('Failed to persist shadow exit observation.', {
      code: 'persistence_failed',
      cause: error,
    });
  }
}

export function loadEpisode(database: DatabaseSync, episodeId: string): RecoveryEpisode | null {
  assertRecoverySchema(database);
  return loadEpisodeUnlocked(database, episodeId);
}

export function listEpisodesByMint(database: DatabaseSync, mint: string): RecoveryEpisode[] {
  assertRecoverySchema(database);
  return listEpisodesByMintUnlocked(database, mint);
}

export function listActiveEpisodes(database: DatabaseSync): RecoveryEpisode[] {
  assertRecoverySchema(database);
  return database
    .prepare('SELECT * FROM rw0_episodes')
    .all()
    .map((row) => hydrateEpisode(row))
    .filter((episode) => isActiveRecoveryEpisode(episode));
}

export function countHighResolutionWatchSlots(database: DatabaseSync): number {
  assertRecoverySchema(database);
  return countHighResolutionWatchSlotsUnlocked(database);
}

export function countRecoveryWatchEpisodes(database: DatabaseSync): number {
  return countHighResolutionWatchSlots(database);
}

export function listTransitions(
  database: DatabaseSync,
  episodeId: string,
): { fromState: string | null; toState: string; at: string; reason: string; eventId: string }[] {
  assertRecoverySchema(database);
  return database
    .prepare(
      `SELECT from_state, to_state, at, reason, event_id FROM rw0_state_transitions
       WHERE episode_id = ? ORDER BY id ASC`,
    )
    .all(episodeId)
    .map((row) => ({
      fromState: asNullableString(row['from_state']),
      toState: requireString(row['to_state']),
      at: requireString(row['at']),
      reason: requireString(row['reason']),
      eventId: requireString(row['event_id']),
    }));
}

export function listMarketObservations(
  database: DatabaseSync,
  episodeId: string,
): MarketObservationRecord[] {
  assertRecoverySchema(database);
  return database
    .prepare(
      `SELECT episode_id, mint, pair_address, collected_at, provider, source, price_usd, liquidity_usd,
              volume_5m_usd, price_change_5m_pct, signal_version, signal_fingerprint,
              watcher_spec_version, watcher_spec_fingerprint
       FROM rw0_market_observations
       WHERE episode_id = ?
       ORDER BY id ASC`,
    )
    .all(episodeId)
    .map((row) => asMarketObservationRecord(row, episodeId))
    .sort(
      (left, right) =>
        parseUtcInstant(left.collectedAt, 'collected_at') -
        parseUtcInstant(right.collectedAt, 'collected_at'),
    );
}

export function listScreeningObservations(database: DatabaseSync): ScreeningObservationRecord[] {
  assertRecoverySchema(database);
  return database
    .prepare('SELECT * FROM rw0_screening_observations ORDER BY screened_at ASC, screening_id ASC')
    .all()
    .map((row) => hydrateScreeningObservation(row));
}

export function listEpisodesInState(
  database: DatabaseSync,
  state: RecoveryEpisodeState,
): RecoveryEpisode[] {
  assertRecoverySchema(database);
  return database
    .prepare('SELECT * FROM rw0_episodes WHERE state = ?')
    .all(state)
    .map((row) => hydrateEpisode(row));
}

export function countShadowPositions(database: DatabaseSync): number {
  assertRecoverySchema(database);
  const row = database.prepare('SELECT COUNT(*) AS count FROM rw0_shadow_positions').get();
  return Number(row?.['count'] ?? 0);
}

export function loadRecoveryReportSnapshot(
  database: DatabaseSync,
  context: { now: Date; databasePath?: string } = { now: new Date() },
): RecoveryReportSnapshot {
  assertRecoverySchema(database);
  const dataset = inspectRecoveryDatasetManifest(database, context.databasePath ?? ':memory:');
  const screeningRows = listScreeningObservations(database);
  const screeningByDisposition = emptyScreeningDispositionCounts();
  const dipFilterCounts = emptyDipFilterResultCounts();
  for (const row of screeningRows) {
    screeningByDisposition[row.disposition] += 1;
    dipFilterCounts[row.dipFilterResult] += 1;
  }
  const stateCounts = new Map<string, number>();
  for (const row of database
    .prepare('SELECT state, COUNT(*) AS count FROM rw0_episodes GROUP BY state')
    .all()) {
    stateCounts.set(requireString(row['state']), Number(row['count'] ?? 0));
  }
  const admittedWatch = database
    .prepare(
      `SELECT COUNT(*) AS count FROM rw0_state_transitions WHERE to_state = 'RECOVERY_WATCH'`,
    )
    .get();
  const confirmed = database
    .prepare('SELECT COUNT(*) AS count FROM rw0_episodes WHERE recovery_confirmed_at IS NOT NULL')
    .get();
  const marketTimes = database
    .prepare('SELECT collected_at AS at FROM rw0_market_observations')
    .all();
  const timestamps = [
    ...marketTimes.map((row) => asNullableString(row['at'])),
    ...screeningRows.map((row) => row.screenedAt),
  ];
  const safetyEvidenceCounts = emptySafetyEvidenceCounts();
  const episodeIds = database
    .prepare('SELECT * FROM rw0_episodes')
    .all()
    .map((row) => hydrateEpisode(row).episodeId);
  for (const episodeId of episodeIds) {
    for (const evidence of listSafetyEvidence(database, episodeId, context)) {
      safetyEvidenceCounts[evidence.kind][evidence.status] += 1;
    }
  }
  const safetyDecisionReasons: Record<string, number> = {};
  for (const row of database.prepare('SELECT * FROM rw0_safety_decisions').all()) {
    const decision = hydrateSafetyDecision(row);
    const episode = requireEpisode(database, decision.episodeId);
    assertPersistedSafetyDecision(database, episode, decision, context.now);
    safetyDecisionReasons[decision.reason] = (safetyDecisionReasons[decision.reason] ?? 0) + 1;
  }
  return {
    dataset,
    screeningCount: screeningRows.length,
    screeningByDisposition,
    dipFilterPassCount: dipFilterCounts.PASS,
    dipFilterNotDipCount: dipFilterCounts.NOT_DIP,
    dipFilterIncompleteCount: dipFilterCounts.INCOMPLETE,
    dipFilterNotEvaluatedCount: dipFilterCounts.NOT_EVALUATED,
    admittedWatchCount: Number(admittedWatch?.['count'] ?? 0),
    activeWatchCount: stateCounts.get('RECOVERY_WATCH') ?? 0,
    confirmedRecoveryCount: Number(confirmed?.['count'] ?? 0),
    rejectedSafetyUnknownCount: stateCounts.get('REJECTED_SAFETY_UNKNOWN') ?? 0,
    expiredCount: stateCounts.get('EXPIRED') ?? 0,
    marketUnavailableCount: screeningByDisposition.MARKET_UNAVAILABLE,
    firstObservationAt: earliestUtcInstant(timestamps),
    lastObservationAt: latestUtcInstant(timestamps),
    shadowPositionCount: countShadowPositions(database),
    paperStateCount:
      (stateCounts.get('PAPER_ELIGIBLE') ?? 0) + (stateCounts.get('PAPER_OPEN') ?? 0),
    closedStateCount: stateCounts.get('CLOSED') ?? 0,
    rejectedSafetyCount: stateCounts.get('REJECTED_SAFETY') ?? 0,
    safetyEvidenceCounts,
    safetyDecisionReasons,
  };
}

export function emptyScreeningDispositionCounts(): Record<ScreeningDisposition, number> {
  const counts = {} as Record<ScreeningDisposition, number>;
  for (const disposition of RW0_SCREENING_DISPOSITIONS) {
    counts[disposition] = 0;
  }
  return counts;
}

export function emptyDipFilterResultCounts(): Record<ScreeningDipFilterResult, number> {
  const counts = {} as Record<ScreeningDipFilterResult, number>;
  for (const result of RW0_DIP_FILTER_RESULTS) {
    counts[result] = 0;
  }
  return counts;
}

function persistShadowExitObservationUnlocked(
  database: DatabaseSync,
  observation: ShadowExitObservationRecord,
  now: Date,
): PersistObservationResult {
  const episode = requireEpisode(database, observation.episodeId);
  assertShadowExitProvenance(episode, observation, now);
  const existing = findShadowExitObservationsByInstant(
    database,
    observation.episodeId,
    observation.pairAddress,
    observation.observedAt,
  );
  if (existing.length > 0) {
    if (existing.some((row) => !shadowExitMatches(row, observation))) {
      throw new RecoveryWatcherError(
        'Conflicting shadow exit observation for the same episode, pair, and observed_at.',
        { code: 'observation_conflict' },
      );
    }
    return { idempotent: true };
  }
  insertShadowExitObservationUnlocked(database, observation);
  return { idempotent: false };
}

function insertShadowExitObservationUnlocked(
  database: DatabaseSync,
  observation: ShadowExitObservationRecord,
): void {
  database
    .prepare(
      `INSERT INTO rw0_shadow_exit_observations (
        episode_id, observed_at, pair_address, observed_price_usd, threshold_price_usd,
        overshoot_pct, gap_flag, action
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      observation.episodeId,
      observation.observedAt,
      observation.pairAddress,
      observation.observedPriceUsd,
      observation.thresholdPriceUsd,
      observation.overshootPct,
      observation.gapFlag ? 1 : 0,
      observation.action,
    );
}

function insertEpisodeUnlocked(database: DatabaseSync, episode: RecoveryEpisode): void {
  database
    .prepare(
      `INSERT INTO rw0_episodes (
        episode_id, mint, pair_address, dip_observed_at, signal_version, signal_fingerprint,
        watcher_spec_version, watcher_spec_fingerprint, shadow_paper_spec_version, shadow_paper_fingerprint,
        exit_spec_version, exit_fingerprint, state, track, safety_incomplete, completeness_gate,
        holder_status, bundle_status, creator_status, cost_model, execution_model,
        dip_price_usd, dip_liquidity_usd, dip_volume_5m_usd, dip_price_change_5m_pct, dip_volume_to_liquidity_5m,
        recovery_confirmed_at, recovery_confirmation_price_usd, recovery_confirmation_liquidity_usd,
        recovery_confirmation_volume_5m_usd, recovery_confirmation_volume_to_liquidity_5m,
        watch_started_at, last_transition_event_id, last_from_state, safety_completed_at,
        shadow_entry_at, shadow_entry_price_usd, safe_entry_at, safe_entry_price_usd,
        safe_entry_observation_collected_at, closed_at, close_price_usd, close_reason,
        close_observation_collected_at, cooldown_until, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )`,
    )
    .run(...episodeValues(episode));
  database
    .prepare(
      `INSERT INTO rw0_state_transitions (episode_id, from_state, to_state, at, reason, event_id)
       VALUES (?, NULL, ?, ?, ?, ?)`,
    )
    .run(
      episode.episodeId,
      episode.state,
      episode.createdAt,
      'episode_created',
      episode.lastTransitionEventId,
    );
}

function insertShadowPositionIfAbsent(database: DatabaseSync, episode: RecoveryEpisode): void {
  if (episode.shadowEntryAt === null || episode.shadowEntryPriceUsd === null) {
    throw new RecoveryWatcherError('Shadow position requires entry time and price.', {
      code: 'persistence_failed',
    });
  }
  const record: ShadowPositionRecord = {
    episodeId: episode.episodeId,
    openedAt: episode.shadowEntryAt,
    entryPriceUsd: episode.shadowEntryPriceUsd,
    entryObservationCollectedAt: episode.shadowEntryAt,
    pairAddress: episode.pairAddress,
    safetyIncomplete: true,
    completenessGate: 'FAIL',
    liveReadiness: false,
    costModel: episode.costModel,
    executionModel: episode.executionModel,
  };
  database
    .prepare(
      `INSERT INTO rw0_shadow_positions (
        episode_id, opened_at, entry_price_usd, entry_observation_collected_at, pair_address,
        safety_incomplete, completeness_gate, live_readiness, cost_model, execution_model
      ) VALUES (?, ?, ?, ?, ?, 1, 'FAIL', 0, ?, ?)
      ON CONFLICT(episode_id) DO NOTHING`,
    )
    .run(
      record.episodeId,
      record.openedAt,
      record.entryPriceUsd,
      record.entryObservationCollectedAt,
      record.pairAddress,
      record.costModel,
      record.executionModel,
    );
}

function updateEpisodeRow(database: DatabaseSync, episode: RecoveryEpisode): void {
  database
    .prepare(
      `UPDATE rw0_episodes SET
        state = ?, track = ?, safety_incomplete = ?, completeness_gate = ?,
        holder_status = ?, bundle_status = ?, creator_status = ?,
        recovery_confirmed_at = ?, recovery_confirmation_price_usd = ?,
        recovery_confirmation_liquidity_usd = ?, recovery_confirmation_volume_5m_usd = ?,
        recovery_confirmation_volume_to_liquidity_5m = ?, watch_started_at = ?,
        last_transition_event_id = ?, last_from_state = ?, safety_completed_at = ?,
        shadow_entry_at = ?, shadow_entry_price_usd = ?, safe_entry_at = ?, safe_entry_price_usd = ?,
        safe_entry_observation_collected_at = ?, closed_at = ?, close_price_usd = ?, close_reason = ?,
        close_observation_collected_at = ?, cooldown_until = ?, updated_at = ?
       WHERE episode_id = ?`,
    )
    .run(
      episode.state,
      episode.track,
      episode.safetyIncomplete ? 1 : 0,
      episode.completenessGate,
      episode.holderStatus,
      episode.bundleStatus,
      episode.creatorStatus,
      episode.recoveryConfirmedAt,
      episode.recoveryConfirmationPriceUsd,
      episode.recoveryConfirmationLiquidityUsd,
      episode.recoveryConfirmationVolume5mUsd,
      episode.recoveryConfirmationVolumeToLiquidity5m,
      episode.watchStartedAt,
      episode.lastTransitionEventId,
      episode.lastFromState,
      episode.safetyCompletedAt,
      episode.shadowEntryAt,
      episode.shadowEntryPriceUsd,
      episode.safeEntryAt,
      episode.safeEntryPriceUsd,
      episode.safeEntryObservationCollectedAt,
      episode.closedAt,
      episode.closePriceUsd,
      episode.closeReason,
      episode.closeObservationCollectedAt,
      episode.cooldownUntil,
      episode.updatedAt,
      episode.episodeId,
    );
}

function episodeValues(episode: RecoveryEpisode): Array<string | number | null> {
  return [
    episode.episodeId,
    episode.mint,
    episode.pairAddress,
    episode.dipObservedAt,
    episode.signalVersion,
    episode.signalFingerprint,
    episode.watcherSpecVersion,
    episode.watcherSpecFingerprint,
    episode.shadowPaperSpecVersion,
    episode.shadowPaperFingerprint,
    episode.exitSpecVersion,
    episode.exitFingerprint,
    episode.state,
    episode.track,
    episode.safetyIncomplete ? 1 : 0,
    episode.completenessGate,
    episode.holderStatus,
    episode.bundleStatus,
    episode.creatorStatus,
    episode.costModel,
    episode.executionModel,
    episode.dipPriceUsd,
    episode.dipLiquidityUsd,
    episode.dipVolume5mUsd,
    episode.dipPriceChange5mPct,
    episode.dipVolumeToLiquidity5m,
    episode.recoveryConfirmedAt,
    episode.recoveryConfirmationPriceUsd,
    episode.recoveryConfirmationLiquidityUsd,
    episode.recoveryConfirmationVolume5mUsd,
    episode.recoveryConfirmationVolumeToLiquidity5m,
    episode.watchStartedAt,
    episode.lastTransitionEventId,
    episode.lastFromState,
    episode.safetyCompletedAt,
    episode.shadowEntryAt,
    episode.shadowEntryPriceUsd,
    episode.safeEntryAt,
    episode.safeEntryPriceUsd,
    episode.safeEntryObservationCollectedAt,
    episode.closedAt,
    episode.closePriceUsd,
    episode.closeReason,
    episode.closeObservationCollectedAt,
    episode.cooldownUntil,
    episode.createdAt,
    episode.updatedAt,
  ];
}

function loadEpisodeUnlocked(database: DatabaseSync, episodeId: string): RecoveryEpisode | null {
  const row = database.prepare('SELECT * FROM rw0_episodes WHERE episode_id = ?').get(episodeId);
  return row === undefined ? null : hydrateEpisode(row);
}

function listEpisodesByMintUnlocked(database: DatabaseSync, mint: string): RecoveryEpisode[] {
  return database
    .prepare('SELECT * FROM rw0_episodes WHERE mint = ?')
    .all(mint)
    .map((row) => hydrateEpisode(row))
    .sort((left, right) => {
      const byDip =
        parseUtcInstant(left.dipObservedAt, 'dip_observed_at') -
        parseUtcInstant(right.dipObservedAt, 'dip_observed_at');
      if (byDip !== 0) {
        return byDip;
      }
      return (
        parseUtcInstant(left.createdAt, 'created_at') -
        parseUtcInstant(right.createdAt, 'created_at')
      );
    });
}

function countHighResolutionWatchSlotsUnlocked(database: DatabaseSync): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM rw0_episodes WHERE state IN (${WATCH_SLOT_IN_LIST})`)
    .get();
  return Number(row?.['count'] ?? 0);
}

function requireEpisode(database: DatabaseSync, episodeId: string): RecoveryEpisode {
  const episode = loadEpisodeUnlocked(database, episodeId);
  if (episode === null) {
    throw new RecoveryWatcherError('Evidence episode does not exist.', {
      code: 'evidence_invalid',
    });
  }
  return episode;
}

function bindConfirmationRequestToPersistedObservation(
  database: DatabaseSync,
  episode: RecoveryEpisode,
  request: TransitionRequest,
): TransitionRequest {
  const confirmedAt = request.recoveryConfirmedAt ?? request.at;
  const pair = request.observationPairAddress ?? episode.pairAddress;
  if (pair !== episode.pairAddress) {
    throw new RecoveryWatcherError('Confirmation pair must match the pinned episode pair.', {
      code: 'evidence_invalid',
    });
  }
  if (
    request.recoveryConfirmedAt !== undefined &&
    !isSameUtcInstant(request.recoveryConfirmedAt, confirmedAt)
  ) {
    throw new RecoveryWatcherError(
      'Confirmation recoveryConfirmedAt must identify the same instant as the persisted observation.',
      { code: 'evidence_invalid' },
    );
  }
  const matches = findMarketObservationsByInstant(database, episode.episodeId, pair, confirmedAt);
  if (matches.length === 0) {
    throw new RecoveryWatcherError(
      'SIGNAL_PENDING_SAFETY requires a persisted rw0_market_observations row for this episode, pinned pair, and recoveryConfirmedAt.',
      { code: 'evidence_invalid' },
    );
  }
  const firstMatch = matches[0];
  if (firstMatch === undefined) {
    throw new RecoveryWatcherError(
      'SIGNAL_PENDING_SAFETY requires a persisted rw0_market_observations row for this episode, pinned pair, and recoveryConfirmedAt.',
      { code: 'evidence_invalid' },
    );
  }
  const observation = asMarketObservationRecord(firstMatch, episode.episodeId);
  if (matches.some((row) => !marketObservationMatches(row, observation))) {
    throw new RecoveryWatcherError(
      'Conflicting persisted market observations share the confirmation instant.',
      { code: 'observation_conflict' },
    );
  }
  if (observation.mint !== episode.mint) {
    throw new RecoveryWatcherError(
      'Persisted confirmation observation mint must match the episode mint.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (observation.pairAddress !== episode.pairAddress) {
    throw new RecoveryWatcherError(
      'Persisted confirmation observation pair must match the pinned episode pair.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (
    observation.signalVersion !== episode.signalVersion ||
    observation.signalFingerprint !== episode.signalFingerprint ||
    observation.watcherSpecVersion !== episode.watcherSpecVersion ||
    observation.watcherSpecFingerprint !== episode.watcherSpecFingerprint
  ) {
    throw new RecoveryWatcherError(
      'Persisted confirmation observation fingerprints must match the episode.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (
    !isKnownFinite(observation.priceUsd) ||
    !isKnownFinite(observation.liquidityUsd) ||
    !isKnownFinite(observation.volume5mUsd)
  ) {
    throw new RecoveryWatcherError(
      'Persisted confirmation observation is missing price, liquidity, or 5m volume.',
      { code: 'evidence_invalid' },
    );
  }
  assertCallerNumberAgrees(
    'recoveryConfirmationPriceUsd',
    request.recoveryConfirmationPriceUsd,
    observation.priceUsd,
  );
  assertCallerNumberAgrees(
    'recoveryConfirmationLiquidityUsd',
    request.recoveryConfirmationLiquidityUsd,
    observation.liquidityUsd,
  );
  assertCallerNumberAgrees(
    'recoveryConfirmationVolume5mUsd',
    request.recoveryConfirmationVolume5mUsd,
    observation.volume5mUsd,
  );
  const computedVl = computeVolumeToLiquidity5m(observation.volume5mUsd, observation.liquidityUsd);
  if (computedVl === null) {
    throw new RecoveryWatcherError(
      'Persisted confirmation observation cannot compute volume_to_liquidity_5m.',
      { code: 'evidence_invalid' },
    );
  }
  if (
    request.recoveryConfirmationVolumeToLiquidity5m !== undefined &&
    suppliedRatioDisagrees(request.recoveryConfirmationVolumeToLiquidity5m, computedVl)
  ) {
    throw new RecoveryWatcherError(
      'Caller-supplied confirmation V/L does not match the persisted market observation.',
      { code: 'evidence_invalid' },
    );
  }
  return {
    ...request,
    recoveryConfirmedAt: confirmedAt,
    observationPairAddress: observation.pairAddress,
    recoveryConfirmationPriceUsd: observation.priceUsd,
    recoveryConfirmationLiquidityUsd: observation.liquidityUsd,
    recoveryConfirmationVolume5mUsd: observation.volume5mUsd,
    recoveryConfirmationVolumeToLiquidity5m: computedVl,
  };
}

function assertCallerNumberAgrees(
  label: string,
  supplied: number | undefined,
  stored: number,
): void {
  if (supplied === undefined) {
    return;
  }
  if (supplied !== stored) {
    throw new RecoveryWatcherError(
      `Caller-supplied ${label} does not match the persisted market observation. Economic fields are derived from stored evidence.`,
      { code: 'evidence_invalid' },
    );
  }
}

function normalizeMarketObservation(observation: MarketObservationRecord): MarketObservationRecord {
  return {
    ...observation,
    provider: requireNonEmptyProvenance(observation.provider, 'market observation provider'),
    source: requireNonEmptyProvenance(observation.source, 'market observation source'),
  };
}

function normalizeScreeningObservation(
  observation: ScreeningObservationRecord,
  identityScope: 'current' | 'persisted',
): ScreeningObservationRecord {
  const discoverySources = requireNonEmptyProvenance(
    observation.discoverySources,
    'screening discovery_sources',
  );
  const reason = requireNonEmptyProvenance(observation.reason, 'screening reason');
  if (!isScreeningDisposition(observation.disposition)) {
    throw new RecoveryWatcherError('Unknown screening disposition.', { code: 'evidence_invalid' });
  }
  if (!isScreeningDipFilterResult(observation.dipFilterResult)) {
    throw new RecoveryWatcherError('Unknown screening dip_filter_result.', {
      code: 'evidence_invalid',
    });
  }
  if (identityScope === 'current') {
    assertCurrentScreeningIdentity(observation);
  } else {
    assertFrozenScreeningIdentity(observation);
  }
  assertOptionalPositivePrice(observation.priceUsd, 'screening priceUsd');
  assertOptionalFiniteNonNegative(observation.liquidityUsd, 'screening liquidityUsd');
  assertOptionalFiniteNonNegative(observation.volume5mUsd, 'screening volume5mUsd');
  if (observation.priceChange5mPct !== null && !isKnownFinite(observation.priceChange5mPct)) {
    throw new RecoveryWatcherError('screening priceChange5mPct must be finite when present.', {
      code: 'evidence_invalid',
    });
  }
  assertScreeningDipFilterSemantics(observation);
  return {
    ...observation,
    discoverySources,
    provider:
      observation.provider === null
        ? null
        : requireNonEmptyProvenance(observation.provider, 'screening provider'),
    source:
      observation.source === null
        ? null
        : requireNonEmptyProvenance(observation.source, 'screening source'),
    reason,
    collectedAtIsLocalCollectionTime: true,
  };
}

function findScreeningObservation(
  database: DatabaseSync,
  screeningId: string,
): ScreeningObservationRecord | null {
  const row = database
    .prepare('SELECT * FROM rw0_screening_observations WHERE screening_id = ?')
    .get(screeningId);
  return row === undefined ? null : hydrateScreeningObservation(row);
}

function screeningObservationMatches(
  left: ScreeningObservationRecord,
  right: ScreeningObservationRecord,
): boolean {
  return (
    left.screeningId === right.screeningId &&
    left.mint === right.mint &&
    isSameUtcInstant(left.screenedAt, right.screenedAt) &&
    left.discoverySources === right.discoverySources &&
    left.provider === right.provider &&
    left.source === right.source &&
    left.pairAddress === right.pairAddress &&
    left.priceUsd === right.priceUsd &&
    left.liquidityUsd === right.liquidityUsd &&
    left.volume5mUsd === right.volume5mUsd &&
    left.priceChange5mPct === right.priceChange5mPct &&
    left.signalVersion === right.signalVersion &&
    left.signalFingerprint === right.signalFingerprint &&
    left.watcherSpecVersion === right.watcherSpecVersion &&
    left.watcherSpecFingerprint === right.watcherSpecFingerprint &&
    left.dipFilterResult === right.dipFilterResult &&
    left.disposition === right.disposition &&
    left.reason === right.reason
  );
}

function hydrateScreeningObservation(
  row: Record<string, SQLOutputValue>,
): ScreeningObservationRecord {
  const disposition = requireString(row['disposition']);
  if (!isScreeningDisposition(disposition)) {
    throw new RecoveryWatcherError('Stored screening disposition is not a frozen rw0_v1 value.', {
      code: 'schema_mismatch',
    });
  }
  const dipFilterResult = requireString(row['dip_filter_result']);
  if (!isScreeningDipFilterResult(dipFilterResult)) {
    throw new RecoveryWatcherError(
      'Stored screening dip_filter_result is not a frozen rw0_v1 value.',
      {
        code: 'schema_mismatch',
      },
    );
  }
  const observation: ScreeningObservationRecord = {
    screeningId: requireString(row['screening_id']),
    mint: requireString(row['mint']),
    screenedAt: requireString(row['screened_at']),
    discoverySources: requireString(row['discovery_sources']),
    provider: asNullableString(row['provider']),
    source: asNullableString(row['source']),
    pairAddress: asNullableString(row['pair_address']),
    priceUsd: asNullableNumber(row['price_usd']),
    liquidityUsd: asNullableNumber(row['liquidity_usd']),
    volume5mUsd: asNullableNumber(row['volume_5m_usd']),
    priceChange5mPct: asNullableNumber(row['price_change_5m_pct']),
    signalVersion: requireString(row['signal_version']),
    signalFingerprint: requireString(row['signal_fingerprint']),
    watcherSpecVersion: requireString(row['watcher_spec_version']),
    watcherSpecFingerprint: requireString(row['watcher_spec_fingerprint']),
    dipFilterResult,
    disposition,
    reason: requireString(row['reason']),
    collectedAtIsLocalCollectionTime: true,
  };
  return normalizeScreeningObservation(observation, 'persisted');
}

function isScreeningDisposition(value: string): value is ScreeningDisposition {
  return (RW0_SCREENING_DISPOSITIONS as readonly string[]).includes(value);
}

function isScreeningDipFilterResult(value: string): value is ScreeningDipFilterResult {
  return (RW0_DIP_FILTER_RESULTS as readonly string[]).includes(value);
}

function assertScreeningDipFilterSemantics(observation: ScreeningObservationRecord): void {
  if (observation.disposition === 'DIP_PASS' && observation.dipFilterResult !== 'PASS') {
    throw new RecoveryWatcherError('DIP_PASS screening rows must store dip_filter_result=PASS.', {
      code: 'evidence_invalid',
    });
  }
  if (observation.disposition === 'NOT_DIP' && observation.dipFilterResult !== 'NOT_DIP') {
    throw new RecoveryWatcherError('NOT_DIP screening rows must store dip_filter_result=NOT_DIP.', {
      code: 'evidence_invalid',
    });
  }
  if (observation.disposition === 'INCOMPLETE' && observation.dipFilterResult !== 'INCOMPLETE') {
    throw new RecoveryWatcherError(
      'INCOMPLETE screening rows must store dip_filter_result=INCOMPLETE.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (observation.dipFilterResult === 'NOT_EVALUATED') {
    return;
  }
  const filters = evaluateRecoveryV0DipFilters({
    observedPriceUsd: observation.priceUsd,
    priceChange5mPct: observation.priceChange5mPct,
    volume5mUsd: observation.volume5mUsd,
    liquidityUsd: observation.liquidityUsd,
  });
  if (observation.dipFilterResult === 'PASS') {
    if (filters.kind !== 'pass') {
      throw new RecoveryWatcherError(
        'Screening dip_filter_result=PASS must recompute as a recovery_v0 dip filter pass.',
        { code: 'evidence_invalid' },
      );
    }
    if (
      observation.provider === null ||
      observation.source === null ||
      observation.pairAddress === null
    ) {
      throw new RecoveryWatcherError(
        'dip_filter_result=PASS requires provider, source, and pair_address provenance.',
        { code: 'evidence_invalid' },
      );
    }
    return;
  }
  if (observation.dipFilterResult === 'NOT_DIP' && filters.kind !== 'reject_filter') {
    throw new RecoveryWatcherError(
      'Screening dip_filter_result=NOT_DIP must recompute as a recovery_v0 filter rejection.',
      { code: 'evidence_invalid' },
    );
  }
  if (
    observation.dipFilterResult === 'INCOMPLETE' &&
    filters.kind !== 'reject_incomplete' &&
    filters.kind !== 'reject_invalid'
  ) {
    throw new RecoveryWatcherError(
      'Screening dip_filter_result=INCOMPLETE must recompute as incomplete or invalid recovery_v0 inputs.',
      { code: 'evidence_invalid' },
    );
  }
}

function assertAdmittedDipEvidenceBinding(input: {
  mint: string;
  observation: MarketObservationRecord;
  screening: ScreeningObservationRecord;
}): void {
  const { observation, screening } = input;
  assertFrozenScreeningIdentity(observation);
  assertFrozenScreeningIdentity(screening);
  if (screening.mint !== input.mint || observation.mint !== input.mint) {
    throw new RecoveryWatcherError(
      'Admitted dip watch mint must match screening and market observation mint.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (screening.pairAddress === null || screening.pairAddress !== observation.pairAddress) {
    throw new RecoveryWatcherError(
      'Admitted dip watch pair must match screening and market observation pair.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (!isSameUtcInstant(screening.screenedAt, observation.collectedAt)) {
    throw new RecoveryWatcherError(
      'Admitted dip watch screening.screenedAt must be the same UTC instant as observation.collectedAt.',
      { code: 'evidence_invalid' },
    );
  }
  if (
    screening.priceUsd !== observation.priceUsd ||
    screening.liquidityUsd !== observation.liquidityUsd ||
    screening.volume5mUsd !== observation.volume5mUsd ||
    screening.priceChange5mPct !== observation.priceChange5mPct
  ) {
    throw new RecoveryWatcherError(
      'Admitted dip watch screening economics must match the market observation.',
      { code: 'evidence_invalid' },
    );
  }
  if (
    screening.signalVersion !== observation.signalVersion ||
    screening.signalFingerprint !== observation.signalFingerprint ||
    screening.watcherSpecVersion !== observation.watcherSpecVersion ||
    screening.watcherSpecFingerprint !== observation.watcherSpecFingerprint
  ) {
    throw new RecoveryWatcherError(
      'Admitted dip watch screening identity must match the market observation.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (screening.disposition !== 'DIP_PASS' || screening.dipFilterResult !== 'PASS') {
    throw new RecoveryWatcherError(
      'persistAdmittedDipWatch requires operational DIP_PASS and dip_filter_result=PASS.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (screening.provider !== observation.provider || screening.source !== observation.source) {
    throw new RecoveryWatcherError(
      'Admitted dip watch screening provider/source must match the market observation.',
      { code: 'evidence_invalid' },
    );
  }
  if (
    observation.provider !== RW0_MARKET_PROVIDER ||
    observation.source !== RW0_SCREENING_MARKET_SOURCE ||
    screening.provider !== RW0_MARKET_PROVIDER ||
    screening.source !== RW0_SCREENING_MARKET_SOURCE
  ) {
    throw new RecoveryWatcherError(
      'Admitted dip watch must use the frozen DexScreener screening snapshot provenance.',
      { code: 'evidence_invalid' },
    );
  }
  const filters = evaluateRecoveryV0DipFilters({
    observedPriceUsd: observation.priceUsd,
    priceChange5mPct: observation.priceChange5mPct,
    volume5mUsd: observation.volume5mUsd,
    liquidityUsd: observation.liquidityUsd,
  });
  if (filters.kind !== 'pass') {
    throw new RecoveryWatcherError(
      'persistAdmittedDipWatch recomputed recovery_v0 dip filter from stored economics and it did not pass.',
      { code: 'evidence_invalid' },
    );
  }
}

function earliestUtcInstant(values: Array<string | null>): string | null {
  let best: { text: string; ms: number } | null = null;
  for (const value of values) {
    if (value === null) {
      continue;
    }
    const ms = parseUtcInstant(value, 'observation bound');
    if (best === null || ms < best.ms) {
      best = { text: value, ms };
    }
  }
  return best?.text ?? null;
}

function latestUtcInstant(values: Array<string | null>): string | null {
  let best: { text: string; ms: number } | null = null;
  for (const value of values) {
    if (value === null) {
      continue;
    }
    const ms = parseUtcInstant(value, 'observation bound');
    if (best === null || ms > best.ms) {
      best = { text: value, ms };
    }
  }
  return best?.text ?? null;
}

function requireNonEmptyProvenance(value: string, label: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new RecoveryWatcherError(`${label} must be a non-empty provenance string.`, {
      code: 'evidence_invalid',
    });
  }
  return trimmed;
}

function findMarketObservationsByInstant(
  database: DatabaseSync,
  episodeId: string,
  pairAddress: string,
  collectedAt: string,
): Record<string, SQLOutputValue>[] {
  return database
    .prepare(
      `SELECT mint, pair_address, collected_at, provider, source, price_usd, liquidity_usd, volume_5m_usd,
              price_change_5m_pct, signal_version, signal_fingerprint, watcher_spec_version, watcher_spec_fingerprint
       FROM rw0_market_observations
       WHERE episode_id = ? AND pair_address = ?`,
    )
    .all(episodeId, pairAddress)
    .filter((row) => isSameUtcInstant(requireString(row['collected_at']), collectedAt));
}

function findSafetyEvidenceByInstant(
  database: DatabaseSync,
  episodeId: string,
  kind: string,
  observedAt: string,
): Record<string, SQLOutputValue>[] {
  return database
    .prepare(
      `SELECT *
       FROM rw0_safety_evidence_v2
       WHERE episode_id = ? AND kind = ?`,
    )
    .all(episodeId, kind)
    .filter((row) => isSameUtcInstant(requireString(row['observed_at']), observedAt));
}

function findShadowExitObservationsByInstant(
  database: DatabaseSync,
  episodeId: string,
  pairAddress: string,
  observedAt: string,
): Record<string, SQLOutputValue>[] {
  return database
    .prepare(
      `SELECT observed_at, observed_price_usd, threshold_price_usd, overshoot_pct, gap_flag, action
       FROM rw0_shadow_exit_observations
       WHERE episode_id = ? AND pair_address = ?`,
    )
    .all(episodeId, pairAddress)
    .filter((row) => isSameUtcInstant(requireString(row['observed_at']), observedAt));
}

function asMarketObservationRecord(
  row: Record<string, SQLOutputValue>,
  episodeId: string,
): MarketObservationRecord {
  return {
    episodeId,
    mint: requireString(row['mint']),
    pairAddress: requireString(row['pair_address']),
    collectedAt: requireString(row['collected_at']),
    provider: requireString(row['provider']),
    source: requireString(row['source']),
    priceUsd: asNullableNumber(row['price_usd']),
    liquidityUsd: asNullableNumber(row['liquidity_usd']),
    volume5mUsd: asNullableNumber(row['volume_5m_usd']),
    priceChange5mPct: asNullableNumber(row['price_change_5m_pct']),
    signalVersion: requireString(row['signal_version']),
    signalFingerprint: requireString(row['signal_fingerprint']),
    watcherSpecVersion: requireString(row['watcher_spec_version']),
    watcherSpecFingerprint: requireString(row['watcher_spec_fingerprint']),
  };
}

function assertMarketObservationProvenance(
  episode: RecoveryEpisode,
  observation: MarketObservationRecord,
  now: Date,
): void {
  assertNotFuture(observation.collectedAt, now, 'market observation collectedAt');
  if (observation.mint !== episode.mint) {
    throw new RecoveryWatcherError('Market observation mint must match the episode mint.', {
      code: 'evidence_invalid',
    });
  }
  if (observation.pairAddress !== episode.pairAddress) {
    throw new RecoveryWatcherError('Market observation pair must match the pinned episode pair.', {
      code: 'evidence_invalid',
    });
  }
  if (
    observation.signalVersion !== episode.signalVersion ||
    observation.signalFingerprint !== episode.signalFingerprint ||
    observation.watcherSpecVersion !== episode.watcherSpecVersion ||
    observation.watcherSpecFingerprint !== episode.watcherSpecFingerprint
  ) {
    throw new RecoveryWatcherError('Market observation fingerprints must match the episode.', {
      code: 'evidence_invalid',
    });
  }
  assertOptionalPositivePrice(observation.priceUsd, 'market observation priceUsd');
  assertOptionalFiniteNonNegative(observation.liquidityUsd, 'market observation liquidityUsd');
  assertOptionalFiniteNonNegative(observation.volume5mUsd, 'market observation volume5mUsd');
  if (observation.priceChange5mPct !== null && !isKnownFinite(observation.priceChange5mPct)) {
    throw new RecoveryWatcherError(
      'market observation priceChange5mPct must be finite when present.',
      {
        code: 'evidence_invalid',
      },
    );
  }
}

function assertShadowExitProvenance(
  episode: RecoveryEpisode,
  observation: ShadowExitObservationRecord,
  now: Date,
): void {
  assertNotFuture(observation.observedAt, now, 'shadow exit observedAt');
  if (!isShadowResearch(episode) || episode.shadowEntryAt === null) {
    throw new RecoveryWatcherError('Shadow exit observations require an open shadow episode.', {
      code: 'evidence_invalid',
    });
  }
  if (observation.pairAddress !== episode.pairAddress) {
    throw new RecoveryWatcherError('Shadow exit pair must match the episode pair.', {
      code: 'evidence_invalid',
    });
  }
  if (!isShadowExitAction(observation.action)) {
    throw new RecoveryWatcherError('Shadow exit action must be a defined enum value.', {
      code: 'evidence_invalid',
    });
  }
  if (observation.action !== 'hold') {
    throw new RecoveryWatcherError(
      'Shadow exit execution is not implemented in rw0_v1. Only hold research snapshots may be stored.',
      { code: 'close_not_implemented' },
    );
  }
  assertTimestampOrder(
    episode.shadowEntryAt,
    observation.observedAt,
    'Shadow exit observedAt must be at or after shadow entry.',
  );
  assertOptionalPositivePrice(observation.observedPriceUsd, 'shadow exit observedPriceUsd');
  assertOptionalPositivePrice(observation.thresholdPriceUsd, 'shadow exit thresholdPriceUsd');
  if (observation.overshootPct !== null && !isKnownFinite(observation.overshootPct)) {
    throw new RecoveryWatcherError('shadow exit overshootPct must be finite when present.', {
      code: 'evidence_invalid',
    });
  }
}

function marketObservationMatches(
  row: Record<string, SQLOutputValue>,
  observation: MarketObservationRecord,
): boolean {
  return (
    asNullableString(row['mint']) === observation.mint &&
    asNullableString(row['pair_address']) === observation.pairAddress &&
    requireString(row['provider']) === observation.provider &&
    requireString(row['source']) === observation.source &&
    asNullableNumber(row['price_usd']) === observation.priceUsd &&
    asNullableNumber(row['liquidity_usd']) === observation.liquidityUsd &&
    asNullableNumber(row['volume_5m_usd']) === observation.volume5mUsd &&
    asNullableNumber(row['price_change_5m_pct']) === observation.priceChange5mPct &&
    requireString(row['signal_version']) === observation.signalVersion &&
    requireString(row['signal_fingerprint']) === observation.signalFingerprint &&
    requireString(row['watcher_spec_version']) === observation.watcherSpecVersion &&
    requireString(row['watcher_spec_fingerprint']) === observation.watcherSpecFingerprint
  );
}

function shadowExitMatches(
  row: Record<string, SQLOutputValue>,
  observation: ShadowExitObservationRecord,
): boolean {
  return (
    asNullableNumber(row['observed_price_usd']) === observation.observedPriceUsd &&
    asNullableNumber(row['threshold_price_usd']) === observation.thresholdPriceUsd &&
    asNullableNumber(row['overshoot_pct']) === observation.overshootPct &&
    requireFinite(row['gap_flag']) === (observation.gapFlag ? 1 : 0) &&
    requireString(row['action']) === observation.action
  );
}

function safetyEvidenceMatches(
  row: Record<string, SQLOutputValue>,
  evidence: SafetyEvidenceRecord,
): boolean {
  try {
    const payload = JSON.parse(
      requireString(row['payload_json']),
    ) as SafetyEvidenceRecord['payload'];
    return (
      requireString(row['evidence_id']) === evidence.evidenceId &&
      requireString(row['mint']) === evidence.mint &&
      requireString(row['pair_address']) === evidence.pairAddress &&
      isSameUtcInstant(
        requireString(row['confirmation_observed_at']),
        evidence.confirmationObservedAt,
      ) &&
      requireString(row['confirmation_event_id']) === evidence.confirmationEventId &&
      requireString(row['status']) === evidence.status &&
      isSameUtcInstant(requireString(row['collected_at']), evidence.collectedAt) &&
      asNullableString(row['provider']) === evidence.provider &&
      requireString(row['provenance']) === evidence.provenance &&
      requireString(row['signal_version']) === evidence.signalVersion &&
      requireString(row['signal_fingerprint']) === evidence.signalFingerprint &&
      requireString(row['watcher_spec_version']) === evidence.watcherSpecVersion &&
      requireString(row['watcher_spec_fingerprint']) === evidence.watcherSpecFingerprint &&
      requireString(row['safety_spec_version']) === evidence.safetySpecVersion &&
      requireString(row['safety_spec_fingerprint']) === evidence.safetySpecFingerprint &&
      requireString(row['reason']) === evidence.reason &&
      JSON.stringify(payload) === JSON.stringify(evidence.payload)
    );
  } catch {
    return false;
  }
}

function hydrateSafetyEvidence(
  database: DatabaseSync,
  row: Record<string, SQLOutputValue>,
  episode: RecoveryEpisode,
  now: Date,
): SafetyEvidenceRecord {
  let payload: SafetyEvidenceRecord['payload'];
  try {
    payload = JSON.parse(requireString(row['payload_json'])) as SafetyEvidenceRecord['payload'];
  } catch (error: unknown) {
    throw new RecoveryWatcherError('Stored safety evidence payload is malformed.', {
      code: 'evidence_invalid',
      cause: error,
    });
  }
  const evidence = canonicalizeSafetyEvidence(
    {
      evidenceId: requireString(row['evidence_id']),
      episodeId: requireString(row['episode_id']),
      mint: requireString(row['mint']),
      pairAddress: requireString(row['pair_address']),
      confirmationObservedAt: requireString(row['confirmation_observed_at']),
      confirmationEventId: requireString(row['confirmation_event_id']),
      kind: requireString(row['kind']) as SafetyGateKind,
      status: requireString(row['status']) as SafetyGateStatus,
      observedAt: requireString(row['observed_at']),
      collectedAt: requireString(row['collected_at']),
      provider: asNullableString(row['provider']),
      provenance: requireString(row['provenance']),
      signalVersion: requireString(row['signal_version']),
      signalFingerprint: requireString(row['signal_fingerprint']),
      watcherSpecVersion: requireString(row['watcher_spec_version']),
      watcherSpecFingerprint: requireString(row['watcher_spec_fingerprint']),
      safetySpecVersion: requireString(row['safety_spec_version']),
      safetySpecFingerprint: requireString(row['safety_spec_fingerprint']),
      payload,
      reason: requireString(row['reason']),
    },
    now,
  );
  assertSafetyEvidenceBinding(database, episode, evidence);
  return evidence;
}

function assertSafetyEvidenceBinding(
  database: DatabaseSync,
  episode: RecoveryEpisode,
  evidence: SafetyEvidenceRecord,
): void {
  if (!isCurrentRw0WatcherIdentity(episode) || !isCurrentRw0WatcherIdentity(evidence)) {
    throw new RecoveryWatcherError(
      'New safety evidence must use the current watcher identity and cannot bind to a legacy episode.',
      { code: 'definition_mismatch' },
    );
  }
  if (episode.recoveryConfirmedAt === null) {
    throw new RecoveryWatcherError('Safety evidence requires a confirmed recovery episode.', {
      code: 'evidence_invalid',
    });
  }
  if (evidence.episodeId !== episode.episodeId || evidence.mint !== episode.mint) {
    throw new RecoveryWatcherError(
      'Safety evidence episode or mint does not match persisted confirmation.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (evidence.pairAddress !== episode.pairAddress) {
    throw new RecoveryWatcherError('Safety evidence pair must match the pinned episode pair.', {
      code: 'evidence_invalid',
    });
  }
  if (!isSameUtcInstant(evidence.confirmationObservedAt, episode.recoveryConfirmedAt)) {
    throw new RecoveryWatcherError(
      'Safety evidence confirmation identity does not match the episode.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  const confirmationTransitions = database
    .prepare(
      `SELECT event_id, at FROM rw0_state_transitions
       WHERE episode_id = ? AND to_state = 'SIGNAL_PENDING_SAFETY'`,
    )
    .all(episode.episodeId)
    .filter((row) => isSameUtcInstant(requireString(row['at']), evidence.confirmationObservedAt));
  if (
    confirmationTransitions.length !== 1 ||
    requireString(confirmationTransitions[0]?.['event_id']) !== evidence.confirmationEventId
  ) {
    throw new RecoveryWatcherError(
      'Safety evidence confirmation event identity does not match persisted history.',
      {
        code: 'evidence_invalid',
      },
    );
  }
  if (
    evidence.signalVersion !== episode.signalVersion ||
    evidence.signalFingerprint !== episode.signalFingerprint ||
    evidence.watcherSpecVersion !== episode.watcherSpecVersion ||
    evidence.watcherSpecFingerprint !== episode.watcherSpecFingerprint ||
    evidence.safetySpecVersion !== RW0_SAFETY_SPEC_VERSION ||
    evidence.safetySpecFingerprint !== RW0_SAFETY_SPEC_FINGERPRINT
  ) {
    throw new RecoveryWatcherError(
      'Safety evidence frozen identities do not match the episode and safety spec.',
      {
        code: 'definition_mismatch',
      },
    );
  }
}

function selectDecisionEvidence(
  evidence: readonly SafetyEvidenceRecord[],
): Map<SafetyGateKind, SafetyEvidenceRecord> {
  const selected = new Map<SafetyGateKind, SafetyEvidenceRecord>();
  for (const row of evidence) {
    const previous = selected.get(row.kind);
    if (
      previous === undefined ||
      parseUtcInstant(row.collectedAt, 'collected_at') >
        parseUtcInstant(previous.collectedAt, 'collected_at')
    ) {
      selected.set(row.kind, row);
    } else if (
      parseUtcInstant(row.collectedAt, 'collected_at') ===
        parseUtcInstant(previous.collectedAt, 'collected_at') &&
      row.evidenceId !== previous.evidenceId
    ) {
      throw new RecoveryWatcherError(
        'Conflicting safety evidence shares the latest collection instant.',
        {
          code: 'observation_conflict',
        },
      );
    }
  }
  return selected;
}

function hydrateSafetyDecision(row: Record<string, SQLOutputValue>): SafetyDecisionRecord {
  let evidenceIds: string[];
  try {
    const parsed = JSON.parse(requireString(row['evidence_ids_json'])) as unknown;
    if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === 'string'))
      throw new Error('invalid');
    evidenceIds = parsed;
  } catch (error: unknown) {
    throw new RecoveryWatcherError('Stored safety decision evidence identities are malformed.', {
      code: 'evidence_invalid',
      cause: error,
    });
  }
  const outcome = requireString(row['outcome']);
  if (outcome !== 'REJECTED_SAFETY' && outcome !== 'REJECTED_SAFETY_UNKNOWN') {
    throw new RecoveryWatcherError('Stored safety decision outcome is malformed.', {
      code: 'evidence_invalid',
    });
  }
  const statuses = [
    requireString(row['token_rights_status']),
    requireString(row['holder_status']),
    requireString(row['bundle_status']),
    requireString(row['creator_status']),
  ];
  if (statuses.some((status) => status !== 'PASS' && status !== 'FAIL' && status !== 'UNKNOWN')) {
    throw new RecoveryWatcherError('Stored safety decision status is malformed.', {
      code: 'evidence_invalid',
    });
  }
  return {
    decisionId: requireString(row['decision_id']),
    episodeId: requireString(row['episode_id']),
    decidedAt: requireString(row['decided_at']),
    outcome,
    reason: requireString(row['reason']),
    tokenRightsStatus: statuses[0] as SafetyGateStatus,
    holderStatus: statuses[1] as SafetyGateStatus,
    bundleStatus: statuses[2] as SafetyGateStatus,
    creatorStatus: statuses[3] as SafetyGateStatus,
    evidenceIds,
  };
}

function assertPersistedSafetyDecision(
  database: DatabaseSync,
  episode: RecoveryEpisode,
  decision: SafetyDecisionRecord,
  now: Date,
): void {
  assertNotFuture(decision.decidedAt, now, 'stored safety decision decidedAt');
  if (episode.state !== decision.outcome) {
    throw new RecoveryWatcherError('Stored safety decision outcome does not match episode state.', {
      code: 'evidence_invalid',
    });
  }
  const evidence = database
    .prepare('SELECT * FROM rw0_safety_evidence_v2 WHERE episode_id = ?')
    .all(episode.episodeId)
    .map((row) => hydrateSafetyEvidence(database, row, episode, now))
    .filter(
      (row) =>
        parseUtcInstant(row.collectedAt, 'collected_at') <=
        parseUtcInstant(decision.decidedAt, 'decided_at'),
    );
  const selected = selectDecisionEvidence(evidence);
  const statuses = RW0_SAFETY_GATE_KINDS.map((kind) => selected.get(kind)?.status ?? 'UNKNOWN');
  const expectedOutcome = statuses.includes('FAIL') ? 'REJECTED_SAFETY' : 'REJECTED_SAFETY_UNKNOWN';
  const hasUnknown = statuses.includes('UNKNOWN');
  const expectedReason = statuses.includes('FAIL')
    ? `hard gate FAIL: ${RW0_SAFETY_GATE_KINDS.filter((_, index) => statuses[index] === 'FAIL').join(',')}`
    : hasUnknown
      ? `hard gate UNKNOWN: ${RW0_SAFETY_GATE_KINDS.filter((_, index) => statuses[index] === 'UNKNOWN').join(',')}`
      : 'all four evidence gates PASS; safety-evidence-only slice cannot make paper eligibility reachable';
  const evidenceIds = RW0_SAFETY_GATE_KINDS.map((kind) => selected.get(kind)?.evidenceId)
    .filter((value): value is string => value !== undefined)
    .sort();
  const expectedId = fingerprintCanonicalJson({
    episodeId: episode.episodeId,
    decidedAt: decision.decidedAt,
    outcome: expectedOutcome,
    reason: expectedReason,
    statuses,
    evidenceIds,
  });
  const persistedStatuses = [
    decision.tokenRightsStatus,
    decision.holderStatus,
    decision.bundleStatus,
    decision.creatorStatus,
  ];
  if (
    decision.decisionId !== expectedId ||
    decision.outcome !== expectedOutcome ||
    decision.reason !== expectedReason ||
    JSON.stringify(persistedStatuses) !== JSON.stringify(statuses) ||
    JSON.stringify(decision.evidenceIds) !== JSON.stringify(evidenceIds)
  ) {
    throw new RecoveryWatcherError(
      'Stored safety decision does not match canonical persisted evidence.',
      {
        code: 'evidence_invalid',
      },
    );
  }
}

function hydrateEpisode(row: Record<string, SQLOutputValue>): RecoveryEpisode {
  const costModel = asRecoveryCostModel(requireString(row['cost_model']));
  const executionModel = asRecoveryExecutionModel(requireString(row['execution_model']));
  const state = requireString(row['state']) as RecoveryEpisodeState;
  const completenessGate = requireString(row['completeness_gate']) as CompletenessGate;
  const track = requireString(row['track']) as ResearchTrack;
  const holderStatus = requireString(row['holder_status']) as SafetyGateStatus;
  const bundleStatus = requireString(row['bundle_status']) as SafetyGateStatus;
  const creatorStatus = requireString(row['creator_status']) as SafetyGateStatus;
  const episodeIdentity = {
    state,
    completenessGate,
    signalVersion: requireString(row['signal_version']),
    signalFingerprint: requireString(row['signal_fingerprint']),
    watcherSpecVersion: requireString(row['watcher_spec_version']),
    watcherSpecFingerprint: requireString(row['watcher_spec_fingerprint']),
    shadowPaperSpecVersion: requireString(row['shadow_paper_spec_version']),
    shadowPaperFingerprint: requireString(row['shadow_paper_fingerprint']),
    exitSpecVersion: requireString(row['exit_spec_version']),
    exitFingerprint: requireString(row['exit_fingerprint']),
    costModel,
    executionModel,
  };
  assertPersistedRw0Identity({
    ...episodeIdentity,
    track,
    holderStatus,
    bundleStatus,
    creatorStatus,
    safetyCompletedAt: asNullableString(row['safety_completed_at']),
    shadowEntryAt: asNullableString(row['shadow_entry_at']),
    shadowEntryPriceUsd: asNullableNumber(row['shadow_entry_price_usd']),
    safeEntryAt: asNullableString(row['safe_entry_at']),
    safeEntryPriceUsd: asNullableNumber(row['safe_entry_price_usd']),
    safeEntryObservationCollectedAt: asNullableString(row['safe_entry_observation_collected_at']),
  });
  return {
    episodeId: requireString(row['episode_id']),
    mint: requireString(row['mint']),
    pairAddress: requireString(row['pair_address']),
    dipObservedAt: requireString(row['dip_observed_at']),
    ...episodeIdentity,
    track,
    safetyIncomplete: requireFinite(row['safety_incomplete']) === 1,
    holderStatus,
    bundleStatus,
    creatorStatus,
    dipPriceUsd: asNullableNumber(row['dip_price_usd']),
    dipLiquidityUsd: asNullableNumber(row['dip_liquidity_usd']),
    dipVolume5mUsd: asNullableNumber(row['dip_volume_5m_usd']),
    dipPriceChange5mPct: asNullableNumber(row['dip_price_change_5m_pct']),
    dipVolumeToLiquidity5m: asNullableNumber(row['dip_volume_to_liquidity_5m']),
    recoveryConfirmedAt: asNullableString(row['recovery_confirmed_at']),
    recoveryConfirmationPriceUsd: asNullableNumber(row['recovery_confirmation_price_usd']),
    recoveryConfirmationLiquidityUsd: asNullableNumber(row['recovery_confirmation_liquidity_usd']),
    recoveryConfirmationVolume5mUsd: asNullableNumber(row['recovery_confirmation_volume_5m_usd']),
    recoveryConfirmationVolumeToLiquidity5m: asNullableNumber(
      row['recovery_confirmation_volume_to_liquidity_5m'],
    ),
    watchStartedAt: asNullableString(row['watch_started_at']),
    lastTransitionEventId: requireString(row['last_transition_event_id']),
    lastFromState: asNullableString(row['last_from_state']) as RecoveryEpisodeState | null,
    safetyCompletedAt: asNullableString(row['safety_completed_at']),
    shadowEntryAt: asNullableString(row['shadow_entry_at']),
    shadowEntryPriceUsd: asNullableNumber(row['shadow_entry_price_usd']),
    safeEntryAt: asNullableString(row['safe_entry_at']),
    safeEntryPriceUsd: asNullableNumber(row['safe_entry_price_usd']),
    safeEntryObservationCollectedAt: asNullableString(row['safe_entry_observation_collected_at']),
    closedAt: asNullableString(row['closed_at']),
    closePriceUsd: asNullableNumber(row['close_price_usd']),
    closeReason: asNullableCloseReason(row['close_reason']),
    closeObservationCollectedAt: asNullableString(row['close_observation_collected_at']),
    cooldownUntil: asNullableString(row['cooldown_until']),
    createdAt: requireString(row['created_at']),
    updatedAt: requireString(row['updated_at']),
  };
}

function asNullableCloseReason(value: SQLOutputValue | undefined): ShadowCloseReason | null {
  const text = asNullableString(value);
  if (text === null) {
    return null;
  }
  if (!(SHADOW_CLOSE_REASONS as readonly string[]).includes(text)) {
    throw new RecoveryWatcherError('Recovery episode close_reason is malformed.', {
      code: 'persistence_failed',
    });
  }
  return text as ShadowCloseReason;
}

function requireString(value: SQLOutputValue | undefined): string {
  if (typeof value !== 'string') {
    throw new RecoveryWatcherError('Recovery episode text field is malformed.', {
      code: 'persistence_failed',
    });
  }
  return value;
}

function requireFinite(value: SQLOutputValue | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RecoveryWatcherError('Recovery episode numeric field is malformed.', {
      code: 'persistence_failed',
    });
  }
  return value;
}

function asNullableNumber(value: SQLOutputValue | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  throw new RecoveryWatcherError('Recovery episode numeric field is malformed.', {
    code: 'persistence_failed',
  });
}

function asNullableString(value: SQLOutputValue | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    return value;
  }
  throw new RecoveryWatcherError('Recovery episode text field is malformed.', {
    code: 'persistence_failed',
  });
}

function rollbackQuietly(database: DatabaseSync): void {
  try {
    database.exec('ROLLBACK');
  } catch {
    // already closed
  }
}

function isUniqueConstraint(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('UNIQUE constraint failed') || message.includes('SQLITE_CONSTRAINT');
}
