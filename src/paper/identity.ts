import { createHash } from 'node:crypto';
import { featureSourceIdentity } from '../features/numbers.js';
import type { FeatureVector } from '../features/types.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from '../strategy/identity.js';
import {
  PAPER_COST_MODEL,
  PAPER_EXECUTION_MODEL,
  PAPER_EXIT_MODEL,
  PAPER_POSITION_MODEL,
  PAPER_QUANTITY_MODEL,
  PAPER_SPEC_NAME,
  PAPER_SPEC_VERSION,
  REQUIRED_PAPER_FEATURE_SET_VERSION,
  REQUIRED_PAPER_STRATEGY_VERSION,
} from './constants.js';

/**
 * Canonical p09_v1 definition fingerprint contract.
 *
 * SHA-256 of JSON.stringify(canonicalPaperDefinition()) with explicit key
 * order. Portable data only: no function source, file bytes, git SHA, locale,
 * timezone, wall-clock time, or randomness.
 */
export type CanonicalPaperDefinition = {
  paperSpecVersion: string;
  paperSpecName: string;
  requiredFeatureSetVersion: string;
  requiredStrategyVersion: string;
  eligibleStrategyDecision: string;
  actionMapping: {
    entry_candidate: { action: string; noActionReason: string | null };
    no_entry: { action: string; noActionReason: string | null };
    insufficient_data: { action: string; noActionReason: string | null };
  };
  referencePriceSource: string;
  simulatedEntryPrice: string;
  executionModel: string;
  costModel: string;
  quantityModel: string;
  positionModel: string;
  exitModel: string;
  candidateCooldown: string;
  candidateTransitionSuppression: string;
  persistencePolicy: string;
};

export type CanonicalPaperDefinitionOverrides = {
  paperSpecVersion?: string;
  paperSpecName?: string;
  requiredFeatureSetVersion?: string;
  requiredStrategyVersion?: string;
  eligibleStrategyDecision?: string;
  actionMapping?: {
    entry_candidate?: { action?: string; noActionReason?: string | null };
    no_entry?: { action?: string; noActionReason?: string | null };
    insufficient_data?: { action?: string; noActionReason?: string | null };
  };
  referencePriceSource?: string;
  simulatedEntryPrice?: string;
  executionModel?: string;
  costModel?: string;
  quantityModel?: string;
  positionModel?: string;
  exitModel?: string;
  candidateCooldown?: string;
  candidateTransitionSuppression?: string;
  persistencePolicy?: string;
};

export function canonicalPaperDefinition(
  overrides: CanonicalPaperDefinitionOverrides = {},
): CanonicalPaperDefinition {
  return {
    paperSpecVersion: overrides.paperSpecVersion ?? PAPER_SPEC_VERSION,
    paperSpecName: overrides.paperSpecName ?? PAPER_SPEC_NAME,
    requiredFeatureSetVersion: overrides.requiredFeatureSetVersion ?? REQUIRED_PAPER_FEATURE_SET_VERSION,
    requiredStrategyVersion: overrides.requiredStrategyVersion ?? REQUIRED_PAPER_STRATEGY_VERSION,
    eligibleStrategyDecision: overrides.eligibleStrategyDecision ?? 'entry_candidate',
    actionMapping: {
      entry_candidate: {
        action: overrides.actionMapping?.entry_candidate?.action ?? 'entry_observation',
        noActionReason: overrides.actionMapping?.entry_candidate?.noActionReason ?? null,
      },
      no_entry: {
        action: overrides.actionMapping?.no_entry?.action ?? 'no_action',
        noActionReason: overrides.actionMapping?.no_entry?.noActionReason ?? 'strategy_no_entry',
      },
      insufficient_data: {
        action: overrides.actionMapping?.insufficient_data?.action ?? 'no_action',
        noActionReason:
          overrides.actionMapping?.insufficient_data?.noActionReason ?? 'strategy_insufficient_data',
      },
    },
    referencePriceSource:
      overrides.referencePriceSource ?? 'exact_feature_vector_market_snapshot_price_usd',
    simulatedEntryPrice: overrides.simulatedEntryPrice ?? 'equals_reference_price',
    executionModel: overrides.executionModel ?? PAPER_EXECUTION_MODEL,
    costModel: overrides.costModel ?? PAPER_COST_MODEL,
    quantityModel: overrides.quantityModel ?? PAPER_QUANTITY_MODEL,
    positionModel: overrides.positionModel ?? PAPER_POSITION_MODEL,
    exitModel: overrides.exitModel ?? PAPER_EXIT_MODEL,
    candidateCooldown: overrides.candidateCooldown ?? 'none',
    candidateTransitionSuppression: overrides.candidateTransitionSuppression ?? 'none',
    persistencePolicy:
      overrides.persistencePolicy ?? 'one_paper_evaluation_per_exact_strategy_source_identity',
  };
}

export function mutateCanonicalPaperDefinition(
  mutate: (definition: CanonicalPaperDefinition) => void,
): CanonicalPaperDefinition {
  const definition = structuredClone(canonicalPaperDefinition());
  mutate(definition);
  return definition;
}

export function fingerprintPaperDefinition(
  definition: CanonicalPaperDefinition = canonicalPaperDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const PAPER_DEFINITION_FINGERPRINT = fingerprintPaperDefinition();

export function paperSourceIdentity(input: {
  paperSpecVersion: string;
  paperDefinitionFingerprint: string;
  strategySourceIdentity: string;
}): string {
  return JSON.stringify({
    paperSpecVersion: input.paperSpecVersion,
    paperDefinitionFingerprint: input.paperDefinitionFingerprint,
    strategySourceIdentity: input.strategySourceIdentity,
  });
}

export function paperSourceIdentityFromVector(vector: FeatureVector): string {
  return paperSourceIdentity({
    paperSpecVersion: PAPER_SPEC_VERSION,
    paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
    strategySourceIdentity: strategySourceIdentity({
      strategyVersion: REQUIRED_PAPER_STRATEGY_VERSION,
      strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
      featureSourceIdentity: featureSourceIdentity(vector),
    }),
  });
}
