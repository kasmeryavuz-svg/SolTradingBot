import { describe, expect, it } from 'vitest';
import {
  assertDailyCaps,
  assertLiveBalance,
  assertLiveFeeCaps,
  utcDayKey,
  utcDayStartMs,
} from '../src/live/limits.js';
import { LiveError } from '../src/live/errors.js';

describe('live limits', () => {
  it('uses UTC calendar days', () => {
    const beforeMidnight = Date.parse('2026-08-18T23:59:59.000Z');
    const afterMidnight = Date.parse('2026-08-19T00:00:00.000Z');
    expect(utcDayKey(beforeMidnight)).toBe('2026-08-18');
    expect(utcDayKey(afterMidnight)).toBe('2026-08-19');
    expect(utcDayStartMs(afterMidnight)).toBe(afterMidnight);
  });

  it('refuses daily input and attempt caps', () => {
    expect(() => {
      assertDailyCaps({ utcDay: '2026-08-18', attemptCount: 1, inputLamports: 1_500_000n }, 1_000_000n);
    }).toThrow(/2_000_000|2000000|UTC day/);
    expect(() => {
      assertDailyCaps({ utcDay: '2026-08-18', attemptCount: 2, inputLamports: 1_000_000n }, 1_000_000n);
    }).toThrow(/2 broadcast|attempts/);
    expect(() => {
      assertDailyCaps({ utcDay: '2026-08-18', attemptCount: 1, inputLamports: 1_000_000n }, 1_000_000n);
    }).not.toThrow();
  });

  it('enforces fee and balance gates', () => {
    expect(() => {
      assertLiveFeeCaps(null);
    }).toThrow(LiveError);
    expect(() => {
      assertLiveFeeCaps({
        computeUnitPriceMicroLamports: 1n,
        calculatedPriorityFeeComponentLamports: 50_001n,
        maxPriorityFeeLamports: 1_000_000n,
        rpcEstimatedTransactionFeeLamports: 5_000n,
      });
    }).toThrow(/priority/);
    expect(() => {
      assertLiveFeeCaps({
        computeUnitPriceMicroLamports: 1n,
        calculatedPriorityFeeComponentLamports: 100n,
        maxPriorityFeeLamports: 1_000_000n,
        rpcEstimatedTransactionFeeLamports: null,
      });
    }).toThrow(/unavailable/);
    expect(() => {
      assertLiveFeeCaps({
        computeUnitPriceMicroLamports: 1n,
        calculatedPriorityFeeComponentLamports: 100n,
        maxPriorityFeeLamports: 1_000_000n,
        rpcEstimatedTransactionFeeLamports: 100_001n,
      });
    }).toThrow(/fee estimate/);
    expect(() => {
      assertLiveBalance({ balanceLamports: 9_999_999n, amountLamports: 1_000n, rpcFeeLamports: 5_000n });
    }).toThrow(/0\.01|10000000/);
    expect(() => {
      assertLiveBalance({
        balanceLamports: 10_000_000n,
        amountLamports: 9_996_000n,
        rpcFeeLamports: 5_000n,
      });
    }).toThrow(/greater than input/);
  });
});
