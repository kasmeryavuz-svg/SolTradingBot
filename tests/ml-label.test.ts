import { describe, expect, it } from 'vitest';
import { simulateX11Label } from '../src/ml/labels.js';
import { applyEntryFriction, applyExitFriction } from '../src/optimization/costs.js';
import { addMs, ML_T0, mlIndexes, mlSnapshot, optimizationMint } from './ml-fixtures.js';
import { SAMPLE_COOLDOWN_MS } from '../src/ml/constants.js';

describe('ml x11 labels', () => {
  it('uses frozen x11 stop and take fills and censors unresolved paths', () => {
    const token = optimizationMint(10);
    const entry = mlSnapshot(token, ML_T0, 100);
    const stop = mlSnapshot(token, addMs(ML_T0, 60_000), 89);
    const take = mlSnapshot(token, addMs(ML_T0, 60_000), 121);
    expect(simulateX11Label({ entry, indexes: mlIndexes([entry, stop]) }).exitReason).toBe('stop_loss_threshold');
    expect(simulateX11Label({ entry, indexes: mlIndexes([entry, take]) }).exitReason).toBe('take_profit_threshold');
    expect(simulateX11Label({ entry, indexes: mlIndexes([entry, take]) }).state).toBe('POSITIVE');
    expect(simulateX11Label({ entry, indexes: mlIndexes([entry]) }).state).toBe('CENSORED');
    expect(simulateX11Label({ entry, indexes: mlIndexes([entry]) }).censorReason).toBe(
      'unresolved_no_closing_observation',
    );
  });

  it('times out at the 6h observation and labels exact net zero as 0', () => {
    const token = optimizationMint(11);
    const entryPrice = 100;
    const exitPrice = applyEntryFriction(entryPrice, 200) / (1 - 200 / 10_000);
    expect(applyExitFriction(exitPrice, 200)).toBeCloseTo(applyEntryFriction(entryPrice, 200), 12);
    const entry = mlSnapshot(token, ML_T0, entryPrice);
    const timeout = mlSnapshot(token, addMs(ML_T0, SAMPLE_COOLDOWN_MS), exitPrice);
    const labeled = simulateX11Label({ entry, indexes: mlIndexes([entry, timeout]) });
    expect(labeled.exitReason).toBe('max_holding_time');
    expect(labeled.netBasePnlUsd).toBeCloseTo(0, 10);
    expect(labeled.label).toBe(0);
    expect(labeled.state).toBe('NON_POSITIVE');
  });

  it('can convert a small gross profit into NON_POSITIVE after BASE costs', () => {
    const token = optimizationMint(12);
    const entry = mlSnapshot(token, ML_T0, 100);
    const later = mlSnapshot(token, addMs(ML_T0, SAMPLE_COOLDOWN_MS), 103);
    const labeled = simulateX11Label({ entry, indexes: mlIndexes([entry, later]) });
    expect(labeled.grossPnlUsd ?? 0).toBeGreaterThan(0);
    expect(labeled.netBasePnlUsd ?? 0).toBeLessThan(0);
    expect(labeled.label).toBe(0);
  });

  it('does not use a snapshot beyond the 6h label window', () => {
    const token = optimizationMint(13);
    const entry = mlSnapshot(token, ML_T0, 100);
    const tooLate = mlSnapshot(token, addMs(ML_T0, SAMPLE_COOLDOWN_MS + 1), 50);
    const labeled = simulateX11Label({ entry, indexes: mlIndexes([entry, tooLate]) });
    expect(labeled.state).toBe('CENSORED');
  });

  it('cannot reuse the entry row as same-timestamp exit evidence', () => {
    const token = optimizationMint(15);
    const entry = mlSnapshot(token, ML_T0, 100);
    const sameTimeCrash = mlSnapshot(token, ML_T0, 50);
    const labeled = simulateX11Label({ entry, indexes: mlIndexes([entry, sameTimeCrash]) });
    expect(labeled.state).toBe('CENSORED');
  });

  it('allows T+6h as exit for the first sample and as entry for the next without leaking the second sample future', () => {
    const token = optimizationMint(16);
    const entry = mlSnapshot(token, ML_T0, 100);
    const boundary = mlSnapshot(token, addMs(ML_T0, SAMPLE_COOLDOWN_MS), 103);
    const secondFuture = mlSnapshot(token, addMs(ML_T0, SAMPLE_COOLDOWN_MS + 60_000), 50);
    const first = simulateX11Label({ entry, indexes: mlIndexes([entry, boundary, secondFuture]) });
    expect(first.completedAt).toBe(boundary.collectedAt);
    expect(first.exitReason).toBe('max_holding_time');
    const second = simulateX11Label({
      entry: boundary,
      indexes: mlIndexes([entry, boundary, secondFuture]),
    });
    expect(second.completedAt).toBe(secondFuture.collectedAt);
  });

  it('does not change a completed label when a later snapshot is added', () => {
    const token = optimizationMint(14);
    const entry = mlSnapshot(token, ML_T0, 100);
    const stop = mlSnapshot(token, addMs(ML_T0, 60_000), 89);
    const later = mlSnapshot(token, addMs(ML_T0, 120_000), 200);
    const first = simulateX11Label({ entry, indexes: mlIndexes([entry, stop]) });
    const second = simulateX11Label({ entry, indexes: mlIndexes([entry, stop, later]) });
    expect(second).toEqual(first);
    expect(first.exitReason).toBe('stop_loss_threshold');
  });
});
