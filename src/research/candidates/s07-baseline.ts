import { createHash } from 'node:crypto';
import type { FeatureVector } from '../../features/types.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../../strategy/identity.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from '../../strategy/constants.js';
import { evaluateStrategy } from '../../strategy/evaluator.js';
import { FROZEN_S07_V1_DEFINITION_FINGERPRINT, REQUIRED_RESEARCH_FEATURE_SET_VERSION } from '../constants.js';
import { ResearchError, type ResearchCandidateEvaluation } from '../types.js';

export const S07_BASELINE_CANDIDATE_ID = 's07_baseline' as const;
export const S07_BASELINE_CANDIDATE_VERSION = STRATEGY_VERSION;
export const S07_BASELINE_CANDIDATE_NAME = 'frozen_s07_v1_control_baseline';

export type CanonicalS07BaselineCandidate = {
  candidateId: typeof S07_BASELINE_CANDIDATE_ID;
  candidateVersion: string;
  candidateName: string;
  candidateCategory: 'frozen_control_baseline';
  requiredFeatureSetVersion: string;
  implementation: 'delegate_to_frozen_evaluateStrategy';
  frozenS07StrategyName: string;
  frozenS07DefinitionFingerprint: string;
  noReimplementation: true;
  frozenS07DecisionPrecedence: 'frozen_s07_fail_over_unavailable';
  noScoreSemantics: true;
};

export function canonicalS07BaselineCandidate(): CanonicalS07BaselineCandidate {
  return {
    candidateId: S07_BASELINE_CANDIDATE_ID,
    candidateVersion: S07_BASELINE_CANDIDATE_VERSION,
    candidateName: S07_BASELINE_CANDIDATE_NAME,
    candidateCategory: 'frozen_control_baseline',
    requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
    implementation: 'delegate_to_frozen_evaluateStrategy',
    frozenS07StrategyName: STRATEGY_NAME,
    frozenS07DefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    noReimplementation: true,
    frozenS07DecisionPrecedence: 'frozen_s07_fail_over_unavailable',
    noScoreSemantics: true,
  };
}

export function fingerprintS07BaselineCandidate(): string {
  if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
    throw new ResearchError('s07_baseline must bind to the frozen s07_v1 definition fingerprint.');
  }
  return STRATEGY_DEFINITION_FINGERPRINT;
}

export function evaluateS07Baseline(vector: FeatureVector): ResearchCandidateEvaluation {
  const evaluation = evaluateStrategy(vector, { evaluatedAt: vector.asOf });
  return {
    candidateId: S07_BASELINE_CANDIDATE_ID,
    decision: evaluation.decision,
    rules: evaluation.rules.map((rule) => ({
      code: rule.ruleCode,
      status: rule.status,
      observed: rule.observed,
      reason: rule.reason,
    })),
  };
}

export function wrapperFingerprintIsNotUsedAsStrategyFingerprint(): string {
  return createHash('sha256')
    .update(JSON.stringify(canonicalS07BaselineCandidate()), 'utf8')
    .digest('hex');
}
