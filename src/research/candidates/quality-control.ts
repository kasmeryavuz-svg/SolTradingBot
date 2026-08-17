import { createHash } from 'node:crypto';
import type { FeatureVector } from '../../features/types.js';
import { REQUIRED_RESEARCH_FEATURE_SET_VERSION } from '../constants.js';
import type { ResearchCandidateEvaluation } from '../types.js';
import {
  canonicalCommonGate,
  decisionFromResearchRules,
  evaluateCommonMarketRiskGate,
} from './common.js';

export const QUALITY_CONTROL_CANDIDATE_ID = 'quality_control_v1' as const;
export const QUALITY_CONTROL_CANDIDATE_VERSION = 'quality_control_v1';
export const QUALITY_CONTROL_CANDIDATE_NAME = 'market_quality_and_risk_eligibility_control';

export type CanonicalQualityControlCandidate = {
  candidateId: typeof QUALITY_CONTROL_CANDIDATE_ID;
  candidateVersion: string;
  candidateName: string;
  candidateCategory: 'internal_control';
  requiredFeatureSetVersion: string;
  commonGate: ReturnType<typeof canonicalCommonGate>;
  additionalMomentumRule: 'none';
  additionalFlowRule: 'none';
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
};

export function canonicalQualityControlCandidate(): CanonicalQualityControlCandidate {
  return {
    candidateId: QUALITY_CONTROL_CANDIDATE_ID,
    candidateVersion: QUALITY_CONTROL_CANDIDATE_VERSION,
    candidateName: QUALITY_CONTROL_CANDIDATE_NAME,
    candidateCategory: 'internal_control',
    requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
    commonGate: canonicalCommonGate(),
    additionalMomentumRule: 'none',
    additionalFlowRule: 'none',
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
  };
}

export function fingerprintQualityControlCandidate(
  definition: CanonicalQualityControlCandidate = canonicalQualityControlCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function evaluateQualityControl(vector: FeatureVector): ResearchCandidateEvaluation {
  const rules = evaluateCommonMarketRiskGate(vector);
  return {
    candidateId: QUALITY_CONTROL_CANDIDATE_ID,
    decision: decisionFromResearchRules(rules),
    rules,
  };
}
