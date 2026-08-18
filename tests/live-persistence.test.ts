import { afterEach, describe, expect, it } from 'vitest';
import { LIVE_BROADCAST_RISK_STATUSES, LIVE_UNRESOLVED_STATUSES } from '../src/live/constants.js';
import { LiveError } from '../src/live/errors.js';
import { liveAttemptId } from '../src/live/identity.js';
import { LATEST_SCHEMA_VERSION, migrationSqlDigest } from '../src/persistence/sqlite/migrations.js';
import { openMemoryLiveStore, reserveLiveRow } from './live-fixtures.js';

const opened: Array<{ close: () => void }> = [];

function store() {
  const item = openMemoryLiveStore();
  opened.push(item);
  return item;
}

afterEach(() => {
  while (opened.length > 0) {
    opened.pop()?.close();
  }
});

describe('live persistence', () => {
  it('uses schema 9 and frozen historical digests 001-008', () => {
    expect(LATEST_SCHEMA_VERSION).toBe(9);
    expect(migrationSqlDigest(1)).toBe('7c20b9f9799c65c1be718df10a8841dcb7486d35414fa4806ea77a6192ebda7a');
    expect(migrationSqlDigest(7)).toBe('d049cf6a2ba8b041f703fe15ab13f1b687a347e4eab6b2b8587a84cd67b404fa');
    expect(migrationSqlDigest(8)).toBe(
      'e4c5ee0d56a8ffe5d916da3bd68d3792f48ac4ffbcce004ababa983d792747d0',
    );
  });

  it('rejects a duplicate candidate fingerprint', () => {
    const { store: live } = store();
    live.reserve(reserveLiveRow());
    expect(() => live.reserve(reserveLiveRow({ attemptId: 'f'.repeat(64) }))).toThrow(/duplicate_live_candidate/);
  });

  it('counts only broadcast-at-risk statuses toward the UTC day using broadcast_risk_at_ms', () => {
    const { store: live } = store();
    const taker = 'GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ';
    const noon = Date.parse('2026-08-18T12:00:00.000Z');
    live.reserve(
      reserveLiveRow({
        status: 'reserved',
        executionCandidateFingerprint: '1'.repeat(64),
        attemptId: liveAttemptId('1'.repeat(64)),
      }),
    );
    expect(live.dailyUsage(taker, noon).attemptCount).toBe(0);

    live.reserve(
      reserveLiveRow({
        status: 'broadcast_submitted',
        amountRaw: '1500000',
        executionCandidateFingerprint: '2'.repeat(64),
        attemptId: liveAttemptId('2'.repeat(64)),
        broadcastRiskAtMs: noon,
      }),
    );
    const usage = live.dailyUsage(taker, noon);
    expect(usage.attemptCount).toBe(1);
    expect(usage.inputLamports).toBe(1_500_000n);
  });

  it('attributes risk to the UTC day of broadcast_risk_at_ms, not created_at_ms', () => {
    const { store: live } = store();
    const beforeMidnight = Date.parse('2026-08-18T23:59:59.000Z');
    const afterMidnight = Date.parse('2026-08-19T00:00:01.000Z');
    live.reserve(
      reserveLiveRow({
        status: 'broadcast_submitting',
        createdAtMs: beforeMidnight,
        broadcastRiskAtMs: afterMidnight,
        executionCandidateFingerprint: '3'.repeat(64),
        attemptId: liveAttemptId('3'.repeat(64)),
      }),
    );
    expect(live.dailyUsage('GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ', beforeMidnight).attemptCount).toBe(0);
    expect(live.dailyUsage('GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ', afterMidnight).attemptCount).toBe(1);
  });

  it('returns the oldest unresolved attempt with an expected signature', () => {
    const { store: live } = store();
    live.reserve(
      reserveLiveRow({
        status: 'broadcast_outcome_unknown',
        expectedSignature: 'ExpectedSig111111111111111111111111111111111111111111111',
        createdAtMs: 2,
        executionCandidateFingerprint: '4'.repeat(64),
        attemptId: liveAttemptId('4'.repeat(64)),
        broadcastRiskAtMs: 2,
      }),
    );
    live.reserve(
      reserveLiveRow({
        status: 'broadcast_submitting',
        expectedSignature: 'OlderSig11111111111111111111111111111111111111111111111',
        createdAtMs: 1,
        executionCandidateFingerprint: '5'.repeat(64),
        attemptId: liveAttemptId('5'.repeat(64)),
        broadcastRiskAtMs: 1,
      }),
    );
    const found = live.getOldestUnresolved();
    expect(found?.expectedSignature).toContain('OlderSig');
    expect(found?.status).toBe('broadcast_submitting');
  });

  it('does not treat signed as unresolved or daily risk', () => {
    const { store: live } = store();
    live.reserve(
      reserveLiveRow({
        status: 'signed',
        expectedSignature: 'SignedOnly111111111111111111111111111111111111111111111',
        signedWireSha256: 'a'.repeat(64),
        executionCandidateFingerprint: '6'.repeat(64),
        attemptId: liveAttemptId('6'.repeat(64)),
      }),
    );
    expect(live.getOldestUnresolved()).toBeNull();
    expect(live.dailyUsage('GkwFnmMDvn3HGMpJpWBg8tgJxr3NxNvg3AXxvXVPbRGJ', Date.parse('2026-08-18T12:00:00.000Z')).attemptCount).toBe(0);
  });

  it('uses an explicit daily-risk status set rather than prefix matching', () => {
    expect(LIVE_BROADCAST_RISK_STATUSES).toContain('broadcast_submitting');
    expect(LIVE_BROADCAST_RISK_STATUSES).not.toContain('signed');
    expect(LIVE_BROADCAST_RISK_STATUSES).not.toContain('reserved');
    expect(LIVE_UNRESOLVED_STATUSES).not.toContain('signed');
    expect((LIVE_BROADCAST_RISK_STATUSES as readonly string[]).some((status) => status.startsWith('expired'))).toBe(true);
    expect(LIVE_BROADCAST_RISK_STATUSES).toEqual([...LIVE_BROADCAST_RISK_STATUSES]);
  });

  it('throws LiveError rather than leaking sqlite text for duplicates', () => {
    const { store: live } = store();
    live.reserve(reserveLiveRow());
    try {
      live.reserve(reserveLiveRow({ attemptId: 'x'.repeat(64) }));
      expect.fail('expected duplicate');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(LiveError);
    }
  });
});
