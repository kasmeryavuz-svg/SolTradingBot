import { createHash } from 'node:crypto';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import {
  EXIT_MAX_HOLDING_MS,
  EXIT_STOP_LOSS_BPS,
  EXIT_TAKE_PROFIT_BPS,
} from '../exit/constants.js';
import { evaluateExitAction } from '../exit/evaluator.js';
import { deriveHoldingAgeMs } from '../exit/invariants.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { OpenPaperPosition } from '../position/types.js';
import { multiplyFinite, requireFiniteNumber, subtractFinite } from '../performance/numbers.js';
import {
  MOONBAG_CLOSE_FRACTION,
  MOONBAG_INITIAL_STOP_BPS,
  MOONBAG_MAX_HOLDING_MS,
  MOONBAG_REMAINING_FRACTION,
  MOONBAG_TAKE_BPS,
  MOONBAG_TRAIL_BPS,
  PARTIAL_RUNNER_CLOSE_FRACTION,
  PARTIAL_RUNNER_INITIAL_STOP_BPS,
  PARTIAL_RUNNER_MAX_HOLDING_MS,
  PARTIAL_RUNNER_REMAINING_FRACTION,
  PARTIAL_RUNNER_TAKE_BPS,
  PARTIAL_RUNNER_TRAIL_BPS,
  TIGHT_RISK_MAX_HOLDING_MS,
  TIGHT_RISK_STOP_BPS,
  TIGHT_RISK_TAKE_BPS,
  WIDER_RUNNER_MAX_HOLDING_MS,
  WIDER_RUNNER_STOP_BPS,
  WIDER_RUNNER_TAKE_BPS,
} from './constants.js';
import { closeFractionQuantity, remainingAfterClose, assertQuantityConserved } from './partial-exits.js';
import {
  OptimizationError,
  OPTIMIZATION_EXIT_CANDIDATE_IDS,
  type OptimizationExitCandidateId,
  type OptimizationExitLegReason,
} from './types.js';

export type CanonicalFullCloseExit = {
  candidateId: OptimizationExitCandidateId;
  stopLossBps: number;
  takeProfitBps: number;
  maxHoldingMs: number;
  closeFraction: 1;
  fill: {
    takeProfit: 'target_price_not_observed_overshoot' | 'frozen_x11_observed_price';
    stopLoss: 'observed_price';
    maxHold: 'first_eligible_same_pair_observation_at_or_after_limit';
    trailing: 'none';
  };
  interpolation: 'none';
  hiddenHighLowInference: 'none';
};

export type CanonicalPartialExit = {
  candidateId: OptimizationExitCandidateId;
  initialStopLossBps: number;
  partialTakeProfitBps: number;
  partialCloseFraction: number;
  remainingFraction: number;
  trailingStopBpsBelowObservedPeak: number;
  maxHoldingMs: number;
  peak: 'highest_observed_post_entry_price';
  fill: {
    takeProfit: 'target_price_not_observed_overshoot';
    stopLoss: 'observed_price';
    trailing: 'observed_price';
    maxHold: 'first_eligible_same_pair_observation_at_or_after_limit';
  };
  partialTakeTriggersOnce: true;
  noRepeatedTakeProfit: true;
  noNewPositionSizing: true;
  interpolation: 'none';
};

export function canonicalX11BaselineExit(): CanonicalFullCloseExit & {
  frozenX11Fingerprint: string;
  usesFrozenEvaluateExitAction: true;
} {
  return {
    candidateId: 'x11_baseline',
    stopLossBps: EXIT_STOP_LOSS_BPS,
    takeProfitBps: EXIT_TAKE_PROFIT_BPS,
    maxHoldingMs: EXIT_MAX_HOLDING_MS,
    closeFraction: 1,
    fill: {
      takeProfit: 'frozen_x11_observed_price',
      stopLoss: 'observed_price',
      maxHold: 'first_eligible_same_pair_observation_at_or_after_limit',
      trailing: 'none',
    },
    interpolation: 'none',
    hiddenHighLowInference: 'none',
    frozenX11Fingerprint: EXIT_DEFINITION_FINGERPRINT,
    usesFrozenEvaluateExitAction: true,
  };
}

export function canonicalTightRiskExit(): CanonicalFullCloseExit {
  return {
    candidateId: 'tight_risk_v1',
    stopLossBps: TIGHT_RISK_STOP_BPS,
    takeProfitBps: TIGHT_RISK_TAKE_BPS,
    maxHoldingMs: TIGHT_RISK_MAX_HOLDING_MS,
    closeFraction: 1,
    fill: {
      takeProfit: 'target_price_not_observed_overshoot',
      stopLoss: 'observed_price',
      maxHold: 'first_eligible_same_pair_observation_at_or_after_limit',
      trailing: 'none',
    },
    interpolation: 'none',
    hiddenHighLowInference: 'none',
  };
}

export function canonicalWiderRunnerExit(): CanonicalFullCloseExit {
  return {
    candidateId: 'wider_runner_v1',
    stopLossBps: WIDER_RUNNER_STOP_BPS,
    takeProfitBps: WIDER_RUNNER_TAKE_BPS,
    maxHoldingMs: WIDER_RUNNER_MAX_HOLDING_MS,
    closeFraction: 1,
    fill: {
      takeProfit: 'target_price_not_observed_overshoot',
      stopLoss: 'observed_price',
      maxHold: 'first_eligible_same_pair_observation_at_or_after_limit',
      trailing: 'none',
    },
    interpolation: 'none',
    hiddenHighLowInference: 'none',
  };
}

export function canonicalPartialRunnerExit(): CanonicalPartialExit {
  return {
    candidateId: 'partial_runner_v1',
    initialStopLossBps: PARTIAL_RUNNER_INITIAL_STOP_BPS,
    partialTakeProfitBps: PARTIAL_RUNNER_TAKE_BPS,
    partialCloseFraction: PARTIAL_RUNNER_CLOSE_FRACTION,
    remainingFraction: PARTIAL_RUNNER_REMAINING_FRACTION,
    trailingStopBpsBelowObservedPeak: PARTIAL_RUNNER_TRAIL_BPS,
    maxHoldingMs: PARTIAL_RUNNER_MAX_HOLDING_MS,
    peak: 'highest_observed_post_entry_price',
    fill: {
      takeProfit: 'target_price_not_observed_overshoot',
      stopLoss: 'observed_price',
      trailing: 'observed_price',
      maxHold: 'first_eligible_same_pair_observation_at_or_after_limit',
    },
    partialTakeTriggersOnce: true,
    noRepeatedTakeProfit: true,
    noNewPositionSizing: true,
    interpolation: 'none',
  };
}

export function canonicalMoonbagRunnerExit(): CanonicalPartialExit {
  return {
    candidateId: 'moonbag_runner_v1',
    initialStopLossBps: MOONBAG_INITIAL_STOP_BPS,
    partialTakeProfitBps: MOONBAG_TAKE_BPS,
    partialCloseFraction: MOONBAG_CLOSE_FRACTION,
    remainingFraction: MOONBAG_REMAINING_FRACTION,
    trailingStopBpsBelowObservedPeak: MOONBAG_TRAIL_BPS,
    maxHoldingMs: MOONBAG_MAX_HOLDING_MS,
    peak: 'highest_observed_post_entry_price',
    fill: {
      takeProfit: 'target_price_not_observed_overshoot',
      stopLoss: 'observed_price',
      trailing: 'observed_price',
      maxHold: 'first_eligible_same_pair_observation_at_or_after_limit',
    },
    partialTakeTriggersOnce: true,
    noRepeatedTakeProfit: true,
    noNewPositionSizing: true,
    interpolation: 'none',
  };
}

export function canonicalExitCandidate(candidateId: OptimizationExitCandidateId): unknown {
  switch (candidateId) {
    case 'x11_baseline':
      return canonicalX11BaselineExit();
    case 'tight_risk_v1':
      return canonicalTightRiskExit();
    case 'wider_runner_v1':
      return canonicalWiderRunnerExit();
    case 'partial_runner_v1':
      return canonicalPartialRunnerExit();
    case 'moonbag_runner_v1':
      return canonicalMoonbagRunnerExit();
  }
}

export function fingerprintExitCandidate(candidateId: OptimizationExitCandidateId): string {
  if (candidateId === 'x11_baseline') {
    return EXIT_DEFINITION_FINGERPRINT;
  }
  return createHash('sha256')
    .update(JSON.stringify(canonicalExitCandidate(candidateId)), 'utf8')
    .digest('hex');
}

export function isOptimizationExitId(value: string): value is OptimizationExitCandidateId {
  return (OPTIMIZATION_EXIT_CANDIDATE_IDS as readonly string[]).includes(value);
}

export function requireOptimizationExitId(value: string): OptimizationExitCandidateId {
  if (isOptimizationExitId(value)) {
    return value;
  }
  throw new OptimizationError(
    `Unknown optimization exit candidate: ${value}. Expected one of: ${OPTIMIZATION_EXIT_CANDIDATE_IDS.join(', ')}.`,
  );
}

export type OpenOptimizationPositionState = {
  paper: OpenPaperPosition;
  originalQuantityTokens: number;
  remainingQuantityTokens: number;
  partialTakeTriggered: boolean;
  highestObservedPostEntryPriceUsd: number | null;
  realizedLegs: {
    reason: OptimizationExitLegReason;
    exitedAt: string;
    exitMarketIdentity: string;
    quantityTokens: number;
    grossExitReferenceUsd: number;
    observedPriceUsd: number;
  }[];
};

export type OptimizationExitStep =
  | { action: 'no_change'; reason: 'market_price_unavailable' | 'exit_conditions_not_met' }
  | {
      action: 'realize_leg';
      reason: OptimizationExitLegReason;
      quantityTokens: number;
      grossExitReferenceUsd: number;
      observedPriceUsd: number;
      remainingQuantityTokens: number;
      positionFullyClosed: boolean;
    };

export function deriveStopTrigger(entryPriceUsd: number, stopLossBps: number): number {
  const trigger = multiplyFinite(
    entryPriceUsd,
    subtractFinite(1, divideBps(stopLossBps), 'stop multiplier'),
    'stop trigger',
  );
  if (trigger < 0) {
    throw new OptimizationError('Derived stop trigger must be >= 0.');
  }
  return trigger;
}

export function deriveTakeTrigger(entryPriceUsd: number, takeProfitBps: number): number {
  const trigger = multiplyFinite(
    entryPriceUsd,
    requireFiniteNumber(1 + divideBps(takeProfitBps), 'take multiplier'),
    'take trigger',
  );
  if (!(trigger > 0)) {
    throw new OptimizationError('Derived take trigger must be > 0.');
  }
  return trigger;
}

export function deriveTrailTrigger(peakObservedPriceUsd: number, trailBps: number): number {
  const trigger = multiplyFinite(
    peakObservedPriceUsd,
    subtractFinite(1, divideBps(trailBps), 'trail multiplier'),
    'trail trigger',
  );
  if (trigger < 0) {
    throw new OptimizationError('Derived trail trigger must be >= 0.');
  }
  return trigger;
}

function divideBps(bps: number): number {
  return requireFiniteNumber(bps / 10_000, 'bps / 10000');
}

export function evaluateOptimizationExitStep(input: {
  exitCandidateId: OptimizationExitCandidateId;
  open: OpenOptimizationPositionState;
  marketSnapshot: MarketSnapshot;
  exitMarketIdentity: string;
}): OptimizationExitStep {
  const { exitCandidateId, open, marketSnapshot } = input;
  if (marketSnapshot.pairAddress !== open.paper.pairAddress) {
    throw new OptimizationError('Optimization exits require the exact opening pair.');
  }
  if (marketSnapshot.tokenMint !== open.paper.tokenMint) {
    throw new OptimizationError('Optimization exits require the same token mint.');
  }

  if (exitCandidateId === 'x11_baseline') {
    return evaluateFrozenX11Step(open, marketSnapshot);
  }

  const observed = marketSnapshot.priceUsd;
  if (observed === null) {
    return { action: 'no_change', reason: 'market_price_unavailable' };
  }
  if (typeof observed !== 'number' || !Number.isFinite(observed) || observed < 0) {
    throw new OptimizationError('Observed exit price must be null or a finite number >= 0.');
  }

  const holdingAgeMs = deriveHoldingAgeMs(marketSnapshot.collectedAt, open.paper.openedAt);
  const entry = open.paper.entryPriceUsd;

  if (exitCandidateId === 'tight_risk_v1') {
    return evaluateFullCloseConservative({
      observed,
      stopTrigger: deriveStopTrigger(entry, TIGHT_RISK_STOP_BPS),
      takeTrigger: deriveTakeTrigger(entry, TIGHT_RISK_TAKE_BPS),
      holdingAgeMs,
      maxHoldingMs: TIGHT_RISK_MAX_HOLDING_MS,
      remainingQuantityTokens: open.remainingQuantityTokens,
    });
  }
  if (exitCandidateId === 'wider_runner_v1') {
    return evaluateFullCloseConservative({
      observed,
      stopTrigger: deriveStopTrigger(entry, WIDER_RUNNER_STOP_BPS),
      takeTrigger: deriveTakeTrigger(entry, WIDER_RUNNER_TAKE_BPS),
      holdingAgeMs,
      maxHoldingMs: WIDER_RUNNER_MAX_HOLDING_MS,
      remainingQuantityTokens: open.remainingQuantityTokens,
    });
  }
  if (exitCandidateId === 'partial_runner_v1') {
    return evaluatePartialStep({
      open,
      observed,
      holdingAgeMs,
      initialStopBps: PARTIAL_RUNNER_INITIAL_STOP_BPS,
      takeBps: PARTIAL_RUNNER_TAKE_BPS,
      closeFraction: PARTIAL_RUNNER_CLOSE_FRACTION,
      trailBps: PARTIAL_RUNNER_TRAIL_BPS,
      maxHoldingMs: PARTIAL_RUNNER_MAX_HOLDING_MS,
    });
  }
  return evaluatePartialStep({
    open,
    observed,
    holdingAgeMs,
    initialStopBps: MOONBAG_INITIAL_STOP_BPS,
    takeBps: MOONBAG_TAKE_BPS,
    closeFraction: MOONBAG_CLOSE_FRACTION,
    trailBps: MOONBAG_TRAIL_BPS,
    maxHoldingMs: MOONBAG_MAX_HOLDING_MS,
  });
}

export function applyExitStepToState(
  open: OpenOptimizationPositionState,
  step: OptimizationExitStep,
  snapshot: MarketSnapshot,
  exitMarketIdentity: string,
): OpenOptimizationPositionState {
  if (step.action === 'no_change') {
    const observed = snapshot.priceUsd;
    const nextPeak =
      typeof observed === 'number' && Number.isFinite(observed)
        ? raisePeak(open.highestObservedPostEntryPriceUsd, observed)
        : open.highestObservedPostEntryPriceUsd;
    return { ...open, highestObservedPostEntryPriceUsd: nextPeak };
  }

  const remaining = step.remainingQuantityTokens;
  if (remaining < 0) {
    throw new OptimizationError('Remaining quantity cannot be negative.');
  }
  const realizedSum = open.realizedLegs.reduce((sum, leg) => sum + leg.quantityTokens, 0) + step.quantityTokens;
  if (realizedSum - open.originalQuantityTokens > 0) {
    throw new OptimizationError('Realized fractions cannot exceed original quantity.');
  }
  assertQuantityConserved(open.originalQuantityTokens, realizedSum, remaining);

  const nextPeak = raisePeak(open.highestObservedPostEntryPriceUsd, step.observedPriceUsd);
  return {
    ...open,
    remainingQuantityTokens: remaining,
    partialTakeTriggered: open.partialTakeTriggered || step.reason === 'take_profit_partial',
    highestObservedPostEntryPriceUsd: nextPeak,
    realizedLegs: [
      ...open.realizedLegs,
      {
        reason: step.reason,
        exitedAt: snapshot.collectedAt,
        exitMarketIdentity,
        quantityTokens: step.quantityTokens,
        grossExitReferenceUsd: step.grossExitReferenceUsd,
        observedPriceUsd: step.observedPriceUsd,
      },
    ],
  };
}

function evaluateFrozenX11Step(
  open: OpenOptimizationPositionState,
  marketSnapshot: MarketSnapshot,
): OptimizationExitStep {
  const evaluation = evaluateExitAction({
    openPosition: open.paper,
    marketSnapshot,
  });
  if (evaluation.exitAction === 'no_change') {
    return {
      action: 'no_change',
      reason: evaluation.exitReason === 'market_price_unavailable' ? 'market_price_unavailable' : 'exit_conditions_not_met',
    };
  }
  if (evaluation.simulatedExitPriceUsd === null) {
    throw new OptimizationError('x11 close_position must provide a simulated exit price.');
  }
  const reason = mapX11Reason(evaluation.exitReason);
  return {
    action: 'realize_leg',
    reason,
    quantityTokens: open.remainingQuantityTokens,
    grossExitReferenceUsd: evaluation.simulatedExitPriceUsd,
    observedPriceUsd: evaluation.observedPriceUsd ?? evaluation.simulatedExitPriceUsd,
    remainingQuantityTokens: 0,
    positionFullyClosed: true,
  };
}

function mapX11Reason(reason: string): OptimizationExitLegReason {
  if (reason === 'stop_loss_threshold' || reason === 'take_profit_threshold' || reason === 'max_holding_time') {
    return reason;
  }
  throw new OptimizationError(`Unexpected x11 close reason: ${reason}.`);
}

function evaluateFullCloseConservative(input: {
  observed: number;
  stopTrigger: number;
  takeTrigger: number;
  holdingAgeMs: number;
  maxHoldingMs: number;
  remainingQuantityTokens: number;
}): OptimizationExitStep {
  if (input.observed <= input.stopTrigger) {
    return {
      action: 'realize_leg',
      reason: 'stop_loss_threshold',
      quantityTokens: input.remainingQuantityTokens,
      grossExitReferenceUsd: input.observed,
      observedPriceUsd: input.observed,
      remainingQuantityTokens: 0,
      positionFullyClosed: true,
    };
  }
  if (input.observed >= input.takeTrigger) {
    return {
      action: 'realize_leg',
      reason: 'take_profit_threshold',
      quantityTokens: input.remainingQuantityTokens,
      grossExitReferenceUsd: input.takeTrigger,
      observedPriceUsd: input.observed,
      remainingQuantityTokens: 0,
      positionFullyClosed: true,
    };
  }
  if (input.holdingAgeMs >= input.maxHoldingMs) {
    return {
      action: 'realize_leg',
      reason: 'max_holding_time',
      quantityTokens: input.remainingQuantityTokens,
      grossExitReferenceUsd: input.observed,
      observedPriceUsd: input.observed,
      remainingQuantityTokens: 0,
      positionFullyClosed: true,
    };
  }
  return { action: 'no_change', reason: 'exit_conditions_not_met' };
}

function evaluatePartialStep(input: {
  open: OpenOptimizationPositionState;
  observed: number;
  holdingAgeMs: number;
  initialStopBps: number;
  takeBps: number;
  closeFraction: number;
  trailBps: number;
  maxHoldingMs: number;
}): OptimizationExitStep {
  const { open, observed } = input;
  const entry = open.paper.entryPriceUsd;

  if (!open.partialTakeTriggered) {
    const stopTrigger = deriveStopTrigger(entry, input.initialStopBps);
    const takeTrigger = deriveTakeTrigger(entry, input.takeBps);
    if (observed <= stopTrigger) {
      return {
        action: 'realize_leg',
        reason: 'stop_loss_threshold',
        quantityTokens: open.remainingQuantityTokens,
        grossExitReferenceUsd: observed,
        observedPriceUsd: observed,
        remainingQuantityTokens: 0,
        positionFullyClosed: true,
      };
    }
    if (observed >= takeTrigger) {
      const closedQty = closeFractionQuantity(open.originalQuantityTokens, input.closeFraction);
      const remaining = remainingAfterClose(open.originalQuantityTokens, closedQty);
      return {
        action: 'realize_leg',
        reason: 'take_profit_partial',
        quantityTokens: closedQty,
        grossExitReferenceUsd: takeTrigger,
        observedPriceUsd: observed,
        remainingQuantityTokens: remaining,
        positionFullyClosed: remaining === 0,
      };
    }
    if (input.holdingAgeMs >= input.maxHoldingMs) {
      return {
        action: 'realize_leg',
        reason: 'max_holding_time',
        quantityTokens: open.remainingQuantityTokens,
        grossExitReferenceUsd: observed,
        observedPriceUsd: observed,
        remainingQuantityTokens: 0,
        positionFullyClosed: true,
      };
    }
    return { action: 'no_change', reason: 'exit_conditions_not_met' };
  }

  const peak = raisePeak(open.highestObservedPostEntryPriceUsd, observed);
  if (peak === null) {
    throw new OptimizationError('Trailing stop requires an observed post-entry peak.');
  }
  const trailTrigger = deriveTrailTrigger(peak, input.trailBps);
  if (observed <= trailTrigger) {
    return {
      action: 'realize_leg',
      reason: 'trailing_stop',
      quantityTokens: open.remainingQuantityTokens,
      grossExitReferenceUsd: observed,
      observedPriceUsd: observed,
      remainingQuantityTokens: 0,
      positionFullyClosed: true,
    };
  }
  if (input.holdingAgeMs >= input.maxHoldingMs) {
    return {
      action: 'realize_leg',
      reason: 'max_holding_time',
      quantityTokens: open.remainingQuantityTokens,
      grossExitReferenceUsd: observed,
      observedPriceUsd: observed,
      remainingQuantityTokens: 0,
      positionFullyClosed: true,
    };
  }
  return { action: 'no_change', reason: 'exit_conditions_not_met' };
}

function raisePeak(current: number | null, observed: number): number | null {
  if (!Number.isFinite(observed)) {
    return current;
  }
  if (current === null) {
    return observed;
  }
  return observed > current ? observed : current;
}
