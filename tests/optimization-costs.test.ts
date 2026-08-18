import { describe, expect, it } from 'vitest';
import {
  COST_BASE_ENTRY_BPS,
  COST_BASE_EXIT_BPS,
  COST_LOW_ENTRY_BPS,
  COST_STRESS_ENTRY_BPS,
} from '../src/optimization/constants.js';
import {
  applyEntryFriction,
  applyExitFriction,
  canonicalCostDefinition,
  fingerprintCostDefinition,
  grossPnlUsd,
  netPnlUsd,
} from '../src/optimization/costs.js';
import { COST_DEFINITION_FINGERPRINT } from '../src/optimization/costs.js';

describe('cost17_v1 friction arithmetic', () => {
  it('applies the frozen BASE 100 / 120 example exactly', () => {
    expect(applyEntryFriction(100, COST_BASE_ENTRY_BPS)).toBe(102);
    expect(applyExitFriction(120, COST_BASE_EXIT_BPS)).toBe(117.6);
    expect(
      netPnlUsd({
        originalQuantityTokens: 1,
        entryReferencePriceUsd: 100,
        legs: [{ quantityTokens: 1, grossExitReferenceUsd: 120 }],
        entryBps: COST_BASE_ENTRY_BPS,
        exitBps: COST_BASE_EXIT_BPS,
      }),
    ).toBeCloseTo(15.6, 10);
  });

  it('keeps LOW and STRESS all-in bps frozen', () => {
    expect(COST_LOW_ENTRY_BPS).toBe(75);
    expect(COST_STRESS_ENTRY_BPS).toBe(500);
    expect(applyEntryFriction(100, 75)).toBe(100.75);
    expect(applyExitFriction(120, 75)).toBeCloseTo(119.1, 10);
    expect(applyEntryFriction(100, 500)).toBe(105);
    expect(applyExitFriction(120, 500)).toBe(114);
  });

  it('applies exit friction once per realized partial leg and keeps gross separate', () => {
    const input = {
      originalQuantityTokens: 1,
      entryReferencePriceUsd: 100,
      legs: [
        { quantityTokens: 0.5, grossExitReferenceUsd: 120 },
        { quantityTokens: 0.5, grossExitReferenceUsd: 110 },
      ],
    };
    const net = netPnlUsd({ ...input, entryBps: 200, exitBps: 200 });
    const first = 0.5 * 117.6;
    const second = 0.5 * 107.8;
    expect(net).toBe(first + second - 102);
    expect(grossPnlUsd(input)).toBe(0.5 * 120 + 0.5 * 110 - 100);
    expect(grossPnlUsd(input)).not.toBe(net);
  });

  it('fingerprints the cost definition without generatedAt or environment overrides', () => {
    expect(canonicalCostDefinition().noEnvironmentOverride).toBe(true);
    expect(canonicalCostDefinition().notMeasuredHistoricalExecutionCost).toBe(true);
    expect(fingerprintCostDefinition()).toBe(COST_DEFINITION_FINGERPRINT);
  });
});
