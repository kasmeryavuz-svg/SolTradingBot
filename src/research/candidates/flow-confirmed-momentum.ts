import { createHash } from 'node:crypto';
import type { FeatureVector } from '../../features/types.js';
import {
  MIN_BUY_SHARE_5M_BPS,
  MIN_NET_BUYS_5M,
  MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
} from '../../strategy/constants.js';
import {
  FLOW_CONFIRMED_BUY_SHARE_1H_BPS_EXCLUSIVE,
  FLOW_CONFIRMED_NET_BUYS_1H_EXCLUSIVE,
  REQUIRED_RESEARCH_FEATURE_SET_VERSION,
  TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE,
} from '../constants.js';
import type { ResearchCandidateEvaluation } from '../types.js';
import {
  canonicalCommonGate,
  decisionFromResearchRules,
  evaluateCommonMarketRiskGate,
  evaluateExclusiveMinimum,
  evaluateInclusiveMinimum,
} from './common.js';

export const FLOW_CONFIRMED_MOMENTUM_CANDIDATE_ID = 'flow_confirmed_momentum_v1' as const;
export const FLOW_CONFIRMED_MOMENTUM_CANDIDATE_VERSION = 'flow_confirmed_momentum_v1';
export const FLOW_CONFIRMED_MOMENTUM_CANDIDATE_NAME = 'flow_confirmed_short_horizon_momentum_proxy';

export type CanonicalFlowConfirmedMomentumCandidate = {
  candidateId: typeof FLOW_CONFIRMED_MOMENTUM_CANDIDATE_ID;
  candidateVersion: string;
  candidateName: string;
  candidateCategory: 'research_inspired_entry_hypothesis';
  requiredFeatureSetVersion: string;
  commonGate: ReturnType<typeof canonicalCommonGate>;
  additionalRules: {
    market_price_change_5m_pct: { operator: '>'; bound: number };
    market_price_change_1h_pct: { operator: '>'; bound: number };
    volume_to_liquidity_5m_ratio: { operator: '>='; bound: number };
    buy_share_5m_bps: { operator: '>='; bound: number };
    net_buys_5m: { operator: '>='; bound: number };
    buy_share_1h_bps: { operator: '>'; bound: number };
    net_buys_1h: { operator: '>'; bound: number };
  };
  thresholdSource: 'frozen_s07_values_plus_untuned_1h_majority';
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
};

export function canonicalFlowConfirmedMomentumCandidate(): CanonicalFlowConfirmedMomentumCandidate {
  return {
    candidateId: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_ID,
    candidateVersion: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_VERSION,
    candidateName: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_NAME,
    candidateCategory: 'research_inspired_entry_hypothesis',
    requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
    commonGate: canonicalCommonGate(),
    additionalRules: {
      market_price_change_5m_pct: { operator: '>', bound: TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE },
      market_price_change_1h_pct: { operator: '>', bound: TIME_SERIES_MOMENTUM_CHANGE_EXCLUSIVE },
      volume_to_liquidity_5m_ratio: { operator: '>=', bound: MIN_VOLUME_TO_LIQUIDITY_5M_RATIO },
      buy_share_5m_bps: { operator: '>=', bound: MIN_BUY_SHARE_5M_BPS },
      net_buys_5m: { operator: '>=', bound: MIN_NET_BUYS_5M },
      buy_share_1h_bps: { operator: '>', bound: FLOW_CONFIRMED_BUY_SHARE_1H_BPS_EXCLUSIVE },
      net_buys_1h: { operator: '>', bound: FLOW_CONFIRMED_NET_BUYS_1H_EXCLUSIVE },
    },
    thresholdSource: 'frozen_s07_values_plus_untuned_1h_majority',
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
  };
}

export function fingerprintFlowConfirmedMomentumCandidate(
  definition: CanonicalFlowConfirmedMomentumCandidate = canonicalFlowConfirmedMomentumCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function evaluateFlowConfirmedMomentum(vector: FeatureVector): ResearchCandidateEvaluation {
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
    evaluateInclusiveMinimum(
      vector,
      'VOLUME_LIQUIDITY_5M_MINIMUM',
      'volume_to_liquidity_5m_ratio',
      MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
      {
        pass: '5-minute volume-to-pair-liquidity ratio meets the frozen s07 minimum.',
        fail: `5-minute volume-to-pair-liquidity ratio is below ${String(MIN_VOLUME_TO_LIQUIDITY_5M_RATIO)}.`,
      },
    ),
    evaluateInclusiveMinimum(
      vector,
      'BUY_SHARE_5M_MINIMUM',
      'buy_share_5m_bps',
      MIN_BUY_SHARE_5M_BPS,
      {
        pass: 'Observed 5-minute buy-share of trades meets the frozen s07 minimum.',
        fail: `Observed 5-minute buy-share of trades is below ${String(MIN_BUY_SHARE_5M_BPS)} bps.`,
      },
    ),
    evaluateInclusiveMinimum(vector, 'NET_BUYS_5M_MINIMUM', 'net_buys_5m', MIN_NET_BUYS_5M, {
      pass: 'Observed 5-minute net buy count meets the frozen s07 minimum.',
      fail: `Observed 5-minute net buy count is below ${String(MIN_NET_BUYS_5M)}.`,
    }),
    evaluateExclusiveMinimum(
      vector,
      'BUY_SHARE_1H_MAJORITY',
      'buy_share_1h_bps',
      FLOW_CONFIRMED_BUY_SHARE_1H_BPS_EXCLUSIVE,
      {
        pass: 'Observed 1-hour buy-share is a strict majority of trades.',
        fail: 'Observed 1-hour buy-share is not greater than 5000 bps.',
      },
    ),
    evaluateExclusiveMinimum(
      vector,
      'NET_BUYS_1H_POSITIVE',
      'net_buys_1h',
      FLOW_CONFIRMED_NET_BUYS_1H_EXCLUSIVE,
      {
        pass: 'Observed 1-hour net buy count is strictly positive.',
        fail: 'Observed 1-hour net buy count is not greater than 0.',
      },
    ),
  ];

  return {
    candidateId: FLOW_CONFIRMED_MOMENTUM_CANDIDATE_ID,
    decision: decisionFromResearchRules(rules),
    rules,
  };
}
