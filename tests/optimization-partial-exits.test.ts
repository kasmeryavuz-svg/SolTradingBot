import { describe, expect, it } from 'vitest';
import {
  applyExitStepToState,
  evaluateOptimizationExitStep,
} from '../src/optimization/exits.js';
import {
  assertRealizedDoesNotExceedOriginal,
  closeFractionQuantity,
  remainingAfterClose,
} from '../src/optimization/partial-exits.js';
import { addMs, exitMarketSnapshot } from './exit-fixtures.js';
import { O17_ENTRY_OPENED_AT, openOptimizationState } from './optimization-fixtures.js';

describe('partial and moonbag accounting', () => {
  it('closes exactly 0.50 then 0.50 remaining for partial_runner_v1', () => {
    expect(closeFractionQuantity(1, 0.5)).toBe(0.5);
    expect(remainingAfterClose(1, 0.5)).toBe(0.5);
    const open = openOptimizationState();
    const take = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 150,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'partial-take',
    });
    expect(take).toMatchObject({
      action: 'realize_leg',
      reason: 'take_profit_partial',
      quantityTokens: 0.5,
      grossExitReferenceUsd: 120,
      remainingQuantityTokens: 0.5,
      positionFullyClosed: false,
    });
    const afterTake = applyExitStepToState(
      open,
      take,
      exitMarketSnapshot(open.paper, { priceUsd: 150, collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000) }),
      'partial-take',
    );
    expect(afterTake.partialTakeTriggered).toBe(true);
    const secondTake = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open: afterTake,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 200,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 120_000),
      }),
      exitMarketIdentity: 'no-second-take',
    });
    expect(secondTake.action).toBe('no_change');
  });

  it('closes exactly 0.67 then 0.33 remaining for moonbag_runner_v1', () => {
    expect(closeFractionQuantity(1, 0.67)).toBe(0.67);
    expect(remainingAfterClose(1, 0.67)).toBeCloseTo(0.33, 10);
    const open = openOptimizationState();
    const take = evaluateOptimizationExitStep({
      exitCandidateId: 'moonbag_runner_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 140,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'moonbag-take',
    });
    expect(take.action).toBe('realize_leg');
    if (take.action === 'realize_leg') {
      expect(take.quantityTokens).toBe(0.67);
      expect(take.remainingQuantityTokens).toBeCloseTo(0.33, 10);
      expect(take.grossExitReferenceUsd).toBe(125);
    }
  });

  it('stops 100% before the partial target and never realizes more than original quantity', () => {
    const open = openOptimizationState();
    const stop = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 80,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 60_000),
      }),
      exitMarketIdentity: 'full-stop',
    });
    expect(stop).toMatchObject({
      reason: 'stop_loss_threshold',
      quantityTokens: 1,
      remainingQuantityTokens: 0,
      positionFullyClosed: true,
    });
    expect(() => {
      assertRealizedDoesNotExceedOriginal(1, 1.0001);
    }).toThrow(/cannot exceed original/);
  });

  it('max-holds the runner remainder at the observed price', () => {
    const open = openOptimizationState({
      partialTakeTriggered: true,
      remainingQuantityTokens: 0.5,
      highestObservedPostEntryPriceUsd: 130,
    });
    const step = evaluateOptimizationExitStep({
      exitCandidateId: 'partial_runner_v1',
      open,
      marketSnapshot: exitMarketSnapshot(open.paper, {
        priceUsd: 128,
        collectedAt: addMs(O17_ENTRY_OPENED_AT, 12 * 60 * 60 * 1000),
      }),
      exitMarketIdentity: 'max-hold',
    });
    expect(step).toMatchObject({
      reason: 'max_holding_time',
      grossExitReferenceUsd: 128,
      quantityTokens: 0.5,
      positionFullyClosed: true,
    });
  });
});
