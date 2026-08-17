import { createHash } from 'node:crypto';
import { paperSourceIdentity } from '../paper/identity.js';
import type { PaperEvaluation } from '../paper/types.js';
import {
  POSITION_ENTRY_NOTIONAL_USD,
  POSITION_MAX_OPEN_PER_TOKEN,
  POSITION_QUANTITY_FORMULA,
  POSITION_SPEC_NAME,
  POSITION_SPEC_VERSION,
  REQUIRED_POSITION_PAPER_DEFINITION_FINGERPRINT,
  REQUIRED_POSITION_PAPER_SPEC_VERSION,
} from './constants.js';

/**
 * Canonical pm10_v1 definition fingerprint contract.
 *
 * SHA-256 of JSON.stringify(canonicalPositionDefinition()) with explicit key
 * order. Portable data only: no function source, file bytes, git SHA, locale,
 * timezone, wall-clock time, or randomness.
 */
export type CanonicalPositionDefinition = {
  positionSpecVersion: string;
  positionSpecName: string;
  requiredPaperSpecVersion: string;
  requiredPaperDefinitionFingerprint: string;
  eligiblePaperAction: string;
  noActionMapping: {
    strategy_no_entry: string;
    strategy_insufficient_data: string;
  };
  openPositionScope: string;
  maxCurrentOpenPositionsPerToken: number;
  existingPositionPolicy: string;
  pairPolicy: string;
  entryPriceSource: string;
  entryNotionalUsd: number;
  quantityFormula: string;
  quantityRounding: string;
  balanceModel: string;
  costModel: string;
  positionMutationAfterOpen: string;
  exitModel: string;
  stopLossModel: string;
  takeProfitModel: string;
  paperEventProcessingPolicy: string;
  sourceStatePolicy: string;
};

export type CanonicalPositionDefinitionOverrides = {
  positionSpecVersion?: string;
  positionSpecName?: string;
  requiredPaperSpecVersion?: string;
  requiredPaperDefinitionFingerprint?: string;
  eligiblePaperAction?: string;
  noActionMapping?: {
    strategy_no_entry?: string;
    strategy_insufficient_data?: string;
  };
  openPositionScope?: string;
  maxCurrentOpenPositionsPerToken?: number;
  existingPositionPolicy?: string;
  pairPolicy?: string;
  entryPriceSource?: string;
  entryNotionalUsd?: number;
  quantityFormula?: string;
  quantityRounding?: string;
  balanceModel?: string;
  costModel?: string;
  positionMutationAfterOpen?: string;
  exitModel?: string;
  stopLossModel?: string;
  takeProfitModel?: string;
  paperEventProcessingPolicy?: string;
  sourceStatePolicy?: string;
};

export function canonicalPositionDefinition(
  overrides: CanonicalPositionDefinitionOverrides = {},
): CanonicalPositionDefinition {
  return {
    positionSpecVersion: overrides.positionSpecVersion ?? POSITION_SPEC_VERSION,
    positionSpecName: overrides.positionSpecName ?? POSITION_SPEC_NAME,
    requiredPaperSpecVersion: overrides.requiredPaperSpecVersion ?? REQUIRED_POSITION_PAPER_SPEC_VERSION,
    requiredPaperDefinitionFingerprint:
      overrides.requiredPaperDefinitionFingerprint ?? REQUIRED_POSITION_PAPER_DEFINITION_FINGERPRINT,
    eligiblePaperAction: overrides.eligiblePaperAction ?? 'entry_observation',
    noActionMapping: {
      strategy_no_entry: overrides.noActionMapping?.strategy_no_entry ?? 'paper_strategy_no_entry',
      strategy_insufficient_data:
        overrides.noActionMapping?.strategy_insufficient_data ?? 'paper_strategy_insufficient_data',
    },
    openPositionScope: overrides.openPositionScope ?? 'token_mint',
    maxCurrentOpenPositionsPerToken:
      overrides.maxCurrentOpenPositionsPerToken ?? POSITION_MAX_OPEN_PER_TOKEN,
    existingPositionPolicy:
      overrides.existingPositionPolicy ?? 'preserve_existing_no_average_no_scale',
    pairPolicy: overrides.pairPolicy ?? 'opening_pair_is_anchored',
    entryPriceSource: overrides.entryPriceSource ?? 'paper_simulated_entry_price_usd',
    entryNotionalUsd: overrides.entryNotionalUsd ?? POSITION_ENTRY_NOTIONAL_USD,
    quantityFormula: overrides.quantityFormula ?? POSITION_QUANTITY_FORMULA,
    quantityRounding: overrides.quantityRounding ?? 'none',
    balanceModel: overrides.balanceModel ?? 'none',
    costModel: overrides.costModel ?? 'inherit_p09_exact_reference_price_no_costs',
    positionMutationAfterOpen: overrides.positionMutationAfterOpen ?? 'none',
    exitModel: overrides.exitModel ?? 'none',
    stopLossModel: overrides.stopLossModel ?? 'none',
    takeProfitModel: overrides.takeProfitModel ?? 'none',
    paperEventProcessingPolicy:
      overrides.paperEventProcessingPolicy ?? 'one_position_evaluation_per_exact_paper_evaluation',
    sourceStatePolicy:
      overrides.sourceStatePolicy ?? 'prior_open_position_source_identity_participates_in_evaluation_identity',
  };
}

export function mutateCanonicalPositionDefinition(
  mutate: (definition: CanonicalPositionDefinition) => void,
): CanonicalPositionDefinition {
  const definition = structuredClone(canonicalPositionDefinition());
  mutate(definition);
  return definition;
}

export function fingerprintPositionDefinition(
  definition: CanonicalPositionDefinition = canonicalPositionDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const POSITION_DEFINITION_FINGERPRINT = fingerprintPositionDefinition();

export function positionEvaluationSourceIdentity(input: {
  positionSpecVersion: string;
  positionDefinitionFingerprint: string;
  paperSourceIdentity: string;
  priorOpenPositionSourceIdentity: string | null;
}): string {
  return JSON.stringify({
    positionSpecVersion: input.positionSpecVersion,
    positionDefinitionFingerprint: input.positionDefinitionFingerprint,
    paperSourceIdentity: input.paperSourceIdentity,
    priorOpenPositionSourceIdentity: input.priorOpenPositionSourceIdentity,
  });
}

export function positionEntrySourceIdentity(input: {
  positionSpecVersion: string;
  positionDefinitionFingerprint: string;
  openingPaperSourceIdentity: string;
}): string {
  return JSON.stringify({
    positionSpecVersion: input.positionSpecVersion,
    positionDefinitionFingerprint: input.positionDefinitionFingerprint,
    openingPaperSourceIdentity: input.openingPaperSourceIdentity,
  });
}

export function paperSourceIdentityFromEvaluation(evaluation: PaperEvaluation): string {
  return paperSourceIdentity({
    paperSpecVersion: evaluation.paperSpecVersion,
    paperDefinitionFingerprint: evaluation.paperDefinitionFingerprint,
    strategySourceIdentity: evaluation.strategySourceIdentity,
  });
}
