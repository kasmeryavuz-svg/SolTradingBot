import { describe, expect, it } from 'vitest';
import {
  canonicalQualityControlCandidate,
  fingerprintQualityControlCandidate,
} from '../src/research/candidates/quality-control.js';
import {
  canonicalTimeSeriesMomentumCandidate,
  fingerprintTimeSeriesMomentumCandidate,
  evaluateTimeSeriesMomentum,
} from '../src/research/candidates/time-series-momentum.js';
import {
  canonicalFlowConfirmedMomentumCandidate,
  fingerprintFlowConfirmedMomentumCandidate,
  evaluateFlowConfirmedMomentum,
} from '../src/research/candidates/flow-confirmed-momentum.js';
import {
  canonicalRunnerFriendlyMomentumCandidate,
  fingerprintRunnerFriendlyMomentumCandidate,
  evaluateRunnerFriendlyMomentum,
} from '../src/research/candidates/runner-friendly-momentum.js';
import {
  evaluateS07Baseline,
  fingerprintS07BaselineCandidate,
} from '../src/research/candidates/s07-baseline.js';
import {
  evaluateCommonMarketRiskGate,
  evaluateQualityControl,
  evaluateResearchCandidate,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
} from '../src/research/index.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import {
  passingVector,
  withAvailableBoolean,
  withAvailableNumber,
  withUnavailable,
} from './strategy-fixtures.js';

const NEW_CANDIDATES = [
  'quality_control_v1',
  'time_series_momentum_v1',
  'flow_confirmed_momentum_v1',
  'runner_friendly_momentum_v1',
] as const;

function unavailableRiskAndMarketFail(vector = passingVector()) {
  return withUnavailable(
    withAvailableNumber(vector, 'market_liquidity_usd', 1),
    'risk_finding_mint_authority_active',
  );
}

describe('required-data precedence for new r125 candidates', () => {
  it('one unavailable common field with all others passing is insufficient_data', () => {
    for (const candidateId of NEW_CANDIDATES) {
      expect(evaluateResearchCandidate(candidateId, withUnavailable(passingVector(), 'trades_5m')).decision).toBe(
        'insufficient_data',
      );
    }
  });

  it('unavailable required risk plus a market fail is insufficient_data, not no_entry', () => {
    const vector = unavailableRiskAndMarketFail();
    expect(evaluateQualityControl(vector).decision).toBe('insufficient_data');
    expect(evaluateTimeSeriesMomentum(vector).decision).toBe('insufficient_data');
    expect(evaluateFlowConfirmedMomentum(vector).decision).toBe('insufficient_data');
    expect(evaluateRunnerFriendlyMomentum(vector).decision).toBe('insufficient_data');
    expect(evaluateS07Baseline(vector).decision).toBe('no_entry');
    expect(evaluateStrategy(vector, { evaluatedAt: vector.asOf }).decision).toBe('no_entry');
  });

  it('unavailable required risk plus a candidate-specific fail is insufficient_data', () => {
    const vector = withUnavailable(
      withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 0),
      'risk_finding_freeze_authority_active',
    );
    expect(evaluateTimeSeriesMomentum(vector).decision).toBe('insufficient_data');
    expect(evaluateFlowConfirmedMomentum(vector).decision).toBe('insufficient_data');
    expect(evaluateRunnerFriendlyMomentum(vector).decision).toBe('insufficient_data');
  });

  it('multiple unavailable plus a fail is still insufficient_data', () => {
    const vector = withUnavailable(
      withUnavailable(
        withAvailableNumber(passingVector(), 'market_liquidity_usd', 1),
        'risk_finding_mint_authority_active',
      ),
      'trades_5m',
    );
    for (const candidateId of NEW_CANDIDATES) {
      expect(evaluateResearchCandidate(candidateId, vector).decision).toBe('insufficient_data');
    }
  });

  it('all required available and one fail is no_entry', () => {
    const vector = withAvailableNumber(passingVector(), 'market_liquidity_usd', 49_999);
    for (const candidateId of NEW_CANDIDATES) {
      expect(evaluateResearchCandidate(candidateId, vector).decision).toBe('no_entry');
    }
  });

  it('all required available and all pass is entry_candidate for quality control', () => {
    expect(evaluateQualityControl(passingVector()).decision).toBe('entry_candidate');
  });

  it('common gate does not include volume, buy-share, net buys, or momentum', () => {
    const codes = evaluateCommonMarketRiskGate(passingVector()).map((rule) => rule.code);
    expect(codes.some((code) => code.includes('VOLUME') || code.includes('BUY_SHARE') || code.includes('NET_BUYS'))).toBe(
      false,
    );
    expect(codes.some((code) => code.includes('PRICE_CHANGE'))).toBe(false);
    expect(codes.filter((code) => code.startsWith('RISK_BLOCKER_'))).toHaveLength(7);
  });
});

describe('common gate exact boundaries', () => {
  it('price, liquidity, pair age, market age, and trades5m use the registered comparators', () => {
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'market_price_usd', 0)).decision).toBe(
      'no_entry',
    );
    expect(
      evaluateQualityControl(withAvailableNumber(passingVector(), 'market_price_usd', Number.MIN_VALUE)).decision,
    ).toBe('entry_candidate');
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'market_liquidity_usd', 50_000)).decision).toBe(
      'entry_candidate',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'market_liquidity_usd', 49_999)).decision).toBe(
      'no_entry',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'pair_age_seconds', 900)).decision).toBe(
      'entry_candidate',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'pair_age_seconds', 899)).decision).toBe(
      'no_entry',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'pair_age_seconds', 604_800)).decision).toBe(
      'entry_candidate',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'pair_age_seconds', 604_801)).decision).toBe(
      'no_entry',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'market_age_seconds', 0)).decision).toBe(
      'entry_candidate',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'market_age_seconds', 120)).decision).toBe(
      'entry_candidate',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'market_age_seconds', 121)).decision).toBe(
      'no_entry',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'trades_5m', 20)).decision).toBe(
      'entry_candidate',
    );
    expect(evaluateQualityControl(withAvailableNumber(passingVector(), 'trades_5m', 19)).decision).toBe('no_entry');
  });

  it('a true blocking risk with all required risk features available is no_entry', () => {
    expect(
      evaluateQualityControl(
        withAvailableBoolean(passingVector(), 'risk_finding_mint_authority_active', true),
      ).decision,
    ).toBe('no_entry');
  });
});

describe('new candidate fingerprint completeness', () => {
  it('quality_control fingerprint moves when id, version, name, gate, operator, threshold, unavailable behavior, or no-score changes', () => {
    const base = fingerprintQualityControlCandidate();
    const id = structuredClone(canonicalQualityControlCandidate());
    (id as { candidateId: string }).candidateId = 'quality_control_v2';
    expect(fingerprintQualityControlCandidate(id)).not.toBe(base);

    const version = structuredClone(canonicalQualityControlCandidate());
    version.candidateVersion = 'quality_control_v2';
    expect(fingerprintQualityControlCandidate(version)).not.toBe(base);

    const name = structuredClone(canonicalQualityControlCandidate());
    name.candidateName = 'other';
    expect(fingerprintQualityControlCandidate(name)).not.toBe(base);

    const category = structuredClone(canonicalQualityControlCandidate());
    (category as { candidateCategory: string }).candidateCategory = 'ablation_hypothesis';
    expect(fingerprintQualityControlCandidate(category)).not.toBe(base);

    const gate = structuredClone(canonicalQualityControlCandidate());
    gate.commonGate.commonGateVersion = 'r125_common_gate_v2';
    expect(fingerprintQualityControlCandidate(gate)).not.toBe(base);

    const feature = structuredClone(canonicalQualityControlCandidate());
    feature.commonGate.requiredFeatures = feature.commonGate.requiredFeatures.filter(
      (item) => item !== 'trades_5m',
    );
    expect(fingerprintQualityControlCandidate(feature)).not.toBe(base);

    const operator = structuredClone(canonicalQualityControlCandidate());
    (operator.commonGate.comparisons.LIQUIDITY_MINIMUM as { operator: string }).operator = '>';
    expect(fingerprintQualityControlCandidate(operator)).not.toBe(base);

    const threshold = structuredClone(canonicalQualityControlCandidate());
    threshold.commonGate.comparisons.LIQUIDITY_MINIMUM.bound += 1;
    expect(fingerprintQualityControlCandidate(threshold)).not.toBe(base);

    const unavailable = structuredClone(canonicalQualityControlCandidate());
    (unavailable as { unavailableRequiredFeature: string }).unavailableRequiredFeature = 'no_entry';
    expect(fingerprintQualityControlCandidate(unavailable)).not.toBe(base);

    const score = structuredClone(canonicalQualityControlCandidate());
    (score as { noScoreSemantics: boolean }).noScoreSemantics = false;
    expect(fingerprintQualityControlCandidate(score)).not.toBe(base);
  });

  it('time-series, flow, and runner fingerprints move when a candidate-specific rule changes', () => {
    const ts = structuredClone(canonicalTimeSeriesMomentumCandidate());
    (ts.momentumRules.market_price_change_24h_pct as { operator: string }).operator = '>=';
    expect(fingerprintTimeSeriesMomentumCandidate(ts)).not.toBe(fingerprintTimeSeriesMomentumCandidate());

    const flow = structuredClone(canonicalFlowConfirmedMomentumCandidate());
    flow.additionalRules.buy_share_1h_bps.bound = 4999;
    expect(fingerprintFlowConfirmedMomentumCandidate(flow)).not.toBe(fingerprintFlowConfirmedMomentumCandidate());

    const runner = structuredClone(canonicalRunnerFriendlyMomentumCandidate());
    (runner.additionalRules.market_price_change_5m_pct as { maximum: string }).maximum = '20';
    expect(fingerprintRunnerFriendlyMomentumCandidate(runner)).not.toBe(
      fingerprintRunnerFriendlyMomentumCandidate(),
    );
  });

  it('s07_baseline fingerprint remains the frozen s07 fingerprint', () => {
    expect(fingerprintS07BaselineCandidate()).toBe(FROZEN_S07_V1_DEFINITION_FINGERPRINT);
  });
});
