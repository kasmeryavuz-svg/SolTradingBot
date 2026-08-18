import { describe, expect, it } from 'vitest';
import { selectDecisionObservations } from '../src/ml/sampling.js';
import { SAMPLE_COOLDOWN_MS } from '../src/ml/constants.js';
import { addMs, ML_T0, mlSnapshot, optimizationMint, PAIR_ADDRESS } from './ml-fixtures.js';
import { OTHER_PAIR } from './feature-fixtures.js';

describe('ml sampling cooldown', () => {
  it('selects 00:00 and 06:00, not 01:00 or 05:59, independent of input order', () => {
    const tokenMint = optimizationMint(1);
    const times = [
      ML_T0,
      addMs(ML_T0, 60 * 60 * 1000),
      addMs(ML_T0, SIX_H_MINUS_ONE),
      addMs(ML_T0, SAMPLE_COOLDOWN_MS),
      addMs(ML_T0, SAMPLE_COOLDOWN_MS + 60_000),
    ];
    const snapshots = times.map((collectedAt, index) => mlSnapshot(tokenMint, collectedAt, 100 + index));
    const reversed = [...snapshots].reverse();
    const selected = selectDecisionObservations(reversed);
    expect(selected.map((item) => item.snapshot.collectedAt)).toEqual([
      ML_T0,
      addMs(ML_T0, SAMPLE_COOLDOWN_MS),
    ]);
  });

  it('keeps independent schedules for different tokens and different pairs', () => {
    const a = optimizationMint(2);
    const b = optimizationMint(3);
    const snapshots = [
      mlSnapshot(b, addMs(ML_T0, 60_000), 100),
      mlSnapshot(a, ML_T0, 100),
      mlSnapshot(a, addMs(ML_T0, 60_000), 101, { pairAddress: OTHER_PAIR }),
    ];
    const selected = selectDecisionObservations(snapshots);
    expect(selected).toHaveLength(3);
    expect(selected.some((item) => item.snapshot.tokenMint === a && item.snapshot.pairAddress === PAIR_ADDRESS)).toBe(
      true,
    );
    expect(selected.some((item) => item.snapshot.tokenMint === a && item.snapshot.pairAddress === OTHER_PAIR)).toBe(
      true,
    );
  });
});

const SIX_H_MINUS_ONE = SAMPLE_COOLDOWN_MS - 60_000;
