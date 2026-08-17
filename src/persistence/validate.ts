import type { DiscoveryCandidate } from '../discovery/types.js';
import { assertFeatureVectorInvariants, assertSourceIdentity } from '../features/invariants.js';
import { featureSourceIdentity } from '../features/numbers.js';
import { FeatureEngineError, type FeatureVector } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { assertRiskReportInvariants } from '../risk/invariants.js';
import { RAW_AMOUNT_PATTERN } from '../risk/numbers.js';
import { RiskScanError, type TokenRiskReport } from '../risk/types.js';
import { evaluateStrategy } from '../strategy/evaluator.js';
import { STRATEGY_VERSION } from '../strategy/constants.js';
import {
  STRATEGY_DEFINITION_FINGERPRINT,
  strategySourceIdentity,
} from '../strategy/identity.js';
import {
  assertStrategyEvaluationInvariants,
  assertStrategySourceIdentity,
  strategyEvaluationsSemanticallyEqual,
} from '../strategy/invariants.js';
import { StrategyError, type StrategyEvaluation } from '../strategy/types.js';
import { evaluatePaperAction } from '../paper/evaluator.js';
import {
  PAPER_DEFINITION_FINGERPRINT,
  paperSourceIdentity,
} from '../paper/identity.js';
import {
  assertPaperEvaluationInvariants,
  paperEvaluationsSemanticallyEqual,
} from '../paper/invariants.js';
import { PaperError, type PaperEvaluation } from '../paper/types.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from '../paper/constants.js';
import { evaluatePositionAction } from '../position/evaluator.js';
import {
  POSITION_DEFINITION_FINGERPRINT,
  positionEvaluationSourceIdentity,
} from '../position/identity.js';
import {
  assertPositionEvaluationInvariants,
  positionEvaluationsSemanticallyEqual,
} from '../position/invariants.js';
import { PositionError, type PositionEvaluation } from '../position/types.js';
import { POSITION_SPEC_NAME, POSITION_SPEC_VERSION } from '../position/constants.js';
import { PersistenceError } from './types.js';
import type { StoredOpenPaperPosition } from './types.js';

export function requireFiniteOrNull(value: number | null, field: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new PersistenceError(`Invalid ${field}. Expected a finite number or null.`);
  }

  return value;
}

export function assertPersistableSnapshot(snapshot: MarketSnapshot): void {
  requireFiniteOrNull(snapshot.priceUsd, 'priceUsd');
  requireFiniteOrNull(snapshot.liquidityUsd, 'liquidityUsd');
  requireFiniteOrNull(snapshot.volume5mUsd, 'volume5mUsd');
  requireFiniteOrNull(snapshot.volume1hUsd, 'volume1hUsd');
  requireFiniteOrNull(snapshot.volume24hUsd, 'volume24hUsd');
  requireFiniteOrNull(snapshot.buys5m, 'buys5m');
  requireFiniteOrNull(snapshot.sells5m, 'sells5m');
  requireFiniteOrNull(snapshot.buys1h, 'buys1h');
  requireFiniteOrNull(snapshot.sells1h, 'sells1h');
  requireFiniteOrNull(snapshot.priceChange5mPct, 'priceChange5mPct');
  requireFiniteOrNull(snapshot.priceChange1hPct, 'priceChange1hPct');
  requireFiniteOrNull(snapshot.priceChange24hPct, 'priceChange24hPct');
  requireFiniteOrNull(snapshot.marketCapUsd, 'marketCapUsd');
  requireFiniteOrNull(snapshot.fdvUsd, 'fdvUsd');
}

export function assertPersistableRiskReport(report: TokenRiskReport): void {
  try {
    assertRiskReportInvariants(report);
  } catch (error: unknown) {
    if (error instanceof RiskScanError) {
      throw new PersistenceError(error.message, { cause: error });
    }

    throw error;
  }
}

export function requireSafeInteger(value: number, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new PersistenceError(`Invalid ${field}. Expected a non-negative safe integer.`);
  }

  return value;
}

export function requireSafeIntegerOrNull(value: number | null, field: string): number | null {
  return value === null ? null : requireSafeInteger(value, field);
}

export function requireBasisPointsOrNull(value: number | null, field: string): number | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 10_000) {
    throw new PersistenceError(`Invalid ${field}. Expected an integer from 0 to 10000.`);
  }

  return value;
}

export function requireRawAmountOrNull(value: string | null, field: string): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== 'string' || !RAW_AMOUNT_PATTERN.test(value)) {
    throw new PersistenceError(`Invalid ${field}. Expected a non-negative decimal integer string.`);
  }

  return value;
}

export function assertPersistableFeatureVector(vector: FeatureVector): void {
  try {
    assertFeatureVectorInvariants(vector);
    assertSourceIdentity(vector, featureSourceIdentity(vector));
  } catch (error: unknown) {
    if (error instanceof FeatureEngineError) {
      throw new PersistenceError(error.message, { cause: error });
    }

    throw error;
  }
}

export function assertPersistableStrategyEvaluation(
  evaluation: StrategyEvaluation,
  vector: FeatureVector,
): void {
  try {
    assertPersistableFeatureVector(vector);
    assertStrategyEvaluationInvariants(evaluation, vector);
  } catch (error: unknown) {
    if (error instanceof FeatureEngineError || error instanceof StrategyError) {
      throw new PersistenceError(error.message, { cause: error });
    }

    throw error;
  }

  if (evaluation.strategyDefinitionFingerprint !== STRATEGY_DEFINITION_FINGERPRINT) {
    throw new PersistenceError('Strategy definition fingerprint does not match the current s07_v1 definition.');
  }

  const expectedFeatureIdentity = featureSourceIdentity(vector);
  if (evaluation.featureSourceIdentity !== expectedFeatureIdentity) {
    throw new PersistenceError('Strategy evaluation featureSourceIdentity does not match the feature vector.');
  }

  const expectedSourceIdentity = strategySourceIdentity({
    strategyVersion: STRATEGY_VERSION,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSourceIdentity: expectedFeatureIdentity,
  });
  if (assertStrategySourceIdentity(evaluation) !== expectedSourceIdentity) {
    throw new PersistenceError('Strategy source identity does not match the canonical evaluation identity.');
  }

  const recomputed = evaluateStrategy(vector, { evaluatedAt: evaluation.evaluatedAt });
  if (
    !strategyEvaluationsSemanticallyEqual(evaluation, recomputed) ||
    evaluation.evaluatedAt !== recomputed.evaluatedAt
  ) {
    throw new PersistenceError(
      'Strategy evaluation does not match a fresh s07_v1 evaluation of the supplied feature vector.',
    );
  }
}

export function assertPersistablePaperEvaluation(
  evaluation: PaperEvaluation,
  sources: {
    marketSnapshot: MarketSnapshot;
    featureVector: FeatureVector;
    strategyEvaluation: StrategyEvaluation;
  },
): void {
  try {
    assertPersistableStrategyEvaluation(sources.strategyEvaluation, sources.featureVector);
    assertPaperEvaluationInvariants(evaluation, sources);
  } catch (error: unknown) {
    if (error instanceof FeatureEngineError || error instanceof StrategyError || error instanceof PaperError) {
      throw new PersistenceError(error.message, { cause: error });
    }
    throw error;
  }

  if (evaluation.paperSpecVersion !== PAPER_SPEC_VERSION || evaluation.paperSpecName !== PAPER_SPEC_NAME) {
    throw new PersistenceError('Paper evaluation spec does not match p09_v1.');
  }
  if (evaluation.paperDefinitionFingerprint !== PAPER_DEFINITION_FINGERPRINT) {
    throw new PersistenceError('Paper definition fingerprint does not match the current p09_v1 definition.');
  }

  const recomputed = evaluatePaperAction(sources);
  if (
    !paperEvaluationsSemanticallyEqual(evaluation, recomputed) ||
    evaluation.evaluatedAt !== recomputed.evaluatedAt
  ) {
    throw new PersistenceError(
      'Paper evaluation does not match a fresh p09_v1 evaluation of the supplied strategy bundle.',
    );
  }

  const expectedIdentity = paperSourceIdentity({
    paperSpecVersion: PAPER_SPEC_VERSION,
    paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
    strategySourceIdentity: recomputed.strategySourceIdentity,
  });
  const actualIdentity = paperSourceIdentity({
    paperSpecVersion: evaluation.paperSpecVersion,
    paperDefinitionFingerprint: evaluation.paperDefinitionFingerprint,
    strategySourceIdentity: evaluation.strategySourceIdentity,
  });
  if (actualIdentity !== expectedIdentity) {
    throw new PersistenceError('Paper source identity does not match the canonical evaluation identity.');
  }
}

export function assertPersistablePositionEvaluation(
  evaluation: PositionEvaluation,
  sources: {
    marketSnapshot: MarketSnapshot;
    featureVector: FeatureVector;
    strategyEvaluation: StrategyEvaluation;
    paperEvaluation: PaperEvaluation;
    priorOpenPosition: StoredOpenPaperPosition | null;
  },
): void {
  try {
    assertPersistablePaperEvaluation(sources.paperEvaluation, {
      marketSnapshot: sources.marketSnapshot,
      featureVector: sources.featureVector,
      strategyEvaluation: sources.strategyEvaluation,
    });
    assertPositionEvaluationInvariants(evaluation, {
      paperEvaluation: sources.paperEvaluation,
      currentOpenPosition: sources.priorOpenPosition,
    });
  } catch (error: unknown) {
    if (
      error instanceof FeatureEngineError ||
      error instanceof StrategyError ||
      error instanceof PaperError ||
      error instanceof PositionError
    ) {
      throw new PersistenceError(error.message, { cause: error });
    }
    throw error;
  }

  if (evaluation.positionSpecVersion !== POSITION_SPEC_VERSION || evaluation.positionSpecName !== POSITION_SPEC_NAME) {
    throw new PersistenceError('Position evaluation spec does not match pm10_v1.');
  }
  if (evaluation.positionDefinitionFingerprint !== POSITION_DEFINITION_FINGERPRINT) {
    throw new PersistenceError('Position definition fingerprint does not match the current pm10_v1 definition.');
  }

  const recomputed = evaluatePositionAction({
    paperEvaluation: sources.paperEvaluation,
    currentOpenPosition: sources.priorOpenPosition,
  });
  if (
    !positionEvaluationsSemanticallyEqual(evaluation, recomputed) ||
    evaluation.evaluatedAt !== recomputed.evaluatedAt
  ) {
    throw new PersistenceError(
      'Position evaluation does not match a fresh pm10_v1 evaluation of the supplied paper bundle.',
    );
  }

  const expectedIdentity = positionEvaluationSourceIdentity({
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    paperSourceIdentity: recomputed.paperSourceIdentity,
    priorOpenPositionSourceIdentity: recomputed.priorOpenPositionSourceIdentity,
  });
  if (evaluation.sourceIdentity !== expectedIdentity) {
    throw new PersistenceError('Position source identity does not match the canonical evaluation identity.');
  }
}

export function assertPersistableCandidate(candidate: DiscoveryCandidate): void {
  requireFiniteOrNull(candidate.boostAmount, 'boostAmount');
  requireFiniteOrNull(candidate.boostTotalAmount, 'boostTotalAmount');
  if (candidate.marketSnapshot !== null) {
    assertPersistableSnapshot(candidate.marketSnapshot);
  }
}
