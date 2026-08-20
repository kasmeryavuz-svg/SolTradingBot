import { describe, expect, it } from 'vitest';
import { RW0_SAFETY_SPEC_VERSION } from '../src/recovery-watcher/constants.js';
import {
  RECOVERY_V0_SIGNAL_FINGERPRINT,
  RW0_SAFETY_SPEC_FINGERPRINT,
  RW0_WATCHER_DEFINITION_FINGERPRINT,
} from '../src/recovery-watcher/identity.js';
import {
  listEpisodesInState,
  listSafetyEvidence,
  loadRecoveryReportSnapshot,
  loadEpisode,
  persistCreatedEpisode,
  persistMarketObservation,
  persistSafetyDecision,
  persistSafetyEvidence,
  persistTransition,
} from '../src/recovery-watcher/persistence.js';
import {
  canonicalizeSafetyEvidence,
  evaluateSafetyPayload,
} from '../src/recovery-watcher/safety.js';
import type { HolderSafetyPayload, SafetyEvidencePayload } from '../src/recovery-watcher/types.js';
import { applyTransition } from '../src/recovery-watcher/state.js';
import {
  discoveredEpisodeInput,
  FIXTURE_CONFIRM_AT,
  FIXTURE_DIP_STEP_AT,
  FIXTURE_NOW,
  FIXTURE_WATCH_AT,
  openInitializedRecoveryDatabase,
} from './recovery-watcher-fixtures.js';

const OWNER_A = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const OWNER_B = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB';
const ACCOUNT_A = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
const ACCOUNT_B = '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs';
const EVIDENCE_AT = '2026-08-19T11:06:00.000Z';
const DECISION_AT = '2026-08-19T11:07:00.000Z';

function pendingEpisode() {
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
    {
      episodeId: created.episodeId,
      mint: created.mint,
      pairAddress: created.pairAddress,
      collectedAt: FIXTURE_CONFIRM_AT,
      provider: 'fixture',
      source: 'unit_test',
      priceUsd: 1.2,
      liquidityUsd: 10_000,
      volume5mUsd: 15_000,
      priceChange5mPct: -20,
      signalVersion: created.signalVersion,
      signalFingerprint: RECOVERY_V0_SIGNAL_FINGERPRINT,
      watcherSpecVersion: created.watcherSpecVersion,
      watcherSpecFingerprint: RW0_WATCHER_DEFINITION_FINGERPRINT,
    },
    { now: FIXTURE_NOW },
  );
  persistTransition(
    database,
    created.episodeId,
    {
      to: 'SIGNAL_PENDING_SAFETY',
      at: FIXTURE_CONFIRM_AT,
      reason: 'recovery_confirmed',
      recoveryConfirmedAt: FIXTURE_CONFIRM_AT,
    },
    { now: FIXTURE_NOW },
  );
  const pending = loadEpisode(database, created.episodeId);
  if (pending === null) throw new Error('fixture episode missing');
  return { database, episode: pending };
}

function evidenceFor(
  episode: ReturnType<typeof pendingEpisode>['episode'],
  payload: SafetyEvidencePayload,
  overrides: Partial<Parameters<typeof canonicalizeSafetyEvidence>[0]> = {},
) {
  return canonicalizeSafetyEvidence(
    {
      episodeId: episode.episodeId,
      mint: episode.mint,
      pairAddress: episode.pairAddress,
      confirmationObservedAt: episode.recoveryConfirmedAt ?? '',
      confirmationEventId: episode.lastTransitionEventId,
      kind: payload.kind,
      observedAt: EVIDENCE_AT,
      collectedAt: EVIDENCE_AT,
      provider: 'fixture',
      provenance: 'local hostile test',
      signalVersion: episode.signalVersion,
      signalFingerprint: episode.signalFingerprint,
      watcherSpecVersion: episode.watcherSpecVersion,
      watcherSpecFingerprint: episode.watcherSpecFingerprint,
      safetySpecVersion: RW0_SAFETY_SPEC_VERSION,
      safetySpecFingerprint: RW0_SAFETY_SPEC_FINGERPRINT,
      payload,
      ...overrides,
    },
    FIXTURE_NOW,
  );
}

function holder(overrides: Partial<HolderSafetyPayload> = {}): HolderSafetyPayload {
  return {
    kind: 'holder',
    denominatorKind: 'effective_circulating_supply',
    totalSupplyRaw: '100',
    denominatorRaw: '100',
    supplyReconciled: true,
    ownerCoverageComplete: true,
    sourceIsTop20Only: false,
    accounts: [],
    ...overrides,
  };
}

describe('recovery watcher Slice 3A safety evidence', () => {
  it('never holder-PASSes top-20-only evidence', () => {
    const result = evaluateSafetyPayload(
      holder({
        sourceIsTop20Only: true,
        ownerCoverageComplete: false,
        accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '5', exclusion: null }],
      }),
    );
    expect(result.status).toBe('UNKNOWN');
  });

  it('aggregates by owner rather than token account and FAILs above 10%', () => {
    const result = evaluateSafetyPayload(
      holder({
        accounts: [
          { tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '6', exclusion: null },
          { tokenAccount: ACCOUNT_B, owner: OWNER_A, amountRaw: '6', exclusion: null },
        ],
      }),
    );
    expect(result.status).toBe('FAIL');
    expect(result.percentage).toBe(12);
  });

  it('requires explicit exclusion provenance and uses effective supply denominator', () => {
    expect(() =>
      evaluateSafetyPayload(
        holder({
          denominatorRaw: '90',
          accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '10', exclusion: null }],
        }),
      ),
    ).toThrow(/denominator must equal total supply minus balances with explicit/);
    const result = evaluateSafetyPayload(
      holder({
        denominatorRaw: '90',
        accounts: [
          {
            tokenAccount: ACCOUNT_A,
            owner: OWNER_A,
            amountRaw: '10',
            exclusion: {
              kind: 'pool',
              source: 'verified pool account registry',
              observedAt: EVIDENCE_AT,
              subjectAddress: ACCOUNT_A,
            },
          },
          { tokenAccount: ACCOUNT_B, owner: OWNER_B, amountRaw: '9', exclusion: null },
        ],
      }),
    );
    expect(result.status).toBe('PASS');
    expect(result.percentage).toBe(10);
  });

  it('FAILs complete holder evidence above 10% and leaves incomplete <=10% UNKNOWN', () => {
    expect(
      evaluateSafetyPayload(
        holder({
          accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '11', exclusion: null }],
        }),
      ).status,
    ).toBe('FAIL');
    expect(
      evaluateSafetyPayload(
        holder({
          ownerCoverageComplete: false,
          accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '10', exclusion: null }],
        }),
      ).status,
    ).toBe('UNKNOWN');
  });

  it('compares holder and linked-cluster hard gates with exact BigInt ratios', () => {
    expect(
      evaluateSafetyPayload(
        holder({
          totalSupplyRaw: '100000000',
          denominatorRaw: '100000000',
          accounts: [
            {
              tokenAccount: ACCOUNT_A,
              owner: OWNER_A,
              amountRaw: '10000001',
              exclusion: null,
            },
          ],
        }),
      ).status,
    ).toBe('FAIL');
    expect(
      evaluateSafetyPayload(
        holder({
          totalSupplyRaw: '100000000',
          denominatorRaw: '100000000',
          accounts: [
            {
              tokenAccount: ACCOUNT_A,
              owner: OWNER_A,
              amountRaw: '10000000',
              exclusion: null,
            },
          ],
        }),
      ).status,
    ).toBe('PASS');
    const bundle = {
      kind: 'bundle' as const,
      rule: 'complete fixture rule',
      denominatorKind: 'effective_circulating_supply' as const,
      denominatorRaw: '100000000',
      graphComplete: true,
      membershipComplete: true,
      confidence: 'high' as const,
      members: [{ owner: OWNER_A, amountRaw: '20000001', provenance: 'fixture' }],
    };
    expect(evaluateSafetyPayload(bundle).status).toBe('FAIL');
    expect(
      evaluateSafetyPayload({
        ...bundle,
        members: [{ owner: OWNER_A, amountRaw: '20000000', provenance: 'fixture' }],
      }).status,
    ).toBe('PASS');
  });

  it('FAILs a complete linked cluster above 20% and keeps an incomplete graph UNKNOWN', () => {
    const payload = {
      kind: 'bundle' as const,
      rule: 'persisted transfer-and-funding links; heuristic cluster is not ownership',
      denominatorKind: 'effective_circulating_supply' as const,
      denominatorRaw: '100',
      graphComplete: true,
      membershipComplete: true,
      confidence: 'high' as const,
      members: [{ owner: OWNER_A, amountRaw: '21', provenance: 'fixture edge set' }],
    };
    expect(evaluateSafetyPayload(payload).status).toBe('FAIL');
    expect(evaluateSafetyPayload({ ...payload, graphComplete: false }).status).toBe('UNKNOWN');
  });

  it('keeps missing creator identity UNKNOWN without guessing', () => {
    expect(
      evaluateSafetyPayload({
        kind: 'creator',
        creatorIdentity: null,
        identityProvenance: null,
        identityTrustworthy: false,
        controlledAccountsComplete: false,
        retainedControlCapabilities: [],
        controlledBalanceRaw: null,
        denominatorRaw: null,
      }).status,
    ).toBe('UNKNOWN');
  });

  it('FAILs dangerous token rights and keeps unsupported facts UNKNOWN', () => {
    expect(
      evaluateSafetyPayload({
        kind: 'token_rights',
        tokenProgram: 'spl_token',
        mintAuthority: OWNER_A,
        freezeAuthority: null,
        extensions: [],
        factsComplete: true,
      }).status,
    ).toBe('FAIL');
    expect(
      evaluateSafetyPayload({
        kind: 'token_rights',
        tokenProgram: 'unsupported',
        mintAuthority: null,
        freezeAuthority: null,
        extensions: [],
        factsComplete: false,
      }).status,
    ).toBe('UNKNOWN');
  });

  it('strictly validates runtime payload discriminants, enums, booleans, and provenance', () => {
    const { database, episode } = pendingEpisode();
    const tokenRights = {
      kind: 'token_rights' as const,
      tokenProgram: 'spl_token' as const,
      mintAuthority: null,
      freezeAuthority: null,
      extensions: [],
      factsComplete: true,
    };
    expect(() => evidenceFor(episode, tokenRights, { kind: 'holder' })).toThrow(
      /outer kind must match payload kind/,
    );
    const malformed = [
      { ...tokenRights, tokenProgram: 'unknown_program' },
      { ...tokenRights, factsComplete: 'true' },
      {
        ...holder(),
        supplyReconciled: 'true',
      },
      {
        ...holder(),
        accounts: [
          {
            tokenAccount: ACCOUNT_A,
            owner: OWNER_A,
            amountRaw: '1',
            exclusion: {
              kind: 'guess',
              source: 'fixture',
              observedAt: EVIDENCE_AT,
              subjectAddress: ACCOUNT_A,
            },
          },
        ],
      },
      {
        kind: 'bundle',
        rule: 'fixture',
        denominatorKind: 'circulating_guess',
        denominatorRaw: '100',
        graphComplete: true,
        membershipComplete: true,
        confidence: 'certain',
        members: [],
      },
    ];
    for (const payload of malformed) {
      expect(() => evaluateSafetyPayload(payload as SafetyEvidencePayload)).toThrow();
    }
    database.close();
  });

  it('represents unavailable holder and bundle economics with null rather than fabricated amounts', () => {
    const holderUnavailable = evaluateSafetyPayload({
      kind: 'holder',
      denominatorKind: 'effective_circulating_supply',
      totalSupplyRaw: null,
      denominatorRaw: null,
      supplyReconciled: false,
      ownerCoverageComplete: false,
      sourceIsTop20Only: false,
      accounts: [],
    });
    expect(holderUnavailable).toMatchObject({ status: 'UNKNOWN', percentage: null });
    const bundleUnavailable = evaluateSafetyPayload({
      kind: 'bundle',
      rule: 'unavailable:no_provider',
      denominatorKind: 'effective_circulating_supply',
      denominatorRaw: null,
      graphComplete: false,
      membershipComplete: false,
      confidence: 'low',
      members: [],
    });
    expect(bundleUnavailable).toMatchObject({ status: 'UNKNOWN', percentage: null });
    expect(() =>
      evaluateSafetyPayload({
        kind: 'holder',
        denominatorKind: 'effective_circulating_supply',
        totalSupplyRaw: null,
        denominatorRaw: null,
        supplyReconciled: true,
        ownerCoverageComplete: false,
        sourceIsTop20Only: false,
        accounts: [],
      }),
    ).toThrow(/Unavailable holder economics/);
  });

  it('blocks generic in-memory and persisted safety-rejection transition bypasses', () => {
    const { database, episode } = pendingEpisode();
    const request = {
      to: 'REJECTED_SAFETY_UNKNOWN' as const,
      at: DECISION_AT,
      reason: 'generic_bypass',
    };
    expect(() => applyTransition(episode, request, { now: FIXTURE_NOW })).toThrow(
      /reserved for the persisted safety-decision reducer/,
    );
    expect(() =>
      persistTransition(database, episode.episodeId, request, { now: FIXTURE_NOW }),
    ).toThrow(/reserved for the persisted safety-decision reducer/);
    expect(loadEpisode(database, episode.episodeId)?.state).toBe('SIGNAL_PENDING_SAFETY');
    database.close();
  });

  it('binds persisted evidence, rejects future/mismatch, and enforces retry semantics', () => {
    const { database, episode } = pendingEpisode();
    const payload = holder({
      accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '11', exclusion: null }],
    });
    const evidence = evidenceFor(episode, payload);
    expect(persistSafetyEvidence(database, evidence, { now: FIXTURE_NOW }).idempotent).toBe(false);
    expect(persistSafetyEvidence(database, evidence, { now: FIXTURE_NOW }).idempotent).toBe(true);
    expect(() =>
      persistSafetyEvidence(
        database,
        evidenceFor(episode, holder({ ownerCoverageComplete: false }), { observedAt: EVIDENCE_AT }),
        { now: FIXTURE_NOW },
      ),
    ).toThrow(/Conflicting safety evidence/);
    expect(() => evidenceFor(episode, payload, { observedAt: '2026-08-19T13:00:00.000Z' })).toThrow(
      /future/,
    );
    expect(() =>
      persistSafetyEvidence(database, evidenceFor(episode, payload, { mint: OWNER_A }), {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/episode or mint does not match/i);

    const first = persistSafetyDecision(database, episode.episodeId, DECISION_AT, {
      now: FIXTURE_NOW,
    });
    expect(first.decision.outcome).toBe('REJECTED_SAFETY');
    expect(
      persistSafetyDecision(database, episode.episodeId, DECISION_AT, { now: FIXTURE_NOW })
        .idempotent,
    ).toBe(true);
    expect(() =>
      persistSafetyDecision(database, episode.episodeId, '2026-08-19T11:08:00.000Z', {
        now: FIXTURE_NOW,
      }),
    ).toThrow(/Conflicting safety decision retry/);
    expect(loadEpisode(database, episode.episodeId)?.state).toBe('REJECTED_SAFETY');
    const report = loadRecoveryReportSnapshot(database);
    expect(report.safetyEvidenceCounts.holder.FAIL).toBe(1);
    expect(report.rejectedSafetyCount).toBe(1);
    expect(report.safetyDecisionReasons[first.decision.reason]).toBe(1);
    expect(listEpisodesInState(database, 'PAPER_ELIGIBLE')).toEqual([]);
    expect(listEpisodesInState(database, 'PAPER_OPEN')).toEqual([]);
    database.close();
  });

  it('fails closed when persisted evidence is directly tampered', () => {
    const { database, episode } = pendingEpisode();
    const evidence = evidenceFor(
      episode,
      holder({
        accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '11', exclusion: null }],
      }),
    );
    persistSafetyEvidence(database, evidence, { now: FIXTURE_NOW });
    database
      .prepare('UPDATE rw0_safety_evidence_v2 SET status = ? WHERE evidence_id = ?')
      .run('PASS', evidence.evidenceId);
    expect(() => listSafetyEvidence(database, episode.episodeId)).toThrow(/canonical evaluator/);
    expect(() =>
      persistSafetyDecision(database, episode.episodeId, DECISION_AT, { now: FIXTURE_NOW }),
    ).toThrow(/canonical evaluator/);
    expect(loadEpisode(database, episode.episodeId)?.state).toBe('SIGNAL_PENDING_SAFETY');
    database.close();
  });

  it('fails closed on future direct-SQL evidence in list and report hydration', () => {
    const { database, episode } = pendingEpisode();
    const evidence = evidenceFor(
      episode,
      holder({
        accounts: [{ tokenAccount: ACCOUNT_A, owner: OWNER_A, amountRaw: '11', exclusion: null }],
      }),
    );
    persistSafetyEvidence(database, evidence, { now: FIXTURE_NOW });
    database
      .prepare(
        'UPDATE rw0_safety_evidence_v2 SET observed_at = ?, collected_at = ? WHERE evidence_id = ?',
      )
      .run('2099-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', evidence.evidenceId);
    expect(() =>
      listSafetyEvidence(database, episode.episodeId, { now: FIXTURE_NOW }),
    ).toThrow(/future/);
    expect(() => loadRecoveryReportSnapshot(database, { now: FIXTURE_NOW })).toThrow(/future/);
    database.close();
  });
});
