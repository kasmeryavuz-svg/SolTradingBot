import { createHash } from 'node:crypto';
import {
  divideFinite,
  multiplyFinite,
  requireFiniteNumber,
  subtractFinite,
} from '../performance/numbers.js';
import {
  COST_BASE_ENTRY_BPS,
  COST_BASE_EXIT_BPS,
  COST_LOW_ENTRY_BPS,
  COST_LOW_EXIT_BPS,
  COST_SPEC_NAME,
  COST_SPEC_VERSION,
  COST_STRESS_ENTRY_BPS,
  COST_STRESS_EXIT_BPS,
} from './constants.js';
import { OptimizationError, type CostScenarioDefinition, type CostScenarioId } from './types.js';

export type CanonicalCostDefinition = {
  costSpecVersion: string;
  costSpecName: string;
  kind: 'all_in_research_price_friction_assumption';
  notMeasuredHistoricalExecutionCost: true;
  noEnvironmentOverride: true;
  noSeparateSolanaFee: true;
  noSeparatePriorityFee: true;
  noSeparateJupiterFee: true;
  application: {
    buyEffectiveEntry: 'referencePrice * (1 + entryBps / 10000)';
    sellEffectiveExit: 'grossExitReference * (1 - exitBps / 10000)';
    everyExitLegPaysExitFrictionOnce: true;
    noDoubleCounting: true;
    triggersUseGrossReferencePathOnly: true;
    quantityEqualsReferenceNotionalDividedByGrossEntryPrice: true;
    effectiveCashOutlayMayExceedReferenceNotional: true;
  };
  scenarios: readonly CostScenarioDefinition[];
};

export function listCostScenarios(): readonly CostScenarioDefinition[] {
  return [
    {
      scenarioId: 'LOW',
      entryBps: COST_LOW_ENTRY_BPS,
      exitBps: COST_LOW_EXIT_BPS,
      description:
        'All-in research allowance 75 bps entry and 75 bps exit for spread, slippage, impact, fees, latency, and adverse execution. Not a measured cost.',
    },
    {
      scenarioId: 'BASE',
      entryBps: COST_BASE_ENTRY_BPS,
      exitBps: COST_BASE_EXIT_BPS,
      description:
        'All-in research allowance 200 bps entry and 200 bps exit. Not a measured cost.',
    },
    {
      scenarioId: 'STRESS',
      entryBps: COST_STRESS_ENTRY_BPS,
      exitBps: COST_STRESS_EXIT_BPS,
      description:
        'All-in research allowance 500 bps entry and 500 bps exit. Not a measured cost.',
    },
  ];
}

export function canonicalCostDefinition(): CanonicalCostDefinition {
  return {
    costSpecVersion: COST_SPEC_VERSION,
    costSpecName: COST_SPEC_NAME,
    kind: 'all_in_research_price_friction_assumption',
    notMeasuredHistoricalExecutionCost: true,
    noEnvironmentOverride: true,
    noSeparateSolanaFee: true,
    noSeparatePriorityFee: true,
    noSeparateJupiterFee: true,
    application: {
      buyEffectiveEntry: 'referencePrice * (1 + entryBps / 10000)',
      sellEffectiveExit: 'grossExitReference * (1 - exitBps / 10000)',
      everyExitLegPaysExitFrictionOnce: true,
      noDoubleCounting: true,
      triggersUseGrossReferencePathOnly: true,
      quantityEqualsReferenceNotionalDividedByGrossEntryPrice: true,
      effectiveCashOutlayMayExceedReferenceNotional: true,
    },
    scenarios: listCostScenarios(),
  };
}

export function fingerprintCostDefinition(
  definition: CanonicalCostDefinition = canonicalCostDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const COST_DEFINITION_FINGERPRINT = fingerprintCostDefinition();

export function requireCostScenario(scenarioId: CostScenarioId): CostScenarioDefinition {
  const found = listCostScenarios().find((scenario) => scenario.scenarioId === scenarioId);
  if (found === undefined) {
    throw new OptimizationError(`Unknown cost scenario ${scenarioId}.`);
  }
  return found;
}

export function applyEntryFriction(referencePrice: number, entryBps: number): number {
  requireFiniteNumber(referencePrice, 'referencePrice');
  requireFiniteNumber(entryBps, 'entryBps');
  if (!(referencePrice > 0)) {
    throw new OptimizationError('Entry friction requires a reference price greater than 0.');
  }
  if (!(entryBps >= 0)) {
    throw new OptimizationError('Entry friction bps must be >= 0.');
  }
  const multiplier = requireFiniteNumber(
    1 + divideFinite(entryBps, 10_000, 'entryBps / 10000'),
    'entry multiplier',
  );
  return multiplyFinite(referencePrice, multiplier, 'effectiveEntry');
}

export function applyExitFriction(grossExitReference: number, exitBps: number): number {
  requireFiniteNumber(grossExitReference, 'grossExitReference');
  requireFiniteNumber(exitBps, 'exitBps');
  if (grossExitReference < 0) {
    throw new OptimizationError('Exit friction requires a non-negative gross exit reference.');
  }
  if (!(exitBps >= 0)) {
    throw new OptimizationError('Exit friction bps must be >= 0.');
  }
  const haircut = divideFinite(exitBps, 10_000, 'exitBps / 10000');
  const multiplier = subtractFinite(1, haircut, 'exit multiplier');
  return multiplyFinite(grossExitReference, multiplier, 'effectiveExit');
}

export function netPnlUsd(input: {
  originalQuantityTokens: number;
  entryReferencePriceUsd: number;
  legs: readonly { quantityTokens: number; grossExitReferenceUsd: number }[];
  entryBps: number;
  exitBps: number;
}): number {
  assertCompletedLegQuantity(input.originalQuantityTokens, input.legs);
  const effectiveEntry = applyEntryFriction(input.entryReferencePriceUsd, input.entryBps);
  const entryNotional = multiplyFinite(
    input.originalQuantityTokens,
    effectiveEntry,
    'effective entry notional',
  );
  let exitValue = 0;
  for (const leg of input.legs) {
    const effectiveExit = applyExitFriction(leg.grossExitReferenceUsd, input.exitBps);
    exitValue += multiplyFinite(leg.quantityTokens, effectiveExit, 'effective exit value');
  }
  return subtractFinite(requireFiniteNumber(exitValue, 'net exit value'), entryNotional, 'netPnlUsd');
}

/**
 * Allocates entry friction only to realized quantity. Used to report first-leg
 * evidence on partially_realized_censored trades. Must NOT be mixed into
 * completed-trade ranking, drawdown, concentration, or promotion metrics.
 */
export function allocatedNetPnlUsdForRealizedLegs(input: {
  originalQuantityTokens: number;
  entryReferencePriceUsd: number;
  legs: readonly { quantityTokens: number; grossExitReferenceUsd: number }[];
  entryBps: number;
  exitBps: number;
}): number {
  requireFiniteNumber(input.originalQuantityTokens, 'originalQuantityTokens');
  const effectiveEntry = applyEntryFriction(input.entryReferencePriceUsd, input.entryBps);
  let realizedQty = 0;
  let exitValue = 0;
  for (const leg of input.legs) {
    realizedQty += requireFiniteNumber(leg.quantityTokens, 'leg.quantityTokens');
    const effectiveExit = applyExitFriction(leg.grossExitReferenceUsd, input.exitBps);
    exitValue += multiplyFinite(leg.quantityTokens, effectiveExit, 'allocated effective exit value');
  }
  if (realizedQty - input.originalQuantityTokens > 0) {
    throw new OptimizationError('Allocated realized quantity cannot exceed original quantity.');
  }
  const allocatedEntry = multiplyFinite(realizedQty, effectiveEntry, 'allocated effective entry notional');
  return subtractFinite(requireFiniteNumber(exitValue, 'allocated net exit value'), allocatedEntry, 'allocatedNetPnlUsd');
}

export function grossPnlUsd(input: {
  originalQuantityTokens: number;
  entryReferencePriceUsd: number;
  legs: readonly { quantityTokens: number; grossExitReferenceUsd: number }[];
}): number {
  assertCompletedLegQuantity(input.originalQuantityTokens, input.legs);
  const entryNotional = multiplyFinite(
    input.originalQuantityTokens,
    input.entryReferencePriceUsd,
    'gross entry notional',
  );
  let exitValue = 0;
  for (const leg of input.legs) {
    exitValue += multiplyFinite(leg.quantityTokens, leg.grossExitReferenceUsd, 'gross exit value');
  }
  return subtractFinite(requireFiniteNumber(exitValue, 'gross exit value'), entryNotional, 'grossPnlUsd');
}

function assertCompletedLegQuantity(
  originalQuantityTokens: number,
  legs: readonly { quantityTokens: number }[],
): void {
  requireFiniteNumber(originalQuantityTokens, 'originalQuantityTokens');
  if (!(originalQuantityTokens > 0)) {
    throw new OptimizationError('Original quantity must be greater than 0.');
  }
  let realized = 0;
  for (const leg of legs) {
    requireFiniteNumber(leg.quantityTokens, 'leg.quantityTokens');
    if (!(leg.quantityTokens > 0)) {
      throw new OptimizationError('Exit leg quantity must be greater than 0.');
    }
    realized += leg.quantityTokens;
  }
  const remaining = subtractFinite(originalQuantityTokens, requireFiniteNumber(realized, 'realized quantity'), 'unrealized remainder');
  if (remaining !== 0) {
    throw new OptimizationError('Completed-trade PnL requires realized quantity to equal original quantity.');
  }
}
