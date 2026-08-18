import { createHash } from 'node:crypto';
import type { FeatureVector } from '../features/types.js';
import { BLOCKING_RISK_FEATURES, MIN_PRICE_USD_EXCLUSIVE } from '../strategy/constants.js';
import {
  canonicalCommonGate,
  decisionFromResearchRules,
  evaluateBlockingRiskFindings,
  evaluateCommonMarketRiskGate,
  evaluateExclusiveMinimum,
  evaluateInclusiveMinimum,
  evaluateInclusiveRange,
} from '../research/candidates/common.js';
import { evaluateFlowConfirmedMomentum } from '../research/candidates/flow-confirmed-momentum.js';
import { evaluateQualityControl } from '../research/candidates/quality-control.js';
import { evaluateRunnerFriendlyMomentum } from '../research/candidates/runner-friendly-momentum.js';
import { evaluateS07Baseline } from '../research/candidates/s07-baseline.js';
import { evaluateTimeSeriesMomentum } from '../research/candidates/time-series-momentum.js';
import { getResearchCandidateDescriptor } from '../research/catalog.js';
import type { ResearchCandidateEvaluation } from '../research/types.js';
import {
  FLOW_QUALITY_BUY_SHARE_1H_BPS_EXCLUSIVE,
  FLOW_QUALITY_MAX_MARKET_AGE_SECONDS,
  FLOW_QUALITY_MAX_PAIR_AGE_SECONDS,
  FLOW_QUALITY_MAX_PRICE_CHANGE_5M_PCT,
  FLOW_QUALITY_MIN_BUY_SHARE_5M_BPS,
  FLOW_QUALITY_MIN_LIQUIDITY_USD,
  FLOW_QUALITY_MIN_MARKET_AGE_SECONDS,
  FLOW_QUALITY_MIN_NET_BUYS_5M,
  FLOW_QUALITY_MIN_PAIR_AGE_SECONDS,
  FLOW_QUALITY_MIN_PRICE_CHANGE_5M_PCT,
  FLOW_QUALITY_MIN_TRADES_5M,
  FLOW_QUALITY_MIN_VOLUME_TO_LIQUIDITY_5M,
  FLOW_QUALITY_NET_BUYS_1H_EXCLUSIVE,
  QUALITY_LIQUID_MAX_PAIR_AGE_SECONDS,
  QUALITY_LIQUID_MIN_LIQUIDITY_USD,
  QUALITY_LIQUID_MIN_PAIR_AGE_SECONDS,
  QUALITY_LIQUID_MIN_TRADES_5M,
  REQUIRED_OPTIMIZATION_FEATURE_SET_VERSION,
  RUNNER_FLOW_MAX_MARKET_AGE_SECONDS,
  RUNNER_FLOW_MAX_PAIR_AGE_SECONDS,
  RUNNER_FLOW_MIN_BUY_SHARE_5M_BPS,
  RUNNER_FLOW_MIN_LIQUIDITY_USD,
  RUNNER_FLOW_MIN_MARKET_AGE_SECONDS,
  RUNNER_FLOW_MIN_NET_BUYS_5M,
  RUNNER_FLOW_MIN_PAIR_AGE_SECONDS,
  RUNNER_FLOW_MIN_PRICE_CHANGE_5M_PCT,
  RUNNER_FLOW_MIN_TRADES_5M,
  RUNNER_FLOW_MIN_VOLUME_TO_LIQUIDITY_5M,
  RUNNER_FLOW_PRICE_CHANGE_1H_EXCLUSIVE,
} from './constants.js';
import {
  OptimizationError,
  OPTIMIZATION_ENTRY_CANDIDATE_IDS,
  type OptimizationDecision,
  type OptimizationEntryCandidateId,
  type OptimizationRuleEvidence,
} from './types.js';

export type OptimizationEntryEvaluation = {
  candidateId: OptimizationEntryCandidateId;
  decision: OptimizationDecision;
  rules: readonly OptimizationRuleEvidence[];
};

export type CanonicalQualityLiquidCandidate = {
  candidateId: 'quality_liquid_v1';
  candidateVersion: 'quality_liquid_v1';
  candidateName: 'deeper_liquidity_and_activity_quality_overlay';
  candidateCategory: 'cp17_pre_registered_entry_hypothesis';
  requiredFeatureSetVersion: string;
  commonGate: ReturnType<typeof canonicalCommonGate>;
  additionalRequirements: {
    liquidity_usd: { operator: '>='; bound: number };
    pair_age_seconds: { minOperator: '>='; min: number; maxOperator: '<='; max: number };
    trades_5m: { operator: '>='; bound: number };
    additionalMomentumRule: 'none';
  };
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
  noEnvironmentThresholds: true;
};

export type CanonicalFlowQualityCandidate = {
  candidateId: 'flow_quality_v1';
  candidateVersion: 'flow_quality_v1';
  candidateName: 'liquid_flow_confirmed_capped_momentum';
  candidateCategory: 'cp17_pre_registered_entry_hypothesis';
  requiredFeatureSetVersion: string;
  riskBlockers: {
    features: readonly string[];
    requiredStatus: 'available';
    requiredValue: false;
    unavailableBehavior: 'insufficient_data';
  };
  requirements: {
    price_usd: { operator: '>'; bound: number };
    liquidity_usd: { operator: '>='; bound: number };
    pair_age_seconds: { minOperator: '>='; min: number; maxOperator: '<='; max: number };
    market_age_seconds: { minOperator: '>='; min: number; maxOperator: '<='; max: number };
    trades_5m: { operator: '>='; bound: number };
    volume_to_liquidity_5m: { operator: '>='; bound: number };
    buy_share_5m_bps: { operator: '>='; bound: number };
    net_buys_5m: { operator: '>='; bound: number };
    price_change_5m_pct: { minOperator: '>='; min: number; maxOperator: '<='; max: number };
    buy_share_1h_bps: { operator: '>'; bound: number };
    net_buys_1h: { operator: '>'; bound: number };
  };
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
  noEnvironmentThresholds: true;
};

export type CanonicalRunnerFlowCandidate = {
  candidateId: 'runner_flow_v1';
  candidateVersion: 'runner_flow_v1';
  candidateName: 'stronger_flow_uncapped_5m_runner';
  candidateCategory: 'cp17_pre_registered_entry_hypothesis';
  requiredFeatureSetVersion: string;
  riskBlockers: {
    features: readonly string[];
    requiredStatus: 'available';
    requiredValue: false;
    unavailableBehavior: 'insufficient_data';
  };
  requirements: {
    price_usd: { operator: '>'; bound: number };
    liquidity_usd: { operator: '>='; bound: number };
    pair_age_seconds: { minOperator: '>='; min: number; maxOperator: '<='; max: number };
    market_age_seconds: { minOperator: '>='; min: number; maxOperator: '<='; max: number };
    trades_5m: { operator: '>='; bound: number };
    volume_to_liquidity_5m: { operator: '>='; bound: number };
    buy_share_5m_bps: { operator: '>='; bound: number };
    net_buys_5m: { operator: '>='; bound: number };
    price_change_5m_pct: { operator: '>='; bound: number; maximum: 'none' };
    price_change_1h_pct: { operator: '>'; bound: number };
  };
  requiredDataPrecedence: 'unavailable_over_fail';
  unavailableRequiredFeature: 'insufficient_data';
  noScoreSemantics: true;
  noEnvironmentThresholds: true;
};

export function canonicalQualityLiquidCandidate(): CanonicalQualityLiquidCandidate {
  return {
    candidateId: 'quality_liquid_v1',
    candidateVersion: 'quality_liquid_v1',
    candidateName: 'deeper_liquidity_and_activity_quality_overlay',
    candidateCategory: 'cp17_pre_registered_entry_hypothesis',
    requiredFeatureSetVersion: REQUIRED_OPTIMIZATION_FEATURE_SET_VERSION,
    commonGate: canonicalCommonGate(),
    additionalRequirements: {
      liquidity_usd: { operator: '>=', bound: QUALITY_LIQUID_MIN_LIQUIDITY_USD },
      pair_age_seconds: {
        minOperator: '>=',
        min: QUALITY_LIQUID_MIN_PAIR_AGE_SECONDS,
        maxOperator: '<=',
        max: QUALITY_LIQUID_MAX_PAIR_AGE_SECONDS,
      },
      trades_5m: { operator: '>=', bound: QUALITY_LIQUID_MIN_TRADES_5M },
      additionalMomentumRule: 'none',
    },
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
    noEnvironmentThresholds: true,
  };
}

export function canonicalFlowQualityCandidate(): CanonicalFlowQualityCandidate {
  return {
    candidateId: 'flow_quality_v1',
    candidateVersion: 'flow_quality_v1',
    candidateName: 'liquid_flow_confirmed_capped_momentum',
    candidateCategory: 'cp17_pre_registered_entry_hypothesis',
    requiredFeatureSetVersion: REQUIRED_OPTIMIZATION_FEATURE_SET_VERSION,
    riskBlockers: {
      features: [...BLOCKING_RISK_FEATURES],
      requiredStatus: 'available',
      requiredValue: false,
      unavailableBehavior: 'insufficient_data',
    },
    requirements: {
      price_usd: { operator: '>', bound: MIN_PRICE_USD_EXCLUSIVE },
      liquidity_usd: { operator: '>=', bound: FLOW_QUALITY_MIN_LIQUIDITY_USD },
      pair_age_seconds: {
        minOperator: '>=',
        min: FLOW_QUALITY_MIN_PAIR_AGE_SECONDS,
        maxOperator: '<=',
        max: FLOW_QUALITY_MAX_PAIR_AGE_SECONDS,
      },
      market_age_seconds: {
        minOperator: '>=',
        min: FLOW_QUALITY_MIN_MARKET_AGE_SECONDS,
        maxOperator: '<=',
        max: FLOW_QUALITY_MAX_MARKET_AGE_SECONDS,
      },
      trades_5m: { operator: '>=', bound: FLOW_QUALITY_MIN_TRADES_5M },
      volume_to_liquidity_5m: { operator: '>=', bound: FLOW_QUALITY_MIN_VOLUME_TO_LIQUIDITY_5M },
      buy_share_5m_bps: { operator: '>=', bound: FLOW_QUALITY_MIN_BUY_SHARE_5M_BPS },
      net_buys_5m: { operator: '>=', bound: FLOW_QUALITY_MIN_NET_BUYS_5M },
      price_change_5m_pct: {
        minOperator: '>=',
        min: FLOW_QUALITY_MIN_PRICE_CHANGE_5M_PCT,
        maxOperator: '<=',
        max: FLOW_QUALITY_MAX_PRICE_CHANGE_5M_PCT,
      },
      buy_share_1h_bps: { operator: '>', bound: FLOW_QUALITY_BUY_SHARE_1H_BPS_EXCLUSIVE },
      net_buys_1h: { operator: '>', bound: FLOW_QUALITY_NET_BUYS_1H_EXCLUSIVE },
    },
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
    noEnvironmentThresholds: true,
  };
}

export function canonicalRunnerFlowCandidate(): CanonicalRunnerFlowCandidate {
  return {
    candidateId: 'runner_flow_v1',
    candidateVersion: 'runner_flow_v1',
    candidateName: 'stronger_flow_uncapped_5m_runner',
    candidateCategory: 'cp17_pre_registered_entry_hypothesis',
    requiredFeatureSetVersion: REQUIRED_OPTIMIZATION_FEATURE_SET_VERSION,
    riskBlockers: {
      features: [...BLOCKING_RISK_FEATURES],
      requiredStatus: 'available',
      requiredValue: false,
      unavailableBehavior: 'insufficient_data',
    },
    requirements: {
      price_usd: { operator: '>', bound: MIN_PRICE_USD_EXCLUSIVE },
      liquidity_usd: { operator: '>=', bound: RUNNER_FLOW_MIN_LIQUIDITY_USD },
      pair_age_seconds: {
        minOperator: '>=',
        min: RUNNER_FLOW_MIN_PAIR_AGE_SECONDS,
        maxOperator: '<=',
        max: RUNNER_FLOW_MAX_PAIR_AGE_SECONDS,
      },
      market_age_seconds: {
        minOperator: '>=',
        min: RUNNER_FLOW_MIN_MARKET_AGE_SECONDS,
        maxOperator: '<=',
        max: RUNNER_FLOW_MAX_MARKET_AGE_SECONDS,
      },
      trades_5m: { operator: '>=', bound: RUNNER_FLOW_MIN_TRADES_5M },
      volume_to_liquidity_5m: { operator: '>=', bound: RUNNER_FLOW_MIN_VOLUME_TO_LIQUIDITY_5M },
      buy_share_5m_bps: { operator: '>=', bound: RUNNER_FLOW_MIN_BUY_SHARE_5M_BPS },
      net_buys_5m: { operator: '>=', bound: RUNNER_FLOW_MIN_NET_BUYS_5M },
      price_change_5m_pct: {
        operator: '>=',
        bound: RUNNER_FLOW_MIN_PRICE_CHANGE_5M_PCT,
        maximum: 'none',
      },
      price_change_1h_pct: { operator: '>', bound: RUNNER_FLOW_PRICE_CHANGE_1H_EXCLUSIVE },
    },
    requiredDataPrecedence: 'unavailable_over_fail',
    unavailableRequiredFeature: 'insufficient_data',
    noScoreSemantics: true,
    noEnvironmentThresholds: true,
  };
}

export function fingerprintQualityLiquidCandidate(
  definition: CanonicalQualityLiquidCandidate = canonicalQualityLiquidCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function fingerprintFlowQualityCandidate(
  definition: CanonicalFlowQualityCandidate = canonicalFlowQualityCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function fingerprintRunnerFlowCandidate(
  definition: CanonicalRunnerFlowCandidate = canonicalRunnerFlowCandidate(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export function frozenResearchEntryFingerprint(candidateId: OptimizationEntryCandidateId): string {
  if (
    candidateId === 'quality_liquid_v1' ||
    candidateId === 'flow_quality_v1' ||
    candidateId === 'runner_flow_v1'
  ) {
    throw new OptimizationError(`${candidateId} is a CP17 entry, not a frozen r125 candidate.`);
  }
  return getResearchCandidateDescriptor(candidateId).candidateDefinitionFingerprint;
}

export function evaluateQualityLiquid(vector: FeatureVector): OptimizationEntryEvaluation {
  const rules = [
    ...evaluateCommonMarketRiskGate(vector),
    evaluateInclusiveMinimum(
      vector,
      'LIQUIDITY_QUALITY_LIQUID',
      'market_liquidity_usd',
      QUALITY_LIQUID_MIN_LIQUIDITY_USD,
      {
        pass: 'Selected pair USD liquidity meets the quality_liquid_v1 minimum.',
        fail: `Selected pair USD liquidity is below ${String(QUALITY_LIQUID_MIN_LIQUIDITY_USD)}.`,
      },
    ),
    evaluateInclusiveRange(
      vector,
      'PAIR_AGE_QUALITY_LIQUID',
      'pair_age_seconds',
      QUALITY_LIQUID_MIN_PAIR_AGE_SECONDS,
      QUALITY_LIQUID_MAX_PAIR_AGE_SECONDS,
      {
        pass: 'DEX pair age is inside the quality_liquid_v1 window.',
        fail: 'DEX pair age is outside the quality_liquid_v1 window.',
      },
    ),
    evaluateInclusiveMinimum(
      vector,
      'TRADES_5M_QUALITY_LIQUID',
      'trades_5m',
      QUALITY_LIQUID_MIN_TRADES_5M,
      {
        pass: 'Observed 5-minute pair trade count meets the quality_liquid_v1 minimum.',
        fail: `Observed 5-minute pair trade count is below ${String(QUALITY_LIQUID_MIN_TRADES_5M)}.`,
      },
    ),
  ];
  return {
    candidateId: 'quality_liquid_v1',
    decision: decisionFromResearchRules(rules),
    rules,
  };
}

export function evaluateFlowQuality(vector: FeatureVector): OptimizationEntryEvaluation {
  const rules = [
    ...evaluateBlockingRiskFindings(vector),
    evaluateExclusiveMinimum(vector, 'PRICE_POSITIVE', 'market_price_usd', MIN_PRICE_USD_EXCLUSIVE, {
      pass: 'market_price_usd is strictly positive.',
      fail: 'market_price_usd is not greater than 0.',
    }),
    evaluateInclusiveMinimum(
      vector,
      'LIQUIDITY_MINIMUM',
      'market_liquidity_usd',
      FLOW_QUALITY_MIN_LIQUIDITY_USD,
      {
        pass: 'Selected pair USD liquidity meets the flow_quality_v1 minimum.',
        fail: `Selected pair USD liquidity is below ${String(FLOW_QUALITY_MIN_LIQUIDITY_USD)}.`,
      },
    ),
    evaluateInclusiveRange(
      vector,
      'PAIR_AGE_RANGE',
      'pair_age_seconds',
      FLOW_QUALITY_MIN_PAIR_AGE_SECONDS,
      FLOW_QUALITY_MAX_PAIR_AGE_SECONDS,
      {
        pass: 'DEX pair age is inside the flow_quality_v1 window.',
        fail: 'DEX pair age is outside the flow_quality_v1 window.',
      },
    ),
    evaluateInclusiveRange(
      vector,
      'MARKET_FRESHNESS',
      'market_age_seconds',
      FLOW_QUALITY_MIN_MARKET_AGE_SECONDS,
      FLOW_QUALITY_MAX_MARKET_AGE_SECONDS,
      {
        pass: 'Current market observation is fresh enough for flow_quality_v1.',
        fail: 'Current market observation is older than the flow_quality_v1 freshness window.',
      },
    ),
    evaluateInclusiveMinimum(vector, 'TRADES_5M_MINIMUM', 'trades_5m', FLOW_QUALITY_MIN_TRADES_5M, {
      pass: 'Observed 5-minute pair trade count meets the flow_quality_v1 minimum.',
      fail: `Observed 5-minute pair trade count is below ${String(FLOW_QUALITY_MIN_TRADES_5M)}.`,
    }),
    evaluateInclusiveMinimum(
      vector,
      'VOLUME_LIQUIDITY_5M_MINIMUM',
      'volume_to_liquidity_5m_ratio',
      FLOW_QUALITY_MIN_VOLUME_TO_LIQUIDITY_5M,
      {
        pass: '5-minute volume-to-pair-liquidity ratio meets flow_quality_v1.',
        fail: `5-minute volume-to-pair-liquidity ratio is below ${String(FLOW_QUALITY_MIN_VOLUME_TO_LIQUIDITY_5M)}.`,
      },
    ),
    evaluateInclusiveMinimum(
      vector,
      'BUY_SHARE_5M_MINIMUM',
      'buy_share_5m_bps',
      FLOW_QUALITY_MIN_BUY_SHARE_5M_BPS,
      {
        pass: 'Observed 5-minute buy-share of trades meets flow_quality_v1.',
        fail: `Observed 5-minute buy-share of trades is below ${String(FLOW_QUALITY_MIN_BUY_SHARE_5M_BPS)} bps.`,
      },
    ),
    evaluateInclusiveMinimum(vector, 'NET_BUYS_5M_MINIMUM', 'net_buys_5m', FLOW_QUALITY_MIN_NET_BUYS_5M, {
      pass: 'Observed 5-minute net buy count meets flow_quality_v1.',
      fail: `Observed 5-minute net buy count is below ${String(FLOW_QUALITY_MIN_NET_BUYS_5M)}.`,
    }),
    evaluateInclusiveRange(
      vector,
      'PRICE_CHANGE_5M_BAND',
      'market_price_change_5m_pct',
      FLOW_QUALITY_MIN_PRICE_CHANGE_5M_PCT,
      FLOW_QUALITY_MAX_PRICE_CHANGE_5M_PCT,
      {
        pass: 'Provider 5-minute price change is inside the flow_quality_v1 band.',
        fail: 'Provider 5-minute price change is outside the flow_quality_v1 band.',
      },
    ),
    evaluateExclusiveMinimum(
      vector,
      'BUY_SHARE_1H_MAJORITY',
      'buy_share_1h_bps',
      FLOW_QUALITY_BUY_SHARE_1H_BPS_EXCLUSIVE,
      {
        pass: 'Observed 1-hour buy-share is a strict majority of trades.',
        fail: 'Observed 1-hour buy-share is not greater than 5000 bps.',
      },
    ),
    evaluateExclusiveMinimum(
      vector,
      'NET_BUYS_1H_POSITIVE',
      'net_buys_1h',
      FLOW_QUALITY_NET_BUYS_1H_EXCLUSIVE,
      {
        pass: 'Observed 1-hour net buy count is strictly positive.',
        fail: 'Observed 1-hour net buy count is not greater than 0.',
      },
    ),
  ];
  return {
    candidateId: 'flow_quality_v1',
    decision: decisionFromResearchRules(rules),
    rules,
  };
}

export function evaluateRunnerFlow(vector: FeatureVector): OptimizationEntryEvaluation {
  const rules = [
    ...evaluateBlockingRiskFindings(vector),
    evaluateExclusiveMinimum(vector, 'PRICE_POSITIVE', 'market_price_usd', MIN_PRICE_USD_EXCLUSIVE, {
      pass: 'market_price_usd is strictly positive.',
      fail: 'market_price_usd is not greater than 0.',
    }),
    evaluateInclusiveMinimum(
      vector,
      'LIQUIDITY_MINIMUM',
      'market_liquidity_usd',
      RUNNER_FLOW_MIN_LIQUIDITY_USD,
      {
        pass: 'Selected pair USD liquidity meets the runner_flow_v1 minimum.',
        fail: `Selected pair USD liquidity is below ${String(RUNNER_FLOW_MIN_LIQUIDITY_USD)}.`,
      },
    ),
    evaluateInclusiveRange(
      vector,
      'PAIR_AGE_RANGE',
      'pair_age_seconds',
      RUNNER_FLOW_MIN_PAIR_AGE_SECONDS,
      RUNNER_FLOW_MAX_PAIR_AGE_SECONDS,
      {
        pass: 'DEX pair age is inside the runner_flow_v1 window.',
        fail: 'DEX pair age is outside the runner_flow_v1 window.',
      },
    ),
    evaluateInclusiveRange(
      vector,
      'MARKET_FRESHNESS',
      'market_age_seconds',
      RUNNER_FLOW_MIN_MARKET_AGE_SECONDS,
      RUNNER_FLOW_MAX_MARKET_AGE_SECONDS,
      {
        pass: 'Current market observation is fresh enough for runner_flow_v1.',
        fail: 'Current market observation is older than the runner_flow_v1 freshness window.',
      },
    ),
    evaluateInclusiveMinimum(vector, 'TRADES_5M_MINIMUM', 'trades_5m', RUNNER_FLOW_MIN_TRADES_5M, {
      pass: 'Observed 5-minute pair trade count meets the runner_flow_v1 minimum.',
      fail: `Observed 5-minute pair trade count is below ${String(RUNNER_FLOW_MIN_TRADES_5M)}.`,
    }),
    evaluateInclusiveMinimum(
      vector,
      'VOLUME_LIQUIDITY_5M_MINIMUM',
      'volume_to_liquidity_5m_ratio',
      RUNNER_FLOW_MIN_VOLUME_TO_LIQUIDITY_5M,
      {
        pass: '5-minute volume-to-pair-liquidity ratio meets runner_flow_v1.',
        fail: `5-minute volume-to-pair-liquidity ratio is below ${String(RUNNER_FLOW_MIN_VOLUME_TO_LIQUIDITY_5M)}.`,
      },
    ),
    evaluateInclusiveMinimum(
      vector,
      'BUY_SHARE_5M_MINIMUM',
      'buy_share_5m_bps',
      RUNNER_FLOW_MIN_BUY_SHARE_5M_BPS,
      {
        pass: 'Observed 5-minute buy-share of trades meets runner_flow_v1.',
        fail: `Observed 5-minute buy-share of trades is below ${String(RUNNER_FLOW_MIN_BUY_SHARE_5M_BPS)} bps.`,
      },
    ),
    evaluateInclusiveMinimum(vector, 'NET_BUYS_5M_MINIMUM', 'net_buys_5m', RUNNER_FLOW_MIN_NET_BUYS_5M, {
      pass: 'Observed 5-minute net buy count meets runner_flow_v1.',
      fail: `Observed 5-minute net buy count is below ${String(RUNNER_FLOW_MIN_NET_BUYS_5M)}.`,
    }),
    evaluateInclusiveMinimum(
      vector,
      'PRICE_CHANGE_5M_MINIMUM_NO_MAX',
      'market_price_change_5m_pct',
      RUNNER_FLOW_MIN_PRICE_CHANGE_5M_PCT,
      {
        pass: 'Provider 5-minute price change meets runner_flow_v1 with no upper cap.',
        fail: `Provider 5-minute price change is below ${String(RUNNER_FLOW_MIN_PRICE_CHANGE_5M_PCT)}.`,
      },
    ),
    evaluateExclusiveMinimum(
      vector,
      'PRICE_CHANGE_1H_POSITIVE',
      'market_price_change_1h_pct',
      RUNNER_FLOW_PRICE_CHANGE_1H_EXCLUSIVE,
      {
        pass: 'Provider 1-hour price change is strictly positive.',
        fail: 'Provider 1-hour price change is not greater than 0.',
      },
    ),
  ];
  return {
    candidateId: 'runner_flow_v1',
    decision: decisionFromResearchRules(rules),
    rules,
  };
}

function wrapResearch(evaluation: ResearchCandidateEvaluation): OptimizationEntryEvaluation {
  const candidateId: string = evaluation.candidateId;
  if (!isOptimizationEntryId(candidateId)) {
    throw new OptimizationError(`Unexpected research candidate id ${candidateId}.`);
  }
  return {
    candidateId,
    decision: evaluation.decision,
    rules: evaluation.rules,
  };
}

export function evaluateOptimizationEntry(
  candidateId: OptimizationEntryCandidateId,
  vector: FeatureVector,
): OptimizationEntryEvaluation {
  switch (candidateId) {
    case 's07_baseline':
      return wrapResearch(evaluateS07Baseline(vector));
    case 'quality_control_v1':
      return wrapResearch(evaluateQualityControl(vector));
    case 'time_series_momentum_v1':
      return wrapResearch(evaluateTimeSeriesMomentum(vector));
    case 'flow_confirmed_momentum_v1':
      return wrapResearch(evaluateFlowConfirmedMomentum(vector));
    case 'runner_friendly_momentum_v1':
      return wrapResearch(evaluateRunnerFriendlyMomentum(vector));
    case 'quality_liquid_v1':
      return evaluateQualityLiquid(vector);
    case 'flow_quality_v1':
      return evaluateFlowQuality(vector);
    case 'runner_flow_v1':
      return evaluateRunnerFlow(vector);
  }
}

export function isOptimizationEntryId(value: string): value is OptimizationEntryCandidateId {
  return (OPTIMIZATION_ENTRY_CANDIDATE_IDS as readonly string[]).includes(value);
}

export function requireOptimizationEntryId(value: string): OptimizationEntryCandidateId {
  if (isOptimizationEntryId(value)) {
    return value;
  }
  throw new OptimizationError(
    `Unknown optimization entry candidate: ${value}. Expected one of: ${OPTIMIZATION_ENTRY_CANDIDATE_IDS.join(', ')}.`,
  );
}

export function fingerprintOptimizationEntry(candidateId: OptimizationEntryCandidateId): string {
  switch (candidateId) {
    case 's07_baseline':
    case 'quality_control_v1':
    case 'time_series_momentum_v1':
    case 'flow_confirmed_momentum_v1':
    case 'runner_friendly_momentum_v1':
      return frozenResearchEntryFingerprint(candidateId);
    case 'quality_liquid_v1':
      return fingerprintQualityLiquidCandidate();
    case 'flow_quality_v1':
      return fingerprintFlowQualityCandidate();
    case 'runner_flow_v1':
      return fingerprintRunnerFlowCandidate();
  }
}
