import type { FeatureVector } from '../features/types.js';
import {
  evaluateFlowConfirmedMomentum,
  fingerprintFlowConfirmedMomentumCandidate,
  FLOW_CONFIRMED_MOMENTUM_CANDIDATE_ID,
  FLOW_CONFIRMED_MOMENTUM_CANDIDATE_NAME,
  FLOW_CONFIRMED_MOMENTUM_CANDIDATE_VERSION,
} from './candidates/flow-confirmed-momentum.js';
import {
  evaluateQualityControl,
  fingerprintQualityControlCandidate,
  QUALITY_CONTROL_CANDIDATE_ID,
  QUALITY_CONTROL_CANDIDATE_NAME,
  QUALITY_CONTROL_CANDIDATE_VERSION,
} from './candidates/quality-control.js';
import {
  evaluateRunnerFriendlyMomentum,
  fingerprintRunnerFriendlyMomentumCandidate,
  RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_ID,
  RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_NAME,
  RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_VERSION,
} from './candidates/runner-friendly-momentum.js';
import {
  evaluateS07Baseline,
  fingerprintS07BaselineCandidate,
  S07_BASELINE_CANDIDATE_ID,
  S07_BASELINE_CANDIDATE_NAME,
  S07_BASELINE_CANDIDATE_VERSION,
} from './candidates/s07-baseline.js';
import {
  evaluateTimeSeriesMomentum,
  fingerprintTimeSeriesMomentumCandidate,
  TIME_SERIES_MOMENTUM_CANDIDATE_ID,
  TIME_SERIES_MOMENTUM_CANDIDATE_NAME,
  TIME_SERIES_MOMENTUM_CANDIDATE_VERSION,
} from './candidates/time-series-momentum.js';
import { REQUIRED_RESEARCH_FEATURE_SET_VERSION } from './constants.js';
import {
  ResearchError,
  RESEARCH_CANDIDATE_IDS,
  type ResearchCandidateDescriptor,
  type ResearchCandidateEvaluation,
  type ResearchCandidateId,
} from './types.js';

const EVALUATORS: Record<
  ResearchCandidateId,
  (vector: FeatureVector) => ResearchCandidateEvaluation
> = {
  s07_baseline: evaluateS07Baseline,
  quality_control_v1: evaluateQualityControl,
  time_series_momentum_v1: evaluateTimeSeriesMomentum,
  flow_confirmed_momentum_v1: evaluateFlowConfirmedMomentum,
  runner_friendly_momentum_v1: evaluateRunnerFriendlyMomentum,
};

export function listResearchCandidateDescriptors(): ResearchCandidateDescriptor[] {
  return [
    {
      candidateId: S07_BASELINE_CANDIDATE_ID,
      candidateVersion: S07_BASELINE_CANDIDATE_VERSION,
      candidateName: S07_BASELINE_CANDIDATE_NAME,
      candidateCategory: 'frozen_control_baseline',
      description:
        'Calls the frozen s07_v1 evaluator unchanged. This is the control baseline, not a new strategy implementation.',
      requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
      candidateDefinitionFingerprint: fingerprintS07BaselineCandidate(),
      sourceRationale:
        'Internal frozen Checkpoint 07 classifier. Used so later hypotheses are compared against the existing experimental strategy rather than against a rewritten copy.',
      inspirationKind: 'frozen_internal_baseline',
      externalReproduction: 'none',
    },
    {
      candidateId: QUALITY_CONTROL_CANDIDATE_ID,
      candidateVersion: QUALITY_CONTROL_CANDIDATE_VERSION,
      candidateName: QUALITY_CONTROL_CANDIDATE_NAME,
      candidateCategory: 'internal_control',
      description:
        'Entry candidate iff the common market/risk eligibility gate passes. No momentum or flow overlay. Control only.',
      requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
      candidateDefinitionFingerprint: fingerprintQualityControlCandidate(),
      sourceRationale:
        'Internal control. Asks whether additional momentum or flow rules add anything beyond a basic safe/liquid eligibility screen.',
      inspirationKind: 'internal_control',
      externalReproduction: 'none',
    },
    {
      candidateId: TIME_SERIES_MOMENTUM_CANDIDATE_ID,
      candidateVersion: TIME_SERIES_MOMENTUM_CANDIDATE_VERSION,
      candidateName: TIME_SERIES_MOMENTUM_CANDIDATE_NAME,
      candidateCategory: 'research_inspired_entry_hypothesis',
      description:
        'Common gate plus strictly positive provider 5m, 1h, and 24h price-change windows. Not an academic portfolio.',
      requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
      candidateDefinitionFingerprint: fingerprintTimeSeriesMomentumCandidate(),
      sourceRationale:
        'Concept inspired by time-series momentum literature and Freqtrade trend/momentum ideas. Uses only c06_v1 provider windows. Not a faithful reproduction of any paper or Freqtrade strategy.',
      inspirationKind: 'concept_inspired_by',
      externalReproduction: 'not_a_faithful_reproduction',
    },
    {
      candidateId: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_ID,
      candidateVersion: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_VERSION,
      candidateName: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_NAME,
      candidateCategory: 'research_inspired_entry_hypothesis',
      description:
        'Common gate plus short-horizon positive price change, frozen s07 5m flow minima, and a simple 1h buy-majority overlay.',
      requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
      candidateDefinitionFingerprint: fingerprintFlowConfirmedMomentumCandidate(),
      sourceRationale:
        'Internal hypothesis using c06 buy-share, net-buys, and volume-to-liquidity features. Thresholds reuse frozen s07 5m values; 1h majority is directional only. Not copied from Freqtrade or Hummingbot.',
      inspirationKind: 'concept_inspired_by',
      externalReproduction: 'not_a_faithful_reproduction',
    },
    {
      candidateId: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_ID,
      candidateVersion: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_VERSION,
      candidateName: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_NAME,
      candidateCategory: 'ablation_hypothesis',
      description:
        's07-like entry requirements without the +20% 5-minute momentum cap. Does not change the shared x11 +20% take-profit exit.',
      requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
      candidateDefinitionFingerprint: fingerprintRunnerFriendlyMomentumCandidate(),
      sourceRationale:
        'Ablation of frozen s07. Tests whether the 5-minute upper momentum cap discards strong runners at ENTRY time. It is not an assertion that chasing pumps is a live strategy.',
      inspirationKind: 'internal_control',
      externalReproduction: 'none',
    },
  ];
}

export function requireResearchCandidateId(value: string): ResearchCandidateId {
  if (isResearchCandidateId(value)) {
    return value;
  }
  throw new ResearchError(
    `Unknown research candidate: ${value}. Expected one of: ${RESEARCH_CANDIDATE_IDS.join(', ')}.`,
  );
}

export function isResearchCandidateId(value: string): value is ResearchCandidateId {
  return (RESEARCH_CANDIDATE_IDS as readonly string[]).includes(value);
}

export function getResearchCandidateDescriptor(candidateId: ResearchCandidateId): ResearchCandidateDescriptor {
  const found = listResearchCandidateDescriptors().find((item) => item.candidateId === candidateId);
  if (found === undefined) {
    throw new ResearchError(`Research candidate ${candidateId} is missing from the frozen registry.`);
  }
  return found;
}

export function evaluateRegisteredCandidate(
  candidateId: ResearchCandidateId,
  vector: FeatureVector,
): ResearchCandidateEvaluation {
  return EVALUATORS[candidateId](vector);
}

export function frozenCandidateFingerprintRecords(): readonly {
  candidateId: ResearchCandidateId;
  candidateDefinitionFingerprint: string;
}[] {
  return listResearchCandidateDescriptors().map((candidate) => ({
    candidateId: candidate.candidateId,
    candidateDefinitionFingerprint: candidate.candidateDefinitionFingerprint,
  }));
}
