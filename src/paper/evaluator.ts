import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { featureSourceIdentity } from '../features/numbers.js';
import type { FeatureVector } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { evaluateStrategy } from '../strategy/evaluator.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from '../strategy/identity.js';
import {
  assertStrategyEvaluationInvariants,
  strategyEvaluationsSemanticallyEqual,
} from '../strategy/invariants.js';
import { type StrategyEvaluation } from '../strategy/types.js';
import {
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
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
import { PAPER_DEFINITION_FINGERPRINT, paperSourceIdentityFromVector } from './identity.js';
import {
  assertMarketSnapshotMatchesFeatureVector,
  assertPaperEvaluationInvariants,
  wrapPaperSourceError,
} from './invariants.js';
import { PaperError, type PaperEvaluation, type PaperNoActionReason } from './types.js';

export function evaluatePaperAction(input: {
  marketSnapshot: MarketSnapshot;
  featureVector: FeatureVector;
  strategyEvaluation: StrategyEvaluation;
}): PaperEvaluation {
  const { marketSnapshot, featureVector, strategyEvaluation } = input;

  try {
    assertStrategyEvaluationInvariants(strategyEvaluation, featureVector);
  } catch (error: unknown) {
    wrapPaperSourceError(error);
  }

  if (strategyEvaluation.strategyDefinitionFingerprint !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
    throw new PaperError('Paper evaluation requires the frozen s07_v1 strategy definition fingerprint.');
  }
  if (strategyEvaluation.strategyVersion !== REQUIRED_PAPER_STRATEGY_VERSION) {
    throw new PaperError('Paper evaluation requires strategy s07_v1.');
  }
  if (featureVector.featureSetVersion !== REQUIRED_PAPER_FEATURE_SET_VERSION) {
    throw new PaperError('Paper evaluation requires feature set c06_v1.');
  }

  const recomputed = evaluateStrategy(featureVector, { evaluatedAt: strategyEvaluation.evaluatedAt });
  if (
    !strategyEvaluationsSemanticallyEqual(strategyEvaluation, recomputed) ||
    strategyEvaluation.evaluatedAt !== recomputed.evaluatedAt
  ) {
    throw new PaperError('Strategy evaluation does not match a fresh s07_v1 evaluation of the feature vector.');
  }

  assertExactSourceLinkage(marketSnapshot, featureVector, strategyEvaluation);

  const featureIdentity = featureSourceIdentity(featureVector);
  const strategyIdentity = strategySourceIdentity({
    strategyVersion: REQUIRED_PAPER_STRATEGY_VERSION,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSourceIdentity: featureIdentity,
  });
  if (strategyEvaluation.featureSourceIdentity !== featureIdentity) {
    throw new PaperError('Strategy evaluation featureSourceIdentity does not match the recomputed feature identity.');
  }

  const mapped = mapStrategyDecision(strategyEvaluation.decision, marketSnapshot.priceUsd);
  const evaluation: PaperEvaluation = {
    chain: 'solana',
    tokenMint: featureVector.tokenMint,
    paperSpecVersion: PAPER_SPEC_VERSION,
    paperSpecName: PAPER_SPEC_NAME,
    paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
    featureSetVersion: FEATURE_SET_VERSION,
    strategyVersion: REQUIRED_PAPER_STRATEGY_VERSION,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSourceIdentity: featureIdentity,
    strategySourceIdentity: strategyIdentity,
    asOf: strategyEvaluation.asOf,
    evaluatedAt: strategyEvaluation.evaluatedAt,
    marketCollectedAt: marketSnapshot.collectedAt,
    pairAddress: marketSnapshot.pairAddress,
    strategyDecision: strategyEvaluation.decision,
    paperAction: mapped.paperAction,
    noActionReason: mapped.noActionReason,
    referencePriceUsd: mapped.referencePriceUsd,
    simulatedEntryPriceUsd: mapped.simulatedEntryPriceUsd,
    executionModel: PAPER_EXECUTION_MODEL,
    costModel: PAPER_COST_MODEL,
    quantityModel: PAPER_QUANTITY_MODEL,
    positionModel: PAPER_POSITION_MODEL,
    exitModel: PAPER_EXIT_MODEL,
  };

  if (paperSourceIdentityFromVector(featureVector) !== paperSourceIdentity(evaluation)) {
    throw new PaperError('Paper source identity does not match the canonical p09_v1 identity.');
  }

  assertPaperEvaluationInvariants(evaluation, {
    marketSnapshot,
    featureVector,
    strategyEvaluation,
  });
  return evaluation;
}

function paperSourceIdentity(evaluation: PaperEvaluation): string {
  return JSON.stringify({
    paperSpecVersion: evaluation.paperSpecVersion,
    paperDefinitionFingerprint: evaluation.paperDefinitionFingerprint,
    strategySourceIdentity: evaluation.strategySourceIdentity,
  });
}

function mapStrategyDecision(
  decision: StrategyEvaluation['decision'],
  marketPriceUsd: number | null,
): {
  paperAction: PaperEvaluation['paperAction'];
  noActionReason: PaperNoActionReason | null;
  referencePriceUsd: number | null;
  simulatedEntryPriceUsd: number | null;
} {
  if (decision === 'entry_candidate') {
    const referencePriceUsd = requirePositiveFinitePrice(marketPriceUsd);
    return {
      paperAction: 'entry_observation',
      noActionReason: null,
      referencePriceUsd,
      simulatedEntryPriceUsd: referencePriceUsd,
    };
  }

  return {
    paperAction: 'no_action',
    noActionReason: decision === 'no_entry' ? 'strategy_no_entry' : 'strategy_insufficient_data',
    referencePriceUsd: null,
    simulatedEntryPriceUsd: null,
  };
}

function requirePositiveFinitePrice(value: number | null): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new PaperError(
      'ENTRY_CANDIDATE paper observation requires a finite market snapshot priceUsd greater than 0.',
    );
  }
  return value;
}

function assertExactSourceLinkage(
  market: MarketSnapshot,
  vector: FeatureVector,
  evaluation: StrategyEvaluation,
): void {
  if (market.tokenMint !== vector.tokenMint || evaluation.tokenMint !== vector.tokenMint) {
    throw new PaperError('Paper evaluation token mint does not match the market snapshot, feature vector, and strategy evaluation.');
  }
  if (vector.marketCollectedAt !== market.collectedAt) {
    throw new PaperError('Feature vector marketCollectedAt does not match the market snapshot collectedAt.');
  }
  if (vector.marketPairAddress !== market.pairAddress) {
    throw new PaperError('Feature vector marketPairAddress does not match the market snapshot pairAddress.');
  }
  if (vector.asOf !== evaluation.asOf) {
    throw new PaperError('Feature vector asOf does not match the strategy evaluation asOf.');
  }
  assertMarketSnapshotMatchesFeatureVector(market, vector);
}
