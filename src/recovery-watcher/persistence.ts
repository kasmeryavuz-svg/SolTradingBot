import type { DatabaseSync, SQLOutputValue } from 'node:sqlite';
import { RW0_WATCH_SLOT_STATES, SHADOW_CLOSE_REASONS } from './constants.js';
import { assertNotFuture, assertTimestampOrder, isSameUtcInstant, parseUtcInstant } from './clock.js';
import { RecoveryWatcherError } from './errors.js';
import {
  asRecoveryCostModel,
  asRecoveryExecutionModel,
  assertPersistedRw0Identity,
} from './identity.js';
import {
  assertOptionalFiniteNonNegative,
  assertOptionalPositivePrice,
  computeVolumeToLiquidity5m,
  isKnownFinite,
  suppliedRatioDisagrees,
} from './signal.js';
import {
  applyTransition,
  assertCanCreateEpisode,
  createEpisode,
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
  ResearchTrack,
  SafetyEvidenceRecord,
  SafetyGateStatus,
  ShadowCloseReason,
  ShadowExitObservationRecord,
  ShadowPositionRecord,
  TransitionContext,
  TransitionRequest,
  TransitionResult,
} from './types.js';
import { assertRecoverySchema } from './db/database.js';

const WATCH_SLOT_IN_LIST = RW0_WATCH_SLOT_STATES.map((state) => `'${state}'`).join(', ');

export function persistCreatedEpisode(
  database: DatabaseSync,
  input: CreateEpisodeInput,
  context: { now: Date },
): RecoveryEpisode {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const existing = listEpisodesByMintUnlocked(database, input.mint);
    assertCanCreateEpisode({ mint: input.mint, existing, now: context.now });
    const episode = createEpisode(input, context);
    insertEpisodeUnlocked(database, episode);
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
    const current = loadEpisodeUnlocked(database, episodeId);
    if (current === null) {
      throw new RecoveryWatcherError('Recovery episode does not exist.', { code: 'persistence_failed' });
    }
    if (expected !== undefined && !isSameUtcInstant(expected.updatedAt, current.updatedAt)) {
      throw new RecoveryWatcherError('Stale recovery episode object. Refusing to overwrite newer persisted state.', {
        code: 'stale_episode',
      });
    }
    if (expected?.state !== undefined && expected.state !== current.state) {
      throw new RecoveryWatcherError('Stale recovery episode object. Refusing to overwrite newer persisted state.', {
        code: 'stale_episode',
      });
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
        .run(result.episode.episodeId, result.fromState, result.toState, result.at, result.reason, result.eventId);
      if (result.toState === 'SHADOW_RESEARCH_OPEN') {
        insertShadowPositionIfAbsent(database, result.episode);
      }
    }
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
    const episode = requireEpisode(database, observation.episodeId);
    const normalized = normalizeMarketObservation(observation);
    assertMarketObservationProvenance(episode, normalized, context.now);
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
      database.exec('COMMIT');
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
    database.exec('COMMIT');
    return { idempotent: false };
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

export function persistSafetyEvidence(
  database: DatabaseSync,
  evidence: SafetyEvidenceRecord,
  context: { now: Date },
): PersistObservationResult {
  assertRecoverySchema(database);
  database.exec('BEGIN IMMEDIATE');
  try {
    const episode = requireEpisode(database, evidence.episodeId);
    assertNotFuture(evidence.observedAt, context.now, 'safety evidence observedAt');
    if (evidence.status !== 'UNKNOWN') {
      throw new RecoveryWatcherError(
        'rw0_v1 can persist UNKNOWN-only holder/bundle/creator/token-rights/liquidity evidence. PASS and FAIL are rejected until a later safety slice implements a reducer.',
        { code: 'safe_paper_not_implemented' },
      );
    }
    const before = {
      holderStatus: episode.holderStatus,
      bundleStatus: episode.bundleStatus,
      creatorStatus: episode.creatorStatus,
      completenessGate: episode.completenessGate,
    };
    const existing = findSafetyEvidenceByInstant(database, evidence.episodeId, evidence.kind, evidence.observedAt);
    if (existing.length > 0) {
      if (existing.some((row) => !safetyEvidenceMatches(row, evidence))) {
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
        `INSERT INTO rw0_safety_evidence (
          episode_id, kind, status, observed_at, provider, provenance, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        evidence.episodeId,
        evidence.kind,
        evidence.status,
        evidence.observedAt,
        evidence.provider,
        evidence.provenance,
        evidence.notes,
      );
    const after = requireEpisode(database, evidence.episodeId);
    if (
      after.holderStatus !== before.holderStatus ||
      after.bundleStatus !== before.bundleStatus ||
      after.creatorStatus !== before.creatorStatus ||
      after.completenessGate !== before.completenessGate
    ) {
      throw new RecoveryWatcherError('Safety evidence must not change episode gate status.', {
        code: 'evidence_invalid',
      });
    }
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
    .run(episode.episodeId, episode.state, episode.createdAt, 'episode_created', episode.lastTransitionEventId);
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
      return parseUtcInstant(left.createdAt, 'created_at') - parseUtcInstant(right.createdAt, 'created_at');
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
    throw new RecoveryWatcherError('Evidence episode does not exist.', { code: 'evidence_invalid' });
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
  if (request.recoveryConfirmedAt !== undefined && !isSameUtcInstant(request.recoveryConfirmedAt, confirmedAt)) {
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
    throw new RecoveryWatcherError('Persisted confirmation observation mint must match the episode mint.', {
      code: 'evidence_invalid',
    });
  }
  if (observation.pairAddress !== episode.pairAddress) {
    throw new RecoveryWatcherError('Persisted confirmation observation pair must match the pinned episode pair.', {
      code: 'evidence_invalid',
    });
  }
  if (
    observation.signalVersion !== episode.signalVersion ||
    observation.signalFingerprint !== episode.signalFingerprint ||
    observation.watcherSpecVersion !== episode.watcherSpecVersion ||
    observation.watcherSpecFingerprint !== episode.watcherSpecFingerprint
  ) {
    throw new RecoveryWatcherError('Persisted confirmation observation fingerprints must match the episode.', {
      code: 'evidence_invalid',
    });
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

function assertCallerNumberAgrees(label: string, supplied: number | undefined, stored: number): void {
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
      `SELECT status, observed_at, provider, provenance, notes
       FROM rw0_safety_evidence
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
    throw new RecoveryWatcherError('market observation priceChange5mPct must be finite when present.', {
      code: 'evidence_invalid',
    });
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

function marketObservationMatches(row: Record<string, SQLOutputValue>, observation: MarketObservationRecord): boolean {
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

function shadowExitMatches(row: Record<string, SQLOutputValue>, observation: ShadowExitObservationRecord): boolean {
  return (
    asNullableNumber(row['observed_price_usd']) === observation.observedPriceUsd &&
    asNullableNumber(row['threshold_price_usd']) === observation.thresholdPriceUsd &&
    asNullableNumber(row['overshoot_pct']) === observation.overshootPct &&
    requireFinite(row['gap_flag']) === (observation.gapFlag ? 1 : 0) &&
    requireString(row['action']) === observation.action
  );
}

function safetyEvidenceMatches(row: Record<string, SQLOutputValue>, evidence: SafetyEvidenceRecord): boolean {
  return (
    requireString(row['status']) === evidence.status &&
    asNullableString(row['provider']) === evidence.provider &&
    asNullableString(row['provenance']) === evidence.provenance &&
    asNullableString(row['notes']) === evidence.notes
  );
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
    recoveryConfirmationVolumeToLiquidity5m: asNullableNumber(row['recovery_confirmation_volume_to_liquidity_5m']),
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
