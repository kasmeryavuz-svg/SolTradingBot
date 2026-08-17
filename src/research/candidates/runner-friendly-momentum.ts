import { createHash } from 'node:crypto';
import type { FeatureVector } from '../../features/types.js';
import {
  MIN_BUY_SHARE_5M_BPS,
  MIN_NET_BUYS_5M,
  MIN_PRICE_CHANGE_5M_PCT,
  MIN_VOLUME_TO_LIQUIDITY_5M_RATIO,
} from '../../strategy/constants.js';
import { REQUIRED_RESEARCH_FEATURE_SET_VERSION } from '../constants.js';
import type { ResearchCandidateEvaluation } from '../types.js';
import {
  canonicalCommonGate,
  decisionFromResearchRules,
  evaluateCommonMarketRiskGate,
  evaluateInclusiveMinimum,
} from './common.js';

export const RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_ID = 'runner_friendly_momentum_v1' as const;
export const RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_VERSION = 'runner_friendly_momentum_v1';
export const RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_NAME = 's07_entry_ablation_without_5m_momentum_cap';

export type CanonicalRunnerFriendlyMomentumCandidate = {
  candidateId: typeof RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_ID;
  candidateVersion: string;
  candidateName: string;
  candidateCategory: 'ablation_hypothesis';
  requiredFeatureSetVersion: string;
  commonGate: ReturnType<typeof canonicalCommonGate>;
  additionalRules: {
    volume_to_liquidity_5m_ratio: { operator: '>='; bound: number };
    buy_share_5m_bps: { operator: '>='; bound: number };
    net_buys_5m: { operator: '>='; bound: number };
    market_price_change_5m_pct: { operator: '>='; bound: number; maximum: 'none' };
  };
  s07MaxPriceChange5mPctRemoved: true;
  s07ItselfUnchanged: true;
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
};

export function canonicalRunnerFriendlyMomentumCandidate(): CanonicalRunnerFriendlyMomentumCandidate {
  return {
    candidateId: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_ID,
    candidateVersion: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_VERSION,
    candidateName: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_NAME,
    candidateCategory: 'ablation_hypothesis',
    requiredFeatureSetVersion: REQUIRED_RESEARCH_FEATURE_SET_VERSION,
    commonGate: canonicalCommonGate(),
    additionalRules: {
      volume_to_liquidity_5m_ratio: { operator: '>=', bound: MIN_VOLUME_TO_LIQUIDITY_5M_RATIO },
      buy_share_5m_bps: { operator: '>=', bound: MIN_BUY_SHARE_5M_BPS },
      net_buys_5m: { operator: '>=', bound: MIN_NET_BUYS_5M },
      market_price_change_5m_pct: {
        operator: '>=',
        bound: MIN_PRICE_CHANGE_5M_PCT,
        maximum: 'none',
      },
    },
    s07MaxPriceChange5mPctRemoved: true,
    s07ItselfUnchanged: true,
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
  };
}

export function fingerprintRunnerFriendlyMomentumCandidate(
  definition: CanonicalRunnerFriendlyMomentumCandidate = canonicalRunnerFriendlyMomentumCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function evaluateRunnerFriendlyMomentum(vector: FeatureVector): ResearchCandidateEvaluation {
  const rules = [
    ...evaluateCommonMarketRiskGate(vector),
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
    evaluateInclusiveMinimum(
      vector,
      'PRICE_CHANGE_5M_MINIMUM_NO_MAX',
      'market_price_change_5m_pct',
      MIN_PRICE_CHANGE_5M_PCT,
      {
        pass: 'Provider 5-minute price change meets the s07 minimum with no upper cap.',
        fail: `Provider 5-minute price change is below ${String(MIN_PRICE_CHANGE_5M_PCT)}.`,
      },
    ),
  ];

  return {
    candidateId: RUNNER_FRIENDLY_MOMENTUM_CANDIDATE_ID,
    decision: decisionFromResearchRules(rules),
    rules,
  };
}
