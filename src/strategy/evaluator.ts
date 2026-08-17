import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { assertFeatureVectorInvariants } from '../features/invariants.js';
import { featureSourceIdentity } from '../features/numbers.js';
import type { FeatureVector } from '../features/types.js';
import { REQUIRED_FEATURE_SET_VERSION, STRATEGY_NAME, STRATEGY_VERSION } from './constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from './identity.js';
import {
  assertEvaluatedAt,
  countRuleStatuses,
  decisionFromRuleStatuses,
  wrapFeatureEngineError,
} from './invariants.js';
import { evaluateStrategyRules } from './rules.js';
import { StrategyError, type StrategyEvaluation } from './types.js';

export function evaluateStrategy(
  featureVector: FeatureVector,
  options: { evaluatedAt: string },
): StrategyEvaluation {
  try {
    assertFeatureVectorInvariants(featureVector);
  } catch (error: unknown) {
    wrapFeatureEngineError(error);
  }

  if (featureVector.featureSetVersion !== FEATURE_SET_VERSION) {
    throw new StrategyError(`Unknown feature-set version: ${featureVector.featureSetVersion}.`);
  }

  assertEvaluatedAt(options.evaluatedAt, featureVector.asOf);

  const rules = evaluateStrategyRules(featureVector);
  const counts = countRuleStatuses(rules);

  return {
    chain: 'solana',
    tokenMint: featureVector.tokenMint,
    strategyVersion: STRATEGY_VERSION,
    strategyName: STRATEGY_NAME,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSetVersion: REQUIRED_FEATURE_SET_VERSION,
    featureSourceIdentity: featureSourceIdentity(featureVector),
    evaluatedAt: options.evaluatedAt,
    asOf: featureVector.asOf,
    decision: decisionFromRuleStatuses(rules),
    passedRuleCount: counts.passedRuleCount,
    failedRuleCount: counts.failedRuleCount,
    unavailableRuleCount: counts.unavailableRuleCount,
    rules,
  };
}
