import { FEATURE_SET_VERSION } from '../features/definitions.js';
import { assertFeatureVectorInvariants } from '../features/invariants.js';
import { featureSourceIdentity, requireUtcTimestamp } from '../features/numbers.js';
import { FeatureEngineError, type FeatureVector } from '../features/types.js';
import { REQUIRED_FEATURE_SET_VERSION, STRATEGY_NAME, STRATEGY_VERSION } from './constants.js';
import { STRATEGY_RULE_DEFINITIONS } from './definitions.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from './identity.js';
import {
  StrategyError,
  type StrategyDecision,
  type StrategyEvaluation,
  type StrategyRuleResult,
} from './types.js';

export function wrapFeatureEngineError(error: unknown): never {
  if (error instanceof FeatureEngineError) {
    throw new StrategyError(error.message, { cause: error });
  }
  throw error;
}

export function assertEvaluatedAt(evaluatedAt: string, asOf: string): void {
  try {
    const evaluatedAtMs = requireUtcTimestamp(evaluatedAt, 'evaluatedAt');
    const asOfMs = requireUtcTimestamp(asOf, 'asOf');
    if (evaluatedAtMs < asOfMs) {
      throw new StrategyError('evaluatedAt must be at or after asOf.');
    }
  } catch (error: unknown) {
    if (error instanceof StrategyError) {
      throw error;
    }
    wrapFeatureEngineError(error);
  }
}

export function decisionFromRuleStatuses(
  rules: readonly Pick<StrategyRuleResult, 'status'>[],
): StrategyDecision {
  if (rules.some((rule) => rule.status === 'fail')) {
    return 'no_entry';
  }
  if (rules.some((rule) => rule.status === 'unavailable')) {
    return 'insufficient_data';
  }
  return 'entry_candidate';
}

export function countRuleStatuses(rules: readonly Pick<StrategyRuleResult, 'status'>[]): {
  passedRuleCount: number;
  failedRuleCount: number;
  unavailableRuleCount: number;
} {
  return {
    passedRuleCount: rules.filter((rule) => rule.status === 'pass').length,
    failedRuleCount: rules.filter((rule) => rule.status === 'fail').length,
    unavailableRuleCount: rules.filter((rule) => rule.status === 'unavailable').length,
  };
}

export function assertStrategyEvaluationInvariants(
  evaluation: StrategyEvaluation,
  vector: FeatureVector,
): void {
  try {
    assertFeatureVectorInvariants(vector);
  } catch (error: unknown) {
    wrapFeatureEngineError(error);
  }

  if (vector.featureSetVersion !== FEATURE_SET_VERSION) {
    throw new StrategyError(`Unknown feature-set version: ${vector.featureSetVersion}.`);
  }
  if ((evaluation.chain as string) !== 'solana') {
    throw new StrategyError('Strategy evaluation chain must be solana.');
  }
  if (evaluation.tokenMint !== vector.tokenMint) {
    throw new StrategyError('Strategy evaluation token mint does not match the feature vector.');
  }
  if (evaluation.strategyVersion !== STRATEGY_VERSION) {
    throw new StrategyError(`Unknown strategy version: ${evaluation.strategyVersion}.`);
  }
  if (evaluation.strategyName !== STRATEGY_NAME) {
    throw new StrategyError('Strategy name does not match conservative_flow_momentum_baseline.');
  }
  if (evaluation.featureSetVersion !== REQUIRED_FEATURE_SET_VERSION) {
    throw new StrategyError(`Unknown feature-set version: ${evaluation.featureSetVersion}.`);
  }
  if (evaluation.strategyDefinitionFingerprint !== STRATEGY_DEFINITION_FINGERPRINT) {
    throw new StrategyError('Strategy definition fingerprint does not match the current s07_v1 definition.');
  }
  if (evaluation.featureSourceIdentity !== featureSourceIdentity(vector)) {
    throw new StrategyError('Strategy evaluation featureSourceIdentity does not match the feature vector.');
  }
  if (evaluation.asOf !== vector.asOf) {
    throw new StrategyError('Strategy evaluation asOf must equal the feature vector asOf.');
  }
  assertEvaluatedAt(evaluation.evaluatedAt, evaluation.asOf);

  if (evaluation.rules.length !== STRATEGY_RULE_DEFINITIONS.length) {
    throw new StrategyError('Strategy evaluation must contain exactly one result per registered rule.');
  }

  const codes = new Set<string>();
  for (const [index, definition] of STRATEGY_RULE_DEFINITIONS.entries()) {
    const result = evaluation.rules[index];
    if (result === undefined || result.ruleCode !== definition.code) {
      throw new StrategyError('Strategy rule results must follow the s07_v1 registry order.');
    }
    if (result.ordinal !== index + 1) {
      throw new StrategyError('Strategy rule ordinals must follow the s07_v1 registry order.');
    }
    if (codes.has(result.ruleCode)) {
      throw new StrategyError('Strategy evaluation contains duplicate rule codes.');
    }
    codes.add(result.ruleCode);
    if (result.category !== definition.category) {
      throw new StrategyError(`Strategy rule ${result.ruleCode} has the wrong category.`);
    }
    if (result.criterion !== definition.criterion) {
      throw new StrategyError(`Strategy rule ${result.ruleCode} has the wrong criterion.`);
    }
    if (result.description !== definition.description) {
      throw new StrategyError(`Strategy rule ${result.ruleCode} has the wrong description.`);
    }
    assertRuleStatus(result.status, result.ruleCode);
    if (result.observed.trim() === '' || result.reason.trim() === '') {
      throw new StrategyError(`Strategy rule ${result.ruleCode} is missing observed text or a reason.`);
    }
  }

  const counts = countRuleStatuses(evaluation.rules);
  if (
    evaluation.passedRuleCount !== counts.passedRuleCount ||
    evaluation.failedRuleCount !== counts.failedRuleCount ||
    evaluation.unavailableRuleCount !== counts.unavailableRuleCount
  ) {
    throw new StrategyError('Strategy rule counts do not match the stored rule statuses.');
  }
  if (
    evaluation.passedRuleCount + evaluation.failedRuleCount + evaluation.unavailableRuleCount !==
    STRATEGY_RULE_DEFINITIONS.length
  ) {
    throw new StrategyError('passed + failed + unavailable rule counts must equal the registry size.');
  }

  const expectedDecision = decisionFromRuleStatuses(evaluation.rules);
  if (evaluation.decision !== expectedDecision) {
    throw new StrategyError('Strategy decision does not match the stored rule statuses.');
  }
}

export function assertStrategySourceIdentity(evaluation: StrategyEvaluation): string {
  const expected = strategySourceIdentity({
    strategyVersion: evaluation.strategyVersion,
    strategyDefinitionFingerprint: evaluation.strategyDefinitionFingerprint,
    featureSourceIdentity: evaluation.featureSourceIdentity,
  });
  return expected;
}

export function strategyRuleResultsEqual(
  left: readonly StrategyRuleResult[],
  right: readonly StrategyRuleResult[],
): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((result, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      result.ordinal === other.ordinal &&
      result.ruleCode === other.ruleCode &&
      result.category === other.category &&
      result.status === other.status &&
      result.description === other.description &&
      result.criterion === other.criterion &&
      result.observed === other.observed &&
      result.reason === other.reason
    );
  });
}

export function strategyEvaluationsSemanticallyEqual(
  left: Pick<
    StrategyEvaluation,
    | 'decision'
    | 'passedRuleCount'
    | 'failedRuleCount'
    | 'unavailableRuleCount'
    | 'strategyVersion'
    | 'strategyName'
    | 'strategyDefinitionFingerprint'
    | 'featureSetVersion'
    | 'featureSourceIdentity'
    | 'asOf'
    | 'tokenMint'
    | 'rules'
  >,
  right: typeof left,
): boolean {
  return (
    left.decision === right.decision &&
    left.passedRuleCount === right.passedRuleCount &&
    left.failedRuleCount === right.failedRuleCount &&
    left.unavailableRuleCount === right.unavailableRuleCount &&
    left.strategyVersion === right.strategyVersion &&
    left.strategyName === right.strategyName &&
    left.strategyDefinitionFingerprint === right.strategyDefinitionFingerprint &&
    left.featureSetVersion === right.featureSetVersion &&
    left.featureSourceIdentity === right.featureSourceIdentity &&
    left.asOf === right.asOf &&
    left.tokenMint === right.tokenMint &&
    strategyRuleResultsEqual(left.rules, right.rules)
  );
}

function assertRuleStatus(status: string, ruleCode: string): void {
  const validStatuses = ['pass', 'fail', 'unavailable'];
  if (!validStatuses.includes(status)) {
    throw new StrategyError(`Strategy rule ${ruleCode} has an invalid status.`);
  }
}
