import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import {
  ACTIVE_RECOVERY_EPISODE_STATES,
  RECOVERY_EPISODE_STATES,
  RECOVERY_V0_SIGNAL_VERSION,
  RW0_COOLDOWN_MS,
  RW0_COST_MODEL,
  RW0_EPISODE_WINDOW_MS,
  RW0_EXECUTION_MODEL,
  RW0_EXIT_SPEC_VERSION,
  RW0_MAX_CONCURRENT_WATCHES,
  RW0_MAX_EPISODES_PER_MINT_PER_24H,
  RW0_SHADOW_PAPER_SPEC_VERSION,
  RW0_SPEC_VERSION,
  RW0_WATCH_SLOT_STATES,
  RW0_WATCH_TTL_MS,
  SHADOW_EXIT_ACTIONS,
  TERMINAL_BEFORE_COOLDOWN_STATES,
} from './constants.js';
import {
  addMs,
  assertNotFuture,
  assertSameInstant,
  assertStrictlyLater,
  assertTimestampOrder,
  isSameUtcInstant,
  parseUtcInstant,
  watchExpiresAtMs,
} from './clock.js';
import { RecoveryWatcherError } from './errors.js';
import {
  fingerprintTransitionEvent,
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_EXIT_FINGERPRINT,
  RW0_SHADOW_PAPER_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
  recoveryEpisodeId,
  transitionRequestPayload,
} from './identity.js';
import { evaluateRecoveryConfirmation, evaluateRecoveryV0DipFilters } from './signal.js';
import type {
  CreateEpisodeInput,
  RecoveryEpisode,
  RecoveryEpisodeState,
  SafetyGateStatus,
  ShadowExitAction,
  TransitionContext,
  TransitionRequest,
  TransitionResult,
} from './types.js';

const LEGAL_TRANSITIONS: Record<RecoveryEpisodeState, readonly RecoveryEpisodeState[]> = {
  DISCOVERED: [
    'DIP_CANDIDATE',
    'REJECTED_FILTER',
    'REJECTED_INCOMPLETE',
    'REJECTED_CAP',
    'CENSORED_UNAVAILABLE',
  ],
  DIP_CANDIDATE: [
    'RECOVERY_WATCH',
    'REJECTED_CAP',
    'REJECTED_INCOMPLETE',
    'REJECTED_FILTER',
    'CENSORED_UNAVAILABLE',
  ],
  RECOVERY_WATCH: [
    'SIGNAL_PENDING_SAFETY',
    'EXPIRED',
    'CENSORED_UNAVAILABLE',
    'REJECTED_INCOMPLETE',
    'REJECTED_FILTER',
  ],
  SIGNAL_PENDING_SAFETY: [
    'SHADOW_RESEARCH_OPEN',
    'REJECTED_SAFETY',
    'REJECTED_SAFETY_UNKNOWN',
    'CENSORED_UNAVAILABLE',
  ],
  SHADOW_RESEARCH_OPEN: ['CENSORED_UNAVAILABLE'],
  PAPER_ELIGIBLE: [
    'PAPER_OPEN',
    'CENSORED_UNAVAILABLE',
    'REJECTED_SAFETY',
    'REJECTED_SAFETY_UNKNOWN',
  ],
  PAPER_OPEN: ['CLOSED', 'CENSORED_UNAVAILABLE'],
  CLOSED: ['COOLDOWN'],
  EXPIRED: ['COOLDOWN'],
  REJECTED_FILTER: ['COOLDOWN'],
  REJECTED_INCOMPLETE: ['COOLDOWN'],
  REJECTED_SAFETY: ['COOLDOWN'],
  REJECTED_SAFETY_UNKNOWN: ['COOLDOWN'],
  REJECTED_CAP: ['COOLDOWN'],
  CENSORED_UNAVAILABLE: ['COOLDOWN'],
  COOLDOWN: [],
};

export function isRecoveryEpisodeState(value: string): value is RecoveryEpisodeState {
  return (RECOVERY_EPISODE_STATES as readonly string[]).includes(value);
}

export function isWatchSlotState(state: RecoveryEpisodeState): boolean {
  return (RW0_WATCH_SLOT_STATES as readonly string[]).includes(state);
}

export function isActiveRecoveryEpisode(episode: RecoveryEpisode): boolean {
  return (ACTIVE_RECOVERY_EPISODE_STATES as readonly string[]).includes(episode.state);
}

export function isCensoredNotWinLoss(state: RecoveryEpisodeState): boolean {
  return state === 'CENSORED_UNAVAILABLE';
}

export function isShadowResearch(episode: RecoveryEpisode): boolean {
  return episode.track === 'shadow' || episode.state === 'SHADOW_RESEARCH_OPEN';
}

export function isSafetyApprovedPaper(episode: RecoveryEpisode): boolean {
  return (
    episode.track === 'safety_approved' ||
    episode.state === 'PAPER_ELIGIBLE' ||
    episode.state === 'PAPER_OPEN'
  );
}

export function isShadowExitAction(value: string): value is ShadowExitAction {
  return (SHADOW_EXIT_ACTIONS as readonly string[]).includes(value);
}

export function createEpisode(input: CreateEpisodeInput, context: { now: Date }): RecoveryEpisode {
  assertMint(input.mint);
  assertPair(input.pairAddress);
  assertNotFuture(input.dipObservedAt, context.now, 'dip_observed_at');
  assertNotFuture(input.createdAt, context.now, 'created_at');
  assertTimestampOrder(
    input.dipObservedAt,
    input.createdAt,
    'created_at must be at or after dip_observed_at.',
  );

  const episodeId = recoveryEpisodeId({
    mint: input.mint,
    pairAddress: input.pairAddress,
    dipObservedAt: input.dipObservedAt,
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
  });
  const lastTransitionEventId = fingerprintTransitionEvent({
    episodeId,
    fromState: null,
    toState: 'DISCOVERED',
    at: input.createdAt,
    reason: 'episode_created',
    payload: transitionRequestPayload({}),
  });

  return {
    episodeId,
    mint: input.mint,
    pairAddress: input.pairAddress,
    dipObservedAt: input.dipObservedAt,
    signalVersion: RECOVERY_V0_SIGNAL_VERSION,
    signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
    watcherSpecVersion: RW0_SPEC_VERSION,
    watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
    shadowPaperSpecVersion: RW0_SHADOW_PAPER_SPEC_VERSION,
    shadowPaperFingerprint: RW0_SHADOW_PAPER_FINGERPRINT,
    exitSpecVersion: RW0_EXIT_SPEC_VERSION,
    exitFingerprint: RW0_EXIT_FINGERPRINT,
    state: 'DISCOVERED',
    track: 'none',
    safetyIncomplete: true,
    completenessGate: 'NOT_EVALUATED',
    holderStatus: 'UNKNOWN',
    bundleStatus: 'UNKNOWN',
    creatorStatus: 'UNKNOWN',
    costModel: RW0_COST_MODEL,
    executionModel: RW0_EXECUTION_MODEL,
    dipPriceUsd: input.dipPriceUsd ?? null,
    dipLiquidityUsd: input.dipLiquidityUsd ?? null,
    dipVolume5mUsd: input.dipVolume5mUsd ?? null,
    dipPriceChange5mPct: input.dipPriceChange5mPct ?? null,
    dipVolumeToLiquidity5m: input.dipVolumeToLiquidity5m ?? null,
    recoveryConfirmedAt: null,
    recoveryConfirmationPriceUsd: null,
    recoveryConfirmationLiquidityUsd: null,
    recoveryConfirmationVolume5mUsd: null,
    recoveryConfirmationVolumeToLiquidity5m: null,
    watchStartedAt: null,
    lastTransitionEventId,
    lastFromState: null,
    safetyCompletedAt: null,
    shadowEntryAt: null,
    shadowEntryPriceUsd: null,
    safeEntryAt: null,
    safeEntryPriceUsd: null,
    safeEntryObservationCollectedAt: null,
    closedAt: null,
    closePriceUsd: null,
    closeReason: null,
    closeObservationCollectedAt: null,
    cooldownUntil: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
  };
}

export function assertCanCreateEpisode(input: {
  mint: string;
  existing: readonly RecoveryEpisode[];
  now: Date;
}): void {
  const active = input.existing.find(
    (episode) => episode.mint === input.mint && isActiveRecoveryEpisode(episode),
  );
  if (active !== undefined) {
    throw new RecoveryWatcherError('Only one active recovery episode is allowed per mint.', {
      code: 'active_episode_exists',
    });
  }

  const latest = latestEpisode(input.existing.filter((episode) => episode.mint === input.mint));
  if (latest?.cooldownUntil !== null && latest !== undefined) {
    const cooldownUntil = parseUtcInstant(latest.cooldownUntil, 'cooldown_until');
    if (input.now.getTime() < cooldownUntil) {
      throw new RecoveryWatcherError(
        'Mint is in recovery cooldown. A later new dip may start a new episode after cooldown.',
        {
          code: 'mint_in_cooldown',
        },
      );
    }
  }

  const windowStart = input.now.getTime() - RW0_EPISODE_WINDOW_MS;
  const recent = input.existing.filter((episode) => {
    if (episode.mint !== input.mint) {
      return false;
    }
    return parseUtcInstant(episode.dipObservedAt, 'dip_observed_at') >= windowStart;
  });
  if (recent.length >= RW0_MAX_EPISODES_PER_MINT_PER_24H) {
    throw new RecoveryWatcherError(
      'Mint exceeded the maximum of 3 recovery episodes per 24 hours.',
      {
        code: 'episode_day_cap',
      },
    );
  }
}

export function applyTransition(
  episode: RecoveryEpisode,
  request: TransitionRequest,
  context: TransitionContext,
): TransitionResult {
  if (request.to === 'REJECTED_SAFETY' || request.to === 'REJECTED_SAFETY_UNKNOWN') {
    throw new RecoveryWatcherError(
      'Safety rejection transitions are reserved for the persisted safety-decision reducer.',
      { code: 'illegal_transition' },
    );
  }
  return applyTransitionWithPersistedSafety(episode, request, context);
}

/**
 * Internal persistence boundary. This is intentionally not re-exported from
 * the Recovery Watcher public API; generic transition callers cannot invoke a
 * safety decision.
 */
export function applyPersistedSafetyRejectionInternal(
  episode: RecoveryEpisode,
  request: TransitionRequest,
  context: TransitionContext,
  persistedStatuses: readonly SafetyGateStatus[],
): TransitionResult {
  if (request.to !== 'REJECTED_SAFETY' && request.to !== 'REJECTED_SAFETY_UNKNOWN') {
    throw new RecoveryWatcherError(
      'Persisted safety reducer may only produce a safety rejection.',
      {
        code: 'illegal_transition',
      },
    );
  }
  return applyTransitionWithPersistedSafety(episode, request, context, persistedStatuses);
}

function applyTransitionWithPersistedSafety(
  episode: RecoveryEpisode,
  request: TransitionRequest,
  context: TransitionContext,
  persistedStatuses?: readonly SafetyGateStatus[],
): TransitionResult {
  assertNestedRequestTimestamps(request, context.now);
  assertNotFuture(request.at, context.now, 'transition.at');
  assertTimestampOrder(
    episode.updatedAt,
    request.at,
    'transition.at must be at or after the previous episode timestamp.',
  );
  assertTimestampOrder(
    episode.createdAt,
    request.at,
    'transition.at must be at or after created_at.',
  );
  assertNoSynthesizedSafetyStatuses(request);

  if (
    request.to === 'PAPER_ELIGIBLE' ||
    request.to === 'PAPER_OPEN' ||
    episode.state === 'PAPER_ELIGIBLE' ||
    episode.state === 'PAPER_OPEN'
  ) {
    throw new RecoveryWatcherError(
      'Safe paper is not implemented in rw0_v1. Holder, bundle, creator, token-rights completeness and liquidity/execution safety are UNKNOWN. SHADOW_RESEARCH_OPEN is the only simulation path.',
      { code: 'safe_paper_not_implemented' },
    );
  }
  if (request.to === 'CLOSED' || episode.state === 'CLOSED') {
    throw new RecoveryWatcherError(
      'Shadow exit execution is not implemented in rw0_v1. SHADOW_RESEARCH_OPEN cannot CLOSED until a dedicated shadow-exit slice records threshold, overshoot, and gap from a persisted market observation.',
      { code: 'close_not_implemented' },
    );
  }

  const eventId = fingerprintTransitionEvent({
    episodeId: episode.episodeId,
    fromState: episode.state === request.to ? episode.lastFromState : episode.state,
    toState: request.to,
    at: request.at,
    reason: request.reason,
    payload: transitionRequestPayload(request),
  });

  if (episode.state === request.to) {
    if (eventId !== episode.lastTransitionEventId) {
      throw new RecoveryWatcherError(
        'Transition target matches the current state but the event identity differs. Exact retries may no-op; conflicting payloads fail closed.',
        { code: 'transition_conflict' },
      );
    }
    return {
      episode,
      fromState: episode.state,
      toState: request.to,
      at: request.at,
      reason: request.reason,
      eventId,
      idempotent: true,
    };
  }

  const allowed = LEGAL_TRANSITIONS[episode.state];
  if (!allowed.includes(request.to)) {
    throw new RecoveryWatcherError(
      `Illegal recovery episode transition ${episode.state} -> ${request.to}.`,
      {
        code: 'illegal_transition',
      },
    );
  }

  const next: RecoveryEpisode = {
    ...episode,
    state: request.to,
    updatedAt: request.at,
    lastFromState: episode.state,
    lastTransitionEventId: eventId,
  };

  applyDipAdmissionRules(episode, next, request, context);
  applyWatchTtlRules(episode, request);
  applyRecoveryConfirmationRules(episode, next, request);
  applyShadowRules(episode, next, request);
  applySafetyRejectRules(request, persistedStatuses);
  applyTerminalCooldown(next, request.at);

  if (next.completenessGate === 'PASS') {
    throw new RecoveryWatcherError('rw0_v1 must not set completenessGate PASS.', {
      code: 'safe_paper_not_implemented',
    });
  }
  if (isShadowResearch(next) && isSafetyApprovedPaper(next) && next.state !== 'CLOSED') {
    throw new RecoveryWatcherError(
      'SHADOW_RESEARCH must never be confused with PAPER_ELIGIBLE or PAPER_OPEN.',
      {
        code: 'shadow_paper_confusion',
      },
    );
  }

  return {
    episode: next,
    fromState: episode.state,
    toState: request.to,
    at: request.at,
    reason: request.reason,
    eventId,
    idempotent: false,
  };
}

export function legalTransitionsFrom(state: RecoveryEpisodeState): readonly RecoveryEpisodeState[] {
  return LEGAL_TRANSITIONS[state];
}

function applyDipAdmissionRules(
  previous: RecoveryEpisode,
  next: RecoveryEpisode,
  request: TransitionRequest,
  context: TransitionContext,
): void {
  const filters = evaluateRecoveryV0DipFilters({
    observedPriceUsd: next.dipPriceUsd,
    priceChange5mPct: next.dipPriceChange5mPct,
    volume5mUsd: next.dipVolume5mUsd,
    liquidityUsd: next.dipLiquidityUsd,
    volumeToLiquidity5m: next.dipVolumeToLiquidity5m,
  });

  if (request.to === 'DIP_CANDIDATE') {
    if (filters.kind !== 'pass') {
      throw new RecoveryWatcherError(`Cannot enter DIP_CANDIDATE: ${filters.reason}.`, {
        code: filters.kind === 'reject_incomplete' ? 'safety_incomplete' : 'illegal_transition',
      });
    }
  }

  if (request.to === 'REJECTED_INCOMPLETE' && previous.state === 'DISCOVERED') {
    if (filters.kind !== 'reject_incomplete' && filters.kind !== 'reject_invalid') {
      throw new RecoveryWatcherError(
        'REJECTED_INCOMPLETE requires missing or contradictory required dip fields.',
        {
          code: 'illegal_transition',
        },
      );
    }
  }

  if (request.to === 'REJECTED_FILTER' && previous.state === 'DISCOVERED') {
    if (filters.kind !== 'reject_filter') {
      throw new RecoveryWatcherError(
        'REJECTED_FILTER requires complete data that fails recovery_v0 dip bounds.',
        {
          code: 'illegal_transition',
        },
      );
    }
  }

  if (request.to === 'RECOVERY_WATCH') {
    const concurrent = context.concurrentWatchCount;
    if (concurrent === undefined) {
      throw new RecoveryWatcherError(
        'RECOVERY_WATCH requires concurrentWatchCount from the recovery database.',
        {
          code: 'configuration',
        },
      );
    }
    if (concurrent >= RW0_MAX_CONCURRENT_WATCHES) {
      throw new RecoveryWatcherError('High-resolution watch slot cap is 10.', {
        code: 'watch_cap',
      });
    }
    next.watchStartedAt = request.at;
  }
}

function applyWatchTtlRules(previous: RecoveryEpisode, request: TransitionRequest): void {
  if (request.to !== 'EXPIRED') {
    return;
  }
  if (previous.state !== 'RECOVERY_WATCH' || previous.watchStartedAt === null) {
    throw new RecoveryWatcherError(
      'EXPIRED is only legal from RECOVERY_WATCH after the 2h entry-watch TTL.',
      {
        code: 'watch_ttl_not_elapsed',
      },
    );
  }
  const eligibleAt =
    parseUtcInstant(previous.watchStartedAt, 'watch_started_at') + RW0_WATCH_TTL_MS;
  if (parseUtcInstant(request.at, 'transition.at') < eligibleAt) {
    throw new RecoveryWatcherError(
      'RECOVERY_WATCH cannot EXPIRED before watchStartedAt + RW0_WATCH_TTL_MS.',
      {
        code: 'watch_ttl_not_elapsed',
      },
    );
  }
}

function applyRecoveryConfirmationRules(
  previous: RecoveryEpisode,
  next: RecoveryEpisode,
  request: TransitionRequest,
): void {
  if (request.to !== 'SIGNAL_PENDING_SAFETY') {
    return;
  }
  if (previous.state !== 'RECOVERY_WATCH' || previous.watchStartedAt === null) {
    throw new RecoveryWatcherError(
      'SIGNAL_PENDING_SAFETY requires RECOVERY_WATCH with a frozen watchStartedAt.',
      { code: 'illegal_transition' },
    );
  }
  const confirmedAt = request.recoveryConfirmedAt;
  const confirmedPrice = request.recoveryConfirmationPriceUsd;
  const confirmedLiquidity = request.recoveryConfirmationLiquidityUsd;
  const confirmedVolume = request.recoveryConfirmationVolume5mUsd;
  if (
    confirmedAt === undefined ||
    confirmedPrice === undefined ||
    confirmedLiquidity === undefined ||
    confirmedVolume === undefined
  ) {
    throw new RecoveryWatcherError(
      'SIGNAL_PENDING_SAFETY requires recovery confirmation time, price, liquidity, and 5m volume.',
      { code: 'illegal_transition' },
    );
  }
  assertSameInstant(
    request.at,
    confirmedAt,
    'SIGNAL_PENDING_SAFETY requires request.at to equal recoveryConfirmedAt.',
  );
  assertStrictlyLater(
    next.dipObservedAt,
    confirmedAt,
    'Recovery confirmation must be strictly later than the dip. No future information and no trough backfill.',
  );
  if (
    parseUtcInstant(confirmedAt, 'recoveryConfirmedAt') >=
    watchExpiresAtMs(previous.watchStartedAt, RW0_WATCH_TTL_MS)
  ) {
    throw new RecoveryWatcherError(
      'Recovery confirmation is not legal at or after watchStartedAt + RW0_WATCH_TTL_MS. Exact TTL boundary belongs to EXPIRED.',
      { code: 'confirmation_after_watch_ttl' },
    );
  }
  const observationPairAddress = request.observationPairAddress ?? next.pairAddress;
  const confirmation = evaluateRecoveryConfirmation({
    dipPairAddress: next.pairAddress,
    dipPriceUsd: next.dipPriceUsd,
    dipObservedAt: next.dipObservedAt,
    watchStartedAt: previous.watchStartedAt,
    observationPairAddress,
    observationPriceUsd: confirmedPrice,
    observationCollectedAt: confirmedAt,
    observationLiquidityUsd: confirmedLiquidity,
    observationVolume5mUsd: confirmedVolume,
    ...(request.recoveryConfirmationVolumeToLiquidity5m === undefined
      ? {}
      : { observationVolumeToLiquidity5m: request.recoveryConfirmationVolumeToLiquidity5m }),
  });
  if (confirmation.kind !== 'confirmed') {
    throw new RecoveryWatcherError(
      `SIGNAL_PENDING_SAFETY requires a later same-pair recovery confirmation with liquidity and V/L gates: ${confirmation.reason}.`,
      { code: 'illegal_transition' },
    );
  }
  next.recoveryConfirmedAt = confirmedAt;
  next.recoveryConfirmationPriceUsd = confirmedPrice;
  next.recoveryConfirmationLiquidityUsd = confirmedLiquidity;
  next.recoveryConfirmationVolume5mUsd = confirmedVolume;
  next.recoveryConfirmationVolumeToLiquidity5m = confirmation.volumeToLiquidity5m;
}

function applyShadowRules(
  _previous: RecoveryEpisode,
  next: RecoveryEpisode,
  request: TransitionRequest,
): void {
  if (request.to !== 'SHADOW_RESEARCH_OPEN') {
    return;
  }
  if (next.recoveryConfirmedAt === null || next.recoveryConfirmationPriceUsd === null) {
    throw new RecoveryWatcherError('SHADOW_RESEARCH_OPEN requires a prior recovery confirmation.', {
      code: 'illegal_transition',
    });
  }
  const entryAt = request.shadowEntryAt ?? next.recoveryConfirmedAt;
  const entryPrice = request.shadowEntryPriceUsd ?? next.recoveryConfirmationPriceUsd;
  if (
    !isSameUtcInstant(entryAt, next.recoveryConfirmedAt) ||
    entryPrice !== next.recoveryConfirmationPriceUsd
  ) {
    throw new RecoveryWatcherError(
      'SHADOW_RESEARCH entry must be the recovery confirmation observation. This track is explicitly unsafe.',
      { code: 'illegal_transition' },
    );
  }
  next.track = 'shadow';
  next.safetyIncomplete = true;
  next.completenessGate = 'FAIL';
  next.shadowEntryAt = entryAt;
  next.shadowEntryPriceUsd = entryPrice;
}

function applySafetyRejectRules(
  request: TransitionRequest,
  persistedStatuses?: readonly SafetyGateStatus[],
): void {
  if (request.to !== 'REJECTED_SAFETY' && request.to !== 'REJECTED_SAFETY_UNKNOWN') {
    return;
  }
  if (persistedStatuses === undefined || persistedStatuses.length !== 4) {
    throw new RecoveryWatcherError(
      'Safety rejection requires four canonical statuses from persisted evidence.',
      { code: 'illegal_transition' },
    );
  }
  const hasFail = persistedStatuses.some((status) => status === 'FAIL');
  const expected = hasFail ? 'REJECTED_SAFETY' : 'REJECTED_SAFETY_UNKNOWN';
  if (request.to !== expected) {
    throw new RecoveryWatcherError(
      `Persisted safety statuses require ${expected}.`,
      { code: 'illegal_transition' },
    );
  }
}

function applyTerminalCooldown(next: RecoveryEpisode, at: string): void {
  if (
    (TERMINAL_BEFORE_COOLDOWN_STATES as readonly string[]).includes(next.state) &&
    next.cooldownUntil === null
  ) {
    next.cooldownUntil = addMs(at, RW0_COOLDOWN_MS);
  }
  if (next.state === 'COOLDOWN' && next.cooldownUntil === null) {
    next.cooldownUntil = addMs(at, RW0_COOLDOWN_MS);
  }
}

function assertNestedRequestTimestamps(request: TransitionRequest, now: Date): void {
  const fields: Array<[string | undefined, string]> = [
    [request.recoveryConfirmedAt, 'recoveryConfirmedAt'],
    [request.safetyCompletedAt, 'safetyCompletedAt'],
    [request.shadowEntryAt, 'shadowEntryAt'],
    [request.safeEntryAt, 'safeEntryAt'],
    [request.safeEntryObservationCollectedAt, 'safeEntryObservationCollectedAt'],
    [request.closeEvidence?.observedAt, 'closeEvidence.observedAt'],
    [request.closeEvidence?.observationCollectedAt, 'closeEvidence.observationCollectedAt'],
  ];
  for (const [value, label] of fields) {
    if (value === undefined) {
      continue;
    }
    assertNotFuture(value, now, label);
    assertTimestampOrder(value, request.at, `${label} must be at or before transition.at.`);
  }
  if (request.safeEntryObservationCollectedAt !== undefined && request.safeEntryAt !== undefined) {
    assertTimestampOrder(
      request.safeEntryObservationCollectedAt,
      request.safeEntryAt,
      'safeEntryObservationCollectedAt must be at or before safeEntryAt.',
    );
  }
  if (request.closeEvidence !== undefined) {
    assertSameInstant(
      request.closeEvidence.observedAt,
      request.closeEvidence.observationCollectedAt,
      'closeEvidence.observedAt and observationCollectedAt must identify the same market observation instant.',
    );
  }
}

function assertNoSynthesizedSafetyStatuses(request: TransitionRequest): void {
  const statuses = [request.holderStatus, request.bundleStatus, request.creatorStatus];
  for (const status of statuses) {
    if (status === undefined) {
      continue;
    }
    if (status === 'PASS') {
      throw new RecoveryWatcherError(
        'rw0_v1 cannot synthesize PASS safety statuses. Safe paper is not implemented.',
        { code: 'safe_paper_not_implemented' },
      );
    }
    if (status !== 'UNKNOWN') {
      throw new RecoveryWatcherError(
        'rw0_v1 cannot synthesize safety gate status changes. Statuses remain UNKNOWN until a later spec implements real evidence.',
        { code: 'safe_paper_not_implemented' },
      );
    }
  }
}

function latestEpisode(episodes: readonly RecoveryEpisode[]): RecoveryEpisode | undefined {
  if (episodes.length === 0) {
    return undefined;
  }
  return [...episodes].sort((left, right) => {
    const byDip =
      parseUtcInstant(right.dipObservedAt, 'dip_observed_at') -
      parseUtcInstant(left.dipObservedAt, 'dip_observed_at');
    if (byDip !== 0) {
      return byDip;
    }
    return (
      parseUtcInstant(right.updatedAt, 'updated_at') - parseUtcInstant(left.updatedAt, 'updated_at')
    );
  })[0];
}

function assertMint(mint: string): void {
  if (!isPlausibleSolanaMint(mint)) {
    throw new RecoveryWatcherError('Episode mint must be a plausible Solana token mint.', {
      code: 'invalid_mint',
    });
  }
}

function assertPair(pairAddress: string): void {
  if (!isPlausibleSolanaMint(pairAddress)) {
    throw new RecoveryWatcherError('Episode pair address must be a plausible Solana address.', {
      code: 'invalid_pair',
    });
  }
}

export function combinedSafetyStatus(input: {
  holderStatus: SafetyGateStatus;
  bundleStatus: SafetyGateStatus;
  creatorStatus: SafetyGateStatus;
}): SafetyGateStatus {
  const statuses = [input.holderStatus, input.bundleStatus, input.creatorStatus];
  if (statuses.some((status) => status === 'FAIL')) {
    return 'FAIL';
  }
  if (statuses.some((status) => status === 'UNKNOWN')) {
    return 'UNKNOWN';
  }
  return 'PASS';
}
