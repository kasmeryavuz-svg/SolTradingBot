import { describe, expect, it } from 'vitest';
import { recoveryEpisodeId, RECOVERY_V0_SIGNAL_FINGERPRINT } from '../src/recovery-watcher/identity.js';
import {
  applyTransition,
  assertCanCreateEpisode,
  combinedSafetyStatus,
  createEpisode,
  isActiveRecoveryEpisode,
  isCensoredNotWinLoss,
  isSafetyApprovedPaper,
  isShadowResearch,
  legalTransitionsFrom,
} from '../src/recovery-watcher/state.js';
import {
  createDiscoveredEpisode,
  discoveredEpisodeInput,
  FIXTURE_CONFIRM_1MS_AFTER_EXPIRY,
  FIXTURE_CONFIRM_1MS_BEFORE_EXPIRY,
  FIXTURE_CONFIRM_AT,
  FIXTURE_DIP_AT,
  FIXTURE_DIP_STEP_AT,
  FIXTURE_FIVE_HOURS_LATER,
  FIXTURE_LATE_NOW,
  FIXTURE_MINT,
  FIXTURE_NOW,
  FIXTURE_PAIR,
  FIXTURE_TTL_ELIGIBLE_AT,
  FIXTURE_TTL_NOW,
  FIXTURE_WATCH_AT,
  passingConfirmationFields,
  passingDipFields,
  stepEpisode,
  takeProfitCloseEvidence,
  toDipCandidate,
  toShadow,
  toSignalPending,
  toWatch,
} from './recovery-watcher-fixtures.js';

describe('recovery episode state machine', () => {
  it('creates DISCOVERED episodes with stable identity and UNKNOWN safety', () => {
    const created = createDiscoveredEpisode();
    expect(created.state).toBe('DISCOVERED');
    expect(created.episodeId).toBe(
      recoveryEpisodeId({
        mint: FIXTURE_MINT,
        pairAddress: FIXTURE_PAIR,
        dipObservedAt: FIXTURE_DIP_AT,
        signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
      }),
    );
    expect(created.holderStatus).toBe('UNKNOWN');
    expect(created.bundleStatus).toBe('UNKNOWN');
    expect(created.creatorStatus).toBe('UNKNOWN');
    expect(created.safetyIncomplete).toBe(true);
    expect(created.completenessGate).toBe('NOT_EVALUATED');
    expect(isActiveRecoveryEpisode(created)).toBe(true);
    expect(combinedSafetyStatus(created)).toBe('UNKNOWN');
  });

  it('is idempotent only for an exact retry of the same semantic event', () => {
    const created = createDiscoveredEpisode();
    const again = applyTransition(
      created,
      { to: 'DISCOVERED', at: FIXTURE_DIP_AT, reason: 'episode_created' },
      { now: FIXTURE_NOW },
    );
    expect(again.idempotent).toBe(true);
    expect(again.episode).toBe(created);
    expect(() =>
      applyTransition(
        created,
        { to: 'DISCOVERED', at: '2026-08-19T11:30:00.000Z', reason: 'duplicate' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/event identity differs/);
  });

  it('rejects illegal transitions and keeps PAPER unreachable', () => {
    expect(() =>
      applyTransition(
        createDiscoveredEpisode(),
        { to: 'PAPER_OPEN', at: '2026-08-19T11:01:00.000Z', reason: 'skip' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Safe paper is not implemented/);
    expect(() =>
      applyTransition(
        createDiscoveredEpisode(),
        { to: 'SHADOW_RESEARCH_OPEN', at: '2026-08-19T11:01:00.000Z', reason: 'skip' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Illegal recovery episode transition/);
  });

  it('enforces the rw0_v1 legal transition matrix', () => {
    expect(legalTransitionsFrom('COOLDOWN')).toEqual([]);
    expect(legalTransitionsFrom('SHADOW_RESEARCH_OPEN')).toEqual(['CENSORED_UNAVAILABLE']);
    expect(legalTransitionsFrom('SHADOW_RESEARCH_OPEN')).not.toContain('CLOSED');
    expect(legalTransitionsFrom('SHADOW_RESEARCH_OPEN')).not.toContain('EXPIRED');
    expect(legalTransitionsFrom('RECOVERY_WATCH')).toContain('EXPIRED');
    expect(legalTransitionsFrom('DISCOVERED')).not.toContain('EXPIRED');
    expect(legalTransitionsFrom('SIGNAL_PENDING_SAFETY')).toContain('SHADOW_RESEARCH_OPEN');
    expect(legalTransitionsFrom('SIGNAL_PENDING_SAFETY')).not.toContain('PAPER_ELIGIBLE');
    expect(legalTransitionsFrom('PAPER_OPEN')).not.toContain('EXPIRED');
  });

  it('admits a passing dip without confirmation-side liquidity/V/L and opens unsafe shadow research', () => {
    const pending = toSignalPending();
    expect(pending.recoveryConfirmationLiquidityUsd).toBe(10_000);
    expect(pending.recoveryConfirmationVolumeToLiquidity5m).toBe(1.5);
    expect(pending.watchStartedAt).toBe(FIXTURE_WATCH_AT);
    const shadow = toShadow();
    expect(shadow.state).toBe('SHADOW_RESEARCH_OPEN');
    expect(shadow.track).toBe('shadow');
    expect(shadow.safetyIncomplete).toBe(true);
    expect(shadow.completenessGate).toBe('FAIL');
    expect(shadow.shadowEntryAt).toBe(FIXTURE_CONFIRM_AT);
    expect(shadow.shadowEntryPriceUsd).toBe(1.2);
    expect(isShadowResearch(shadow)).toBe(true);
    expect(isSafetyApprovedPaper(shadow)).toBe(false);
  });

  it('fails closed when SIGNAL_PENDING_SAFETY tries to become PAPER_ELIGIBLE, including synthesized PASS', () => {
    const pending = toSignalPending();
    expect(pending.holderStatus).toBe('UNKNOWN');
    expect(() =>
      applyTransition(
        pending,
        {
          to: 'PAPER_ELIGIBLE',
          at: '2026-08-19T11:06:00.000Z',
          reason: 'should_fail',
          safetyCompletedAt: '2026-08-19T11:06:00.000Z',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Safe paper is not implemented/);
    expect(() =>
      applyTransition(
        pending,
        {
          to: 'PAPER_ELIGIBLE',
          at: '2026-08-19T11:10:00.000Z',
          reason: 'synthetic_pass',
          holderStatus: 'PASS',
          bundleStatus: 'PASS',
          creatorStatus: 'PASS',
          safetyCompletedAt: '2026-08-19T11:10:00.000Z',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Safe paper is not implemented/);
    expect(pending.completenessGate).not.toBe('PASS');
  });

  it('reserves both safety rejection transitions for the persisted reducer', () => {
    expect(() =>
      stepEpisode(toSignalPending(), {
        to: 'REJECTED_SAFETY_UNKNOWN',
        at: '2026-08-19T11:06:00.000Z',
        reason: 'holder_unknown',
      }),
    ).toThrow(/reserved for the persisted safety-decision reducer/);
    expect(() =>
      applyTransition(
        toSignalPending(
          createEpisode(
            discoveredEpisodeInput({ dipObservedAt: '2026-08-19T10:00:00.000Z', createdAt: '2026-08-19T10:00:00.000Z' }),
            { now: FIXTURE_NOW },
          ),
        ),
        {
          to: 'REJECTED_SAFETY',
          at: '2026-08-19T11:06:00.000Z',
          reason: 'holder_fail',
          holderStatus: 'FAIL',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/reserved for the persisted safety-decision reducer/);
  });

  it('treats censoring as not a win or loss', () => {
    const censored = stepEpisode(createDiscoveredEpisode(), {
      to: 'CENSORED_UNAVAILABLE',
      at: '2026-08-19T11:02:00.000Z',
      reason: 'pair_gone',
    });
    expect(isCensoredNotWinLoss(censored.state)).toBe(true);
    expect(censored.cooldownUntil).toBe('2026-08-19T13:02:00.000Z');
  });

  it('enforces one active episode per mint and the 3/24h cap', () => {
    const first = createDiscoveredEpisode();
    expect(() => {
      assertCanCreateEpisode({ mint: FIXTURE_MINT, existing: [first], now: FIXTURE_NOW });
    }).toThrow(/one active recovery episode/);
    const closed = stepEpisode(
      stepEpisode(first, { to: 'CENSORED_UNAVAILABLE', at: '2026-08-19T11:02:00.000Z', reason: 'gone' }),
      { to: 'COOLDOWN', at: '2026-08-19T13:02:00.000Z', reason: 'cooldown' },
      { now: new Date('2026-08-19T14:00:00.000Z') },
    );
    expect(() => {
      assertCanCreateEpisode({ mint: FIXTURE_MINT, existing: [closed], now: new Date('2026-08-19T14:00:00.000Z') });
    }).not.toThrow();

    const laterNow = new Date('2026-08-19T14:00:00.000Z');
    const day = [
      createEpisode(
        discoveredEpisodeInput({ dipObservedAt: '2026-08-19T09:00:00.000Z', createdAt: '2026-08-19T09:00:00.000Z' }),
        { now: laterNow },
      ),
      createEpisode(
        discoveredEpisodeInput({ dipObservedAt: '2026-08-19T10:00:00.000Z', createdAt: '2026-08-19T10:00:00.000Z' }),
        { now: laterNow },
      ),
      createEpisode(
        discoveredEpisodeInput({ dipObservedAt: '2026-08-19T11:00:00.000Z', createdAt: '2026-08-19T11:00:00.000Z' }),
        { now: laterNow },
      ),
    ].map((item, index) =>
      stepEpisode(
        item,
        {
          to: 'CENSORED_UNAVAILABLE',
          at: `2026-08-19T11:1${String(index)}:00.000Z`,
          reason: 'done',
        },
        { now: laterNow },
      ),
    );
    const cooled = day.map((item) =>
      stepEpisode(item, { to: 'COOLDOWN', at: '2026-08-19T13:20:00.000Z', reason: 'cool' }, { now: laterNow }),
    );
    expect(() => {
      assertCanCreateEpisode({ mint: FIXTURE_MINT, existing: cooled, now: new Date('2026-08-19T13:30:00.000Z') });
    }).toThrow(/3 recovery episodes per 24 hours/);
  });

  it('allows a later new dip after cooldown without permanently banning the mint', () => {
    const expired = stepEpisode(createDiscoveredEpisode(), {
      to: 'CENSORED_UNAVAILABLE',
      at: '2026-08-19T11:02:00.000Z',
      reason: 'gone',
    });
    expect(() => {
      assertCanCreateEpisode({ mint: FIXTURE_MINT, existing: [expired], now: new Date('2026-08-19T12:00:00.000Z') });
    }).toThrow(/cooldown/);
    const later = new Date('2026-08-19T14:00:00.000Z');
    expect(() => {
      assertCanCreateEpisode({ mint: FIXTURE_MINT, existing: [expired], now: later });
    }).not.toThrow();
    const next = createEpisode(
      discoveredEpisodeInput({
        dipObservedAt: '2026-08-19T13:30:00.000Z',
        createdAt: '2026-08-19T13:30:00.000Z',
      }),
      { now: later },
    );
    expect(next.episodeId).not.toBe(expired.episodeId);
    expect(next.state).toBe('DISCOVERED');
  });

  it('rejects future transition.at and nested timestamps that are future even when at is valid', () => {
    expect(() =>
      createEpisode(discoveredEpisodeInput({ dipObservedAt: '2026-08-19T13:00:00.000Z' }), { now: FIXTURE_NOW }),
    ).toThrow(/future/);
    const created = createDiscoveredEpisode();
    expect(() =>
      applyTransition(
        created,
        { to: 'CENSORED_UNAVAILABLE', at: '2026-08-18T10:00:00.000Z', reason: 'past' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/at or after the previous/);
    const watch = toWatch();
    expect(() =>
      applyTransition(
        watch,
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_CONFIRM_AT,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          recoveryConfirmedAt: '2026-08-19T12:30:00.000Z',
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/future|equal recoveryConfirmedAt/);
  });

  it('requires SIGNAL_PENDING_SAFETY at to equal recoveryConfirmedAt', () => {
    expect(() =>
      applyTransition(
        toWatch(),
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: '2026-08-19T11:06:00.000Z',
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/equal recoveryConfirmedAt/);
  });

  it('rejects DISCOVERED -> DIP_CANDIDATE when required dip data is missing', () => {
    const incomplete = createDiscoveredEpisode({
      dipPriceUsd: null,
      dipVolume5mUsd: null,
      dipPriceChange5mPct: null,
    });
    expect(() =>
      applyTransition(
        incomplete,
        { to: 'DIP_CANDIDATE', at: FIXTURE_DIP_STEP_AT, reason: 'nope' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/unavailable/);
    const rejected = stepEpisode(incomplete, {
      to: 'REJECTED_INCOMPLETE',
      at: FIXTURE_DIP_STEP_AT,
      reason: 'missing',
    });
    expect(rejected.state).toBe('REJECTED_INCOMPLETE');
  });

  it('rejects filter failures with complete dip data as REJECTED_FILTER', () => {
    const created = createDiscoveredEpisode({ ...passingDipFields(), dipPriceChange5mPct: -10 });
    const rejected = stepEpisode(created, {
      to: 'REJECTED_FILTER',
      at: FIXTURE_DIP_STEP_AT,
      reason: 'not_in_band',
    });
    expect(rejected.state).toBe('REJECTED_FILTER');
  });

  it('enforces the high-resolution watch slot cap including SHADOW_RESEARCH_OPEN', () => {
    const candidate = toDipCandidate();
    expect(() =>
      applyTransition(
        candidate,
        { to: 'RECOVERY_WATCH', at: FIXTURE_WATCH_AT, reason: 'full' },
        { now: FIXTURE_NOW, concurrentWatchCount: 10 },
      ),
    ).toThrow(/watch slot cap is 10/);
    const capped = stepEpisode(candidate, {
      to: 'REJECTED_CAP',
      at: FIXTURE_WATCH_AT,
      reason: 'watch_slots_full',
    });
    expect(capped.state).toBe('REJECTED_CAP');
  });

  it('sets watchStartedAt on RECOVERY_WATCH and refuses early EXPIRED', () => {
    const watch = toWatch();
    expect(watch.watchStartedAt).toBe(FIXTURE_WATCH_AT);
    expect(() =>
      applyTransition(
        watch,
        { to: 'EXPIRED', at: FIXTURE_CONFIRM_AT, reason: 'too_soon' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/cannot EXPIRED before watchStartedAt/);
    const expired = stepEpisode(
      watch,
      { to: 'EXPIRED', at: FIXTURE_TTL_ELIGIBLE_AT, reason: 'ttl' },
      { now: FIXTURE_TTL_NOW },
    );
    expect(expired.state).toBe('EXPIRED');
  });

  it('allows recovery confirmation 1 ms before TTL and forbids confirmation at or after expiry', () => {
    const pending = toSignalPending();
    expect(pending.state).toBe('SIGNAL_PENDING_SAFETY');
    const justBefore = stepEpisode(
      toWatch(),
      {
        to: 'SIGNAL_PENDING_SAFETY',
        at: FIXTURE_CONFIRM_1MS_BEFORE_EXPIRY,
        reason: 'recovery_confirmed',
        ...passingConfirmationFields(),
        recoveryConfirmedAt: FIXTURE_CONFIRM_1MS_BEFORE_EXPIRY,
      },
      { now: FIXTURE_LATE_NOW },
    );
    expect(justBefore.state).toBe('SIGNAL_PENDING_SAFETY');
    expect(() =>
      applyTransition(
        toWatch(),
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_TTL_ELIGIBLE_AT,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          recoveryConfirmedAt: FIXTURE_TTL_ELIGIBLE_AT,
        },
        { now: FIXTURE_LATE_NOW },
      ),
    ).toThrow(/Exact TTL boundary belongs to EXPIRED/);
    expect(() =>
      applyTransition(
        toWatch(),
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_CONFIRM_1MS_AFTER_EXPIRY,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          recoveryConfirmedAt: FIXTURE_CONFIRM_1MS_AFTER_EXPIRY,
        },
        { now: FIXTURE_LATE_NOW },
      ),
    ).toThrow(/Exact TTL boundary belongs to EXPIRED/);
    expect(() =>
      applyTransition(
        toWatch(),
        {
          to: 'SIGNAL_PENDING_SAFETY',
          at: FIXTURE_FIVE_HOURS_LATER,
          reason: 'recovery_confirmed',
          ...passingConfirmationFields(),
          recoveryConfirmedAt: FIXTURE_FIVE_HOURS_LATER,
        },
        { now: FIXTURE_LATE_NOW },
      ),
    ).toThrow(/Exact TTL boundary belongs to EXPIRED/);
    expect(legalTransitionsFrom('SHADOW_RESEARCH_OPEN')).not.toContain('EXPIRED');
    expect(() =>
      applyTransition(
        toShadow(),
        { to: 'EXPIRED', at: FIXTURE_TTL_ELIGIBLE_AT, reason: 'not_watch_ttl' },
        { now: FIXTURE_TTL_NOW },
      ),
    ).toThrow(/Illegal recovery episode transition/);
  });

  it('keeps CLOSED reserved but unreachable from SHADOW_RESEARCH_OPEN', () => {
    const shadow = toShadow();
    expect(() =>
      applyTransition(
        shadow,
        { to: 'CLOSED', at: '2026-08-19T11:30:00.000Z', reason: 'fake' },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Shadow exit execution is not implemented/);
    expect(() =>
      applyTransition(
        shadow,
        {
          to: 'CLOSED',
          at: '2026-08-19T11:30:00.000Z',
          reason: 'take_profit',
          closeEvidence: takeProfitCloseEvidence(),
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Shadow exit execution is not implemented/);
    expect(() =>
      applyTransition(
        shadow,
        {
          to: 'CLOSED',
          at: '2026-08-19T11:31:00.000Z',
          reason: 'unrelated_timestamps',
          closeEvidence: {
            ...takeProfitCloseEvidence(),
            observationCollectedAt: '2026-08-19T11:31:00.000Z',
          },
        },
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/same market observation instant/);
  });
});
