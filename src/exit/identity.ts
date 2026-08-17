import { createHash } from 'node:crypto';
import {
  EXIT_CLOSE_FRACTION_BPS,
  EXIT_MAX_HOLDING_MS,
  EXIT_SPEC_NAME,
  EXIT_SPEC_VERSION,
  EXIT_STOP_LOSS_BPS,
  EXIT_TAKE_PROFIT_BPS,
  REQUIRED_EXIT_POSITION_DEFINITION_FINGERPRINT,
  REQUIRED_EXIT_POSITION_SPEC_VERSION,
} from './constants.js';

/**
 * Canonical x11_v1 definition fingerprint contract.
 *
 * SHA-256 of JSON.stringify(canonicalExitDefinition()) with explicit key
 * order. Portable data only: no function source, file bytes, git SHA, locale,
 * timezone, wall-clock time, or randomness.
 */
export type CanonicalExitDefinition = {
  exitSpecVersion: string;
  exitSpecName: string;
  requiredPositionSpecVersion: string;
  requiredPositionDefinitionFingerprint: string;
  positionScope: string;
  marketPriceSource: string;
  marketOrientation: string;
  stopLossBps: number;
  stopLossComparison: string;
  stopPriceFormula: string;
  takeProfitBps: number;
  takeProfitComparison: string;
  takeProfitPriceFormula: string;
  maxHoldingMs: number;
  timeComparison: string;
  holdingAgeClockSource: string;
  decisionPrecedence: readonly string[];
  closeFractionBps: number;
  closeQuantity: string;
  simulatedExitPrice: string;
  zeroExitPrice: string;
  costModel: string;
  slippageModel: string;
  partialExitModel: string;
  trailingStopModel: string;
  positionMutation: string;
  persistencePolicy: string;
};

export type CanonicalExitDefinitionOverrides = {
  exitSpecVersion?: string;
  exitSpecName?: string;
  requiredPositionSpecVersion?: string;
  requiredPositionDefinitionFingerprint?: string;
  positionScope?: string;
  marketPriceSource?: string;
  marketOrientation?: string;
  stopLossBps?: number;
  stopLossComparison?: string;
  stopPriceFormula?: string;
  takeProfitBps?: number;
  takeProfitComparison?: string;
  takeProfitPriceFormula?: string;
  maxHoldingMs?: number;
  timeComparison?: string;
  holdingAgeClockSource?: string;
  decisionPrecedence?: readonly string[];
  closeFractionBps?: number;
  closeQuantity?: string;
  simulatedExitPrice?: string;
  zeroExitPrice?: string;
  costModel?: string;
  slippageModel?: string;
  partialExitModel?: string;
  trailingStopModel?: string;
  positionMutation?: string;
  persistencePolicy?: string;
};

export function canonicalExitDefinition(
  overrides: CanonicalExitDefinitionOverrides = {},
): CanonicalExitDefinition {
  return {
    exitSpecVersion: overrides.exitSpecVersion ?? EXIT_SPEC_VERSION,
    exitSpecName: overrides.exitSpecName ?? EXIT_SPEC_NAME,
    requiredPositionSpecVersion: overrides.requiredPositionSpecVersion ?? REQUIRED_EXIT_POSITION_SPEC_VERSION,
    requiredPositionDefinitionFingerprint:
      overrides.requiredPositionDefinitionFingerprint ?? REQUIRED_EXIT_POSITION_DEFINITION_FINGERPRINT,
    positionScope: overrides.positionScope ?? 'one_exact_current_open_position',
    marketPriceSource: overrides.marketPriceSource ?? 'exact_opening_pair',
    marketOrientation: overrides.marketOrientation ?? 'requested_mint_must_be_base_token',
    stopLossBps: overrides.stopLossBps ?? EXIT_STOP_LOSS_BPS,
    stopLossComparison: overrides.stopLossComparison ?? 'observedPriceUsd <= stopTriggerPriceUsd',
    stopPriceFormula: overrides.stopPriceFormula ?? 'entryPriceUsd * (1 - EXIT_STOP_LOSS_BPS / 10000)',
    takeProfitBps: overrides.takeProfitBps ?? EXIT_TAKE_PROFIT_BPS,
    takeProfitComparison: overrides.takeProfitComparison ?? 'observedPriceUsd >= takeProfitTriggerPriceUsd',
    takeProfitPriceFormula:
      overrides.takeProfitPriceFormula ?? 'entryPriceUsd * (1 + EXIT_TAKE_PROFIT_BPS / 10000)',
    maxHoldingMs: overrides.maxHoldingMs ?? EXIT_MAX_HOLDING_MS,
    timeComparison: overrides.timeComparison ?? 'holdingAgeMs >= maxHoldingMs',
    holdingAgeClockSource: overrides.holdingAgeClockSource ?? 'marketSnapshot.collectedAt',
    decisionPrecedence: overrides.decisionPrecedence ?? [
      'price_unavailable',
      'stop',
      'take_profit',
      'max_holding',
      'hold',
    ],
    closeFractionBps: overrides.closeFractionBps ?? EXIT_CLOSE_FRACTION_BPS,
    closeQuantity: overrides.closeQuantity ?? 'exact_openPosition.quantityTokens',
    simulatedExitPrice: overrides.simulatedExitPrice ?? 'exact_observed_opening_pair_price',
    zeroExitPrice: overrides.zeroExitPrice ?? 'allowed',
    costModel: overrides.costModel ?? 'none',
    slippageModel: overrides.slippageModel ?? 'none',
    partialExitModel: overrides.partialExitModel ?? 'none',
    trailingStopModel: overrides.trailingStopModel ?? 'none',
    positionMutation: overrides.positionMutation ?? 'immutable_entry_remove_current_open_index_on_close',
    persistencePolicy: overrides.persistencePolicy ?? 'one_exit_evaluation_per_exact_position_and_market_source',
  };
}

export function mutateCanonicalExitDefinition(
  mutate: (definition: CanonicalExitDefinition) => void,
): CanonicalExitDefinition {
  const definition = structuredClone(canonicalExitDefinition());
  mutate(definition);
  return definition;
}

export function fingerprintExitDefinition(
  definition: CanonicalExitDefinition = canonicalExitDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const EXIT_DEFINITION_FINGERPRINT = fingerprintExitDefinition();

export function marketSourceIdentity(input: {
  tokenMint: string;
  pairAddress: string;
  collectedAt: string;
}): string {
  return JSON.stringify({
    tokenMint: input.tokenMint,
    pairAddress: input.pairAddress,
    collectedAt: input.collectedAt,
  });
}

export function exitEvaluationSourceIdentity(input: {
  exitSpecVersion: string;
  exitDefinitionFingerprint: string;
  positionSourceIdentity: string;
  marketSourceIdentity: string;
}): string {
  return JSON.stringify({
    exitSpecVersion: input.exitSpecVersion,
    exitDefinitionFingerprint: input.exitDefinitionFingerprint,
    positionSourceIdentity: input.positionSourceIdentity,
    marketSourceIdentity: input.marketSourceIdentity,
  });
}

export function exitEvidenceSourceIdentity(input: {
  exitSpecVersion: string;
  exitDefinitionFingerprint: string;
  positionSourceIdentity: string;
  exitEvaluationSourceIdentity: string;
}): string {
  return JSON.stringify({
    exitSpecVersion: input.exitSpecVersion,
    exitDefinitionFingerprint: input.exitDefinitionFingerprint,
    positionSourceIdentity: input.positionSourceIdentity,
    exitEvaluationSourceIdentity: input.exitEvaluationSourceIdentity,
  });
}
