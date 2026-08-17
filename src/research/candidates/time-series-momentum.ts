import { createHash } from 'node:crypto';
import type { FeatureVector } from '../../features/types.js';
import {
  REQUIRED_RESEARCH_FEATURE_SET_VERSION,
  TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE,
} from '../constants.js';
import type { ResearchCandidateEvaluation } from '../types.js';
import {
  canonicalCommonGate,
  decisionFromResearchRules,
  evaluateCommonMarketRiskGate,
  evaluateExclusiveMinimum,
} from './common.js';

export const TIME_SERIES_MOMENTUM_CANDIDATE_ID = 'time_series_momentum_v1' as const;
export const TIME_SERIES_MOMENTUM_CANDIDATE_VERSION = 'time_series_momentum_v1';
export const TIME_SERIES_MOMENTUM_CANDIDATE_NAME = 'multi_horizon_provider_window_momentum_proxy';

export type CanonicalTimeSeriesMomentumCandidate = {
  candidateId: typeof TIME_SERIES_MOMENTUM_CANDIDATE_ID;
  candidateVersion: string;
  candidateName: string;
  candidateCategory: 'research_inspired_entry_hypothesis';
  requiredFeatureSetVersion: string;
  commonGate: ReturnType<typeof canonicalCommonGate>;
  momentumRules: {
    market_price_change_5m_pct: { operator: '>'; bound: number };
    market_price_change_1h_pct: { operator: '>'; bound: number };
    market_price_change_24h_pct: { operator: '>'; bound: number };
  };
  magnitudeOptimization: 'none';
  academicPortfolioReproduction: false;
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
};

export function canonicalTimeSeriesMomentumCandidate(): CanonicalTimeSeriesMomentumCandidate {
  return {
    candidateId: TIME_SERIES_MOMENTUM_CANDIDATE_ID,
    candidateVersion: TIME_SERIES_MOMENTUM_CANDIDATE_VERSION,
    candidateName: TIME_SERIES_MOMENTUM_CANDIDATE_NAME,
    candidateCategory: 'research_inspired_entry_hypothesis',
    requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
    commonGate: canonicalCommonGate(),
    momentumRules: {
      market_price_change_5m_pct: { operator: '>', bound: TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE },
      market_price_change_1h_pct: { operator: '>', bound: TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE },
      market_price_change_24h_pct: { operator: '>', bound: TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE },
    },
    magnitudeOptimization: 'none',
    academicPortfolioReproduction: false,
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
  };
}

export function fingerprintTimeSeriesMomentumCandidate(
  definition: CanonicalTimeSeriesMomentumCandidate = canonicalTimeSeriesMomentumCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function evaluateTimeSeriesMomentum(vector: FeatureVector): ResearchCandidateEvaluation {
  const rules = [
    ...evaluateCommonMarketRiskGate(vector),
    evaluateExclusiveMinimum(
      vector,
      'PRICE_CHANGE_5M_POSITIVE',
      'market_price_change_5m_pct',
      TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE,
      {
        pass: 'Provider 5-minute price change is strictly positive.',
        fail: 'Provider 5-minute price change is not greater than 0.',
      },
    ),
    evaluateExclusiveMinimum(
      vector,
      'PRICE_CHANGE_1H_POSITIVE',
      'market_price_change_1h_pct',
      TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE,
      {
        pass: 'Provider 1-hour price change is strictly positive.',
        fail: 'Provider 1-hour price change is not greater than 0.',
      },
    ),
    evaluateExclusiveMinimum(
      vector,
      'PRICE_CHANGE_24H_POSITIVE',
      'market_price_change_24h_pct',
      TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE,
      {
        pass: 'Provider 24-hour price change is strictly positive.',
        fail: 'Provider 24-hour price change is not greater than 0.',
      },
    ),
  ];

  return {
    candidateId: TIME_SERIES_MOMENTUM_CANDIDATE_ID,
    decision: decisionFromResearchRules(rules),
    rules,
  };
}
