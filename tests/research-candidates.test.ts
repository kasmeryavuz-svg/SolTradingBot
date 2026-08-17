import { describe, expect, it } from 'vitest';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../src/strategy/identity.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import {
  canonicalQualityControlCandidate,
  evaluateQualityControl,
  fingerprintQualityControlCandidate,
} from '../src/research/candidates/quality-control.js';
import { evaluateFlowConfirmedMomentum } from '../src/research/candidates/flow-confirmed-momentum.js';
import { evaluateRunnerFriendlyMomentum } from '../src/research/candidates/runner-friendly-momentum.js';
import {
  evaluateS07Baseline,
  fingerprintS07BaselineCandidate,
  wrapperFingerprintIsNotUsedAsStrategyFingerprint,
} from '../src/research/candidates/s07-baseline.js';
import { evaluateTimeSeriesMomentum } from '../src/research/candidates/time-series-momentum.js';
import {
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  RESEARCH_CANDIDATE_IDS,
  evaluateResearchCandidate,
  listResearchCandidateDescriptors,
} from '../src/research/index.js';
import {
  passingVector,
  withAvailableBoolean,
  withAvailableNumber,
  withUnavailable,
} from './strategy-fixtures.js';

describe('r125 candidate registry', () => {
  it('has exactly five candidates in frozen candidateId order', () => {
    const catalog = listResearchCandidateDescriptors();
    expect(catalog.map((item) => item.candidateId)).toEqual([...RESEARCH_CANDIDATE_IDS]);
    expect(catalog).toHaveLength(5);
  });

  it('binds s07_baseline to the frozen s07 fingerprint rather than a wrapper hash', () => {
    expect(fingerprintS07BaselineCandidate()).toBe(FROZEN_S07_V1_DEFINITION_FINGERPRINT);
    expect(fingerprintS07BaselineCandidate()).toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(wrapperFingerprintIsNotUsedAsStrategyFingerprint()).not.toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(listResearchCandidateDescriptors()[0]?.candidateDefinitionFingerprint).toBe(
      FROZEN_S07_V1_DEFINITION_FINGERPRINT,
    );
  });

  it('pins derived candidate definition fingerprints', () => {
    const catalog = Object.fromEntries(
      listResearchCandidateDescriptors().map((item) => [
        item.candidateId,
        item.candidateDefinitionFingerprint,
      ]),
    );
    expect(catalog).toEqual({
      s07_baseline: FROZEN_S07_V1_DEFINITION_FINGERPRINT,
      quality_control_v1: '0b616c66483cc2e4d543a1c2e2bd0b92c730bcaaf61919e959b1462f37beb67c',
      time_series_momentum_v1: '0eec2e708abf48855ddf418d74043d06b393d032ef81851a8af18a079017f91c',
      flow_confirmed_momentum_v1: 'fcf9c752ebef4982d47ce37d59ed75479ea718a6c1eb3da9cec94442e462ece3',
      runner_friendly_momentum_v1: 'a515a1d56a3eb61b0911492076c3ece5143751a7bf8ac13a1fe50a54fd1c3535',
    });
  });

  it('changes quality_control fingerprint when a common-gate bound changes', () => {
    const mutated = structuredClone(canonicalQualityControlCandidate());
    mutated.commonGate.comparisons.LIQUIDITY_MINIMUM.bound += 1;
    expect(fingerprintQualityControlCandidate(mutated)).not.toBe(fingerprintQualityControlCandidate());
  });
});

describe('s07_baseline wrapper equality', () => {
  it('matches evaluateStrategy on the same vector', () => {
    const vector = passingVector();
    const frozen = evaluateStrategy(vector, { evaluatedAt: vector.asOf });
    const wrapped = evaluateS07Baseline(vector);
    expect(wrapped.decision).toBe(frozen.decision);
    expect(wrapped.rules.map((rule) => rule.status)).toEqual(frozen.rules.map((rule) => rule.status));
  });
});

describe('known-answer candidate boundaries', () => {
  it('quality_control: common gate pass is entry, one failure is no_entry, unavailable is insufficient_data', () => {
    expect(evaluateQualityControl(passingVector()).decision).toBe('entry_candidate');
    expect(
      evaluateQualityControl(withAvailableNumber(passingVector(), 'market_liquidity_usd', 49_999)).decision,
    ).toBe('no_entry');
    expect(evaluateQualityControl(withUnavailable(passingVector(), 'market_liquidity_usd')).decision).toBe(
      'insufficient_data',
    );
    expect(
      evaluateQualityControl(withAvailableBoolean(passingVector(), 'risk_finding_mint_authority_active', true))
        .decision,
    ).toBe('no_entry');
  });

  it('time_series_momentum: tiny positives pass and an exact zero fails', () => {
    const tiny = withAvailableNumber(
      withAvailableNumber(
        withAvailableNumber(passingVector(), 'market_price_change_5m_pct', Number.MIN_VALUE),
        'market_price_change_1h_pct',
        Number.MIN_VALUE,
      ),
      'market_price_change_24h_pct',
      Number.MIN_VALUE,
    );
    expect(evaluateTimeSeriesMomentum(tiny).decision).toBe('entry_candidate');
    expect(
      evaluateTimeSeriesMomentum(withAvailableNumber(tiny, 'market_price_change_5m_pct', 0)).decision,
    ).toBe('no_entry');
    expect(
      evaluateTimeSeriesMomentum(withAvailableNumber(tiny, 'market_price_change_1h_pct', 0)).decision,
    ).toBe('no_entry');
    expect(
      evaluateTimeSeriesMomentum(withAvailableNumber(tiny, 'market_price_change_24h_pct', 0)).decision,
    ).toBe('no_entry');
    expect(evaluateTimeSeriesMomentum(withUnavailable(tiny, 'market_price_change_24h_pct')).decision).toBe(
      'insufficient_data',
    );
  });

  it('flow_confirmed_momentum: frozen s07 5m equalities pass and 1h majority is strict', () => {
    const vector = withAvailableNumber(
      withAvailableNumber(
        withAvailableNumber(
          withAvailableNumber(
            withAvailableNumber(
              withAvailableNumber(
                withAvailableNumber(passingVector(), 'market_price_change_5m_pct', Number.MIN_VALUE),
                'market_price_change_1h_pct',
                Number.MIN_VALUE,
              ),
              'volume_to_liquidity_5m_ratio',
              0.05,
            ),
            'buy_share_5m_bps',
            5500,
          ),
          'net_buys_5m',
          5,
        ),
        'buy_share_1h_bps',
        5501,
      ),
      'net_buys_1h',
      1,
    );
    expect(evaluateFlowConfirmedMomentum(vector).decision).toBe('entry_candidate');
    expect(
      evaluateFlowConfirmedMomentum(withAvailableNumber(vector, 'buy_share_1h_bps', 5000)).decision,
    ).toBe('no_entry');
    expect(evaluateFlowConfirmedMomentum(withAvailableNumber(vector, 'net_buys_1h', 0)).decision).toBe(
      'no_entry',
    );
  });

  it('runner_friendly ablation: 5m=1 and 20 and 50 pass while s07_baseline rejects 50', () => {
    const atOne = withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 1);
    const atTwenty = withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 20);
    const atFifty = withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 50);
    expect(evaluateRunnerFriendlyMomentum(atOne).decision).toBe('entry_candidate');
    expect(evaluateRunnerFriendlyMomentum(atTwenty).decision).toBe('entry_candidate');
    expect(evaluateRunnerFriendlyMomentum(atFifty).decision).toBe('entry_candidate');
    expect(evaluateS07Baseline(atFifty).decision).toBe('no_entry');
    expect(evaluateResearchCandidate('s07_baseline', atFifty).decision).toBe('no_entry');
  });
});
