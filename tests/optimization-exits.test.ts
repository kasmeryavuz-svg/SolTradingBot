import { describe, expect, it } from 'vitest';
import {
  applyExitStepToState,
  deriveStopTrigger,
  deriveTakeTrigger,
  deriveTrailTrigger,
  evaluateOptimizationExitStep,
} from '../src/optimization/exits.js';
import { addMs, exitMarketSnapshot } from './exit-fixtures.js';
import { OTHER_PAIR } from './feature-fixtures.js';
import { O17_ENTRY_OPENED_AT, openOptimizationState } from './optimization-fixtures.js';

describe('conservative observation-only exits', () => {
  it('uses the gapped observed stop price, not the stop threshold', () => {
    expect(deriveStopTrigger(100, 1000)).toBe(90);
    const open = openOptimizationState();
    const step = evaluateOptimizationExitStep({
      exitCandidateId: 'tight_risk_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 75,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'stop-gap',
    });
    expect(step).toMatchObject({
      action: 'realize_leg',
      reason: 'stop_loss_threshold',
      grossExitReferenceUsd: 75,
      positionFullyClosed: true,
    });
  });

  it('fills take-profit at the target, not the observed overshoot', () => {
    expect(deriveTakeTrigger(100, 1500)).toBeCloseTo(115, 10);
    const open = openOptimizationState();
    const step = evaluateOptimizationExitStep({
      exitCandidateId: 'tight_risk_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 150,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'take-overshoot',
    });
    expect(step.action).toBe('realize_leg');
    if (step.action === 'realize_leg') {
      expect(step.reason).toBe('take_profit_threshold');
      expect(step.grossExitReferenceUsd).toBeCloseTo(115, 10);
      expect(step.observedPriceUsd).toBe(150);
    }
  });

  it('trails from the highest observed peak and fills at the later observed price', () => {
    expect(deriveTrailTrigger(200, 1200)).toBe(176);
    const afterPartial = openOptimizationState({
      partialTakeTriggered: true,
      remainingQuantityTokens: 0.5,
      highestObservedPostEntryPriceUsd: 200,
    });
    const step = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open: afterPartial,
      marketSnapshot: exitMarketSnapshot(afterPartial.paper, {
        priceUsd: 160,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 120_000),
      }),
      exitMarketIdentity: 'trail',
    });
    expect(step).toMatchObject({
      action: 'realize_leg',
      reason: 'trailing_stop',
      grossExitReferenceUsd: 160,
    });
  });

  it('prefers stop over take on the same snapshot and rejects a different pair', () => {
    const open = openOptimizationState();
    const stopAndTake = evaluateOptimizationExitStep({
      exitCandidateId: 'wider_runner_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 70,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'both',
    });
    expect(stopAndTake.reason).toBe('stop_loss_threshold');
    expect(() => {
      evaluateOptimizationExitStep({
        exitCandidateId: 'tight_risk_v1',
        open,
        marketSnapshot: exitMarketSnapshot(open.paper, { pairAddress: OTHER_PAIR, priceUsd: 70 }),
        exitMarketIdentity: 'other-pair',
      });
    }).toThrow(/exact opening pair/);
  });

  it('updates the observed peak on no_change without realizing a second take', () => {
    const open = openOptimizationState({
      partialTakeTriggered: true,
      remainingQuantityTokens: 0.5,
      highestObservedPostEntryPriceUsd: 120,
    });
    const snapshot = exitMarketSnapshot(open.paper, {
      priceUsd: 180,
      collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
    });
    const step = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open,
      marketSnapshot: snapshot,
      exitMarketIdentity: 'peak',
    });
    expect(step.action).toBe('no_change');
    const next = applyExitStepToState(open, step, snapshot, 'peak');
    expect(next.highestObservedPostEntryPriceUsd).toBe(180);
    expect(next.realizedLegs).toHaveLength(0);
  });
});
