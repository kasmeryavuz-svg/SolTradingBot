import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { featureSourceIdentity } from '../features/numbers.js';
import type { FeatureVector } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from '../strategy/identity.js';
import { StrategyError, type StrategyEvaluation } from '../strategy/types.js';
import { FeatureEngineError } from '../features/types.js';
import {
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  PAPER_COST_MODEL,
  PAPER_EXECUTION_MODEL,
  PAPER_EXIT_MODEL,
  PAPER_POSITION_MODEL,
  PAPER_QUANTITY_MODEL,
  PAPER_SPEC_NAME,
  PAPER_SPEC_VERSION,
  REQUIRED_PAPER_STRATEGY_VERSION,
} from './constants.js';
import { PAPER_DEFINITION_FINGERPRINT, paperSourceIdentity } from './identity.js';
import { PaperError, type PaperEvaluation } from './types.js';

export function wrapPaperSourceError(error: unknown): never {
  if (error instanceof PaperError) {
    throw error;
  }
  if (error instanceof StrategyError || error instanceof FeatureEngineError) {
    throw new PaperError(error.message, { cause: error });
  }
  throw error;
}

export function paperEvaluationsSemanticallyEqual(left: PaperEvaluation, right: PaperEvaluation): boolean {
  return (
    (left.chain as string) === (right.chain as string) &&
    left.tokenMint === right.tokenMint &&
    left.paperSpecVersion === right.paperSpecVersion &&
    left.paperSpecName === right.paperSpecName &&
    left.paperDefinitionFingerprint === right.paperDefinitionFingerprint &&
    left.featureSetVersion === right.featureSetVersion &&
    left.strategyVersion === right.strategyVersion &&
    left.strategyDefinitionFingerprint === right.strategyDefinitionFingerprint &&
    left.featureSourceIdentity === right.featureSourceIdentity &&
    left.strategySourceIdentity === right.strategySourceIdentity &&
    left.asOf === right.asOf &&
    left.marketCollectedAt === right.marketCollectedAt &&
    left.pairAddress === right.pairAddress &&
    left.strategyDecision === right.strategyDecision &&
    left.paperAction === right.paperAction &&
    left.noActionReason === right.noActionReason &&
    Object.is(left.referencePriceUsd, right.referencePriceUsd) &&
    Object.is(left.simulatedEntryPriceUsd, right.simulatedEntryPriceUsd) &&
    (left.executionModel as string) === (right.executionModel as string) &&
    (left.costModel as string) === (right.costModel as string) &&
    (left.quantityModel as string) === (right.quantityModel as string) &&
    (left.positionModel as string) === (right.positionModel as string) &&
    (left.exitModel as string) === (right.exitModel as string)
  );
}

export function assertPaperSourceIdentity(evaluation: PaperEvaluation): string {
  const expected = paperSourceIdentity({
    paperSpecVersion: PAPER_SPEC_VERSION,
    paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
    strategySourceIdentity: evaluation.strategySourceIdentity,
  });
  const actual = paperSourceIdentity({
    paperSpecVersion: evaluation.paperSpecVersion,
    paperDefinitionFingerprint: evaluation.paperDefinitionFingerprint,
    strategySourceIdentity: evaluation.strategySourceIdentity,
  });
  if (actual !== expected) {
    throw new PaperError('Paper source identity does not match the canonical p09_v1 identity.');
  }
  return expected;
}

export function assertPaperEvaluationInvariants(
  evaluation: PaperEvaluation,
  sources: {
    marketSnapshot: MarketSnapshot;
    featureVector: FeatureVector;
    strategyEvaluation: StrategyEvaluation;
  },
): void {
  const { marketSnapshot, featureVector, strategyEvaluation } = sources;

  if ((evaluation.chain as string) !== 'solana') {
    throw new PaperError('Paper evaluation chain must be solana.');
  }
  if (evaluation.paperSpecVersion !== PAPER_SPEC_VERSION) {
    throw new PaperError('Paper evaluation spec version must be p09_v1.');
  }
  if (evaluation.paperSpecName !== PAPER_SPEC_NAME) {
    throw new PaperError('Paper evaluation spec name must be live_reference_price_entry_observation.');
  }
  if (evaluation.paperDefinitionFingerprint !== PAPER_DEFINITION_FINGERPRINT) {
    throw new PaperError('Paper definition fingerprint does not match the current p09_v1 definition.');
  }
  if (evaluation.featureSetVersion !== FEATURE_SET_VERSION) {
    throw new PaperError('Paper evaluation requires feature set c06_v1.');
  }
  if (evaluation.strategyVersion !== REQUIRED_PAPER_STRATEGY_VERSION) {
    throw new PaperError('Paper evaluation requires strategy s07_v1.');
  }
  if (
    evaluation.strategyDefinitionFingerprint !== STRATEGY_DEFINITION_FINGERPRINT ||
    evaluation.strategyDefinitionFingerprint !== FROZEN_S07_V1_DEFINITION_FINGERPRINT
  ) {
    throw new PaperError('Paper evaluation requires the frozen s07_v1 strategy definition fingerprint.');
  }

  if (
    evaluation.tokenMint !== marketSnapshot.tokenMint ||
    evaluation.tokenMint !== featureVector.tokenMint ||
    evaluation.tokenMint !== strategyEvaluation.tokenMint
  ) {
    throw new PaperError('Paper evaluation token mint does not match the exact source bundle.');
  }
  if (evaluation.pairAddress !== marketSnapshot.pairAddress || evaluation.pairAddress !== featureVector.marketPairAddress) {
    throw new PaperError('Paper evaluation pair address does not match the exact market snapshot used by the feature vector.');
  }
  if (
    evaluation.marketCollectedAt !== marketSnapshot.collectedAt ||
    evaluation.marketCollectedAt !== featureVector.marketCollectedAt
  ) {
    throw new PaperError('Paper evaluation marketCollectedAt does not match the exact market snapshot.');
  }
  if (evaluation.asOf !== strategyEvaluation.asOf || evaluation.asOf !== featureVector.asOf) {
    throw new PaperError('Paper evaluation asOf does not match the strategy evaluation asOf.');
  }
  assertMarketSnapshotMatchesFeatureVector(marketSnapshot, featureVector);
  if (evaluation.evaluatedAt !== strategyEvaluation.evaluatedAt) {
    throw new PaperError('Paper evaluation evaluatedAt must equal the strategy evaluation evaluatedAt.');
  }
  if (evaluation.strategyDecision !== strategyEvaluation.decision) {
    throw new PaperError('Paper evaluation strategyDecision does not match the strategy evaluation.');
  }

  const expectedFeatureIdentity = featureSourceIdentity(featureVector);
  if (evaluation.featureSourceIdentity !== expectedFeatureIdentity) {
    throw new PaperError('Paper evaluation featureSourceIdentity does not match the recomputed feature identity.');
  }
  const expectedStrategyIdentity = strategySourceIdentity({
    strategyVersion: REQUIRED_PAPER_STRATEGY_VERSION,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSourceIdentity: expectedFeatureIdentity,
  });
  if (evaluation.strategySourceIdentity !== expectedStrategyIdentity) {
    throw new PaperError('Paper evaluation strategySourceIdentity does not match the recomputed strategy identity.');
  }
  assertPaperSourceIdentity(evaluation);

  if ((evaluation.executionModel as string) !== PAPER_EXECUTION_MODEL) {
    throw new PaperError('Paper evaluation executionModel must be exact_strategy_market_snapshot_reference_price.');
  }
  if (
    (evaluation.costModel as string) !== PAPER_COST_MODEL ||
    (evaluation.quantityModel as string) !== PAPER_QUANTITY_MODEL ||
    (evaluation.positionModel as string) !== PAPER_POSITION_MODEL ||
    (evaluation.exitModel as string) !== PAPER_EXIT_MODEL
  ) {
    throw new PaperError('p09_v1 does not model costs, quantity, positions, or exits.');
  }

  assertActionMapping(evaluation, marketSnapshot);
}

function assertActionMapping(evaluation: PaperEvaluation, market: MarketSnapshot): void {
  if (evaluation.strategyDecision === 'entry_candidate') {
    if (evaluation.paperAction !== 'entry_observation' || evaluation.noActionReason !== null) {
      throw new PaperError('ENTRY_CANDIDATE must map to entry_observation with a null no-action reason.');
    }
    if (
      typeof evaluation.referencePriceUsd !== 'number' ||
      !Number.isFinite(evaluation.referencePriceUsd) ||
      evaluation.referencePriceUsd <= 0
    ) {
      throw new PaperError('ENTRY_CANDIDATE paper observation requires a finite referencePriceUsd greater than 0.');
    }
    if (!Object.is(evaluation.referencePriceUsd, market.priceUsd)) {
      throw new PaperError('Paper referencePriceUsd must equal the exact market snapshot priceUsd.');
    }
    if (!Object.is(evaluation.simulatedEntryPriceUsd, evaluation.referencePriceUsd)) {
      throw new PaperError('p09_v1 simulatedEntryPriceUsd must equal referencePriceUsd.');
    }
    return;
  }

  if (evaluation.paperAction !== 'no_action') {
    throw new PaperError('NO_ENTRY and INSUFFICIENT_DATA must map to no_action.');
  }
  if (evaluation.referencePriceUsd !== null || evaluation.simulatedEntryPriceUsd !== null) {
    throw new PaperError('NO_ACTION paper evaluations must not store a reference or simulated entry price.');
  }
  if (evaluation.strategyDecision === 'no_entry' && evaluation.noActionReason !== 'strategy_no_entry') {
    throw new PaperError('NO_ENTRY paper evaluations must use no-action reason strategy_no_entry.');
  }
  if (
    evaluation.strategyDecision === 'insufficient_data' &&
    evaluation.noActionReason !== 'strategy_insufficient_data'
  ) {
    throw new PaperError('INSUFFICIENT_DATA paper evaluations must use no-action reason strategy_insufficient_data.');
  }
}

export function assertMarketSnapshotMatchesFeatureVector(
  marketSnapshot: MarketSnapshot,
  featureVector: FeatureVector,
): void {
  const priceFeature = featureVector.values.find((item) => item.name === 'market_price_usd');
  if (priceFeature === undefined) {
    throw new PaperError('Feature vector is missing market_price_usd.');
  }
  if (priceFeature.status === 'available') {
    if (typeof priceFeature.value !== 'number' || !Object.is(marketSnapshot.priceUsd, priceFeature.value)) {
      throw new PaperError('Market snapshot priceUsd does not match the feature vector market_price_usd.');
    }
    return;
  }
  if (marketSnapshot.priceUsd !== null) {
    throw new PaperError('Market snapshot priceUsd does not match the unavailable feature vector market_price_usd.');
  }
}
