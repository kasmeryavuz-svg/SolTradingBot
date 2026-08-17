import { describe, expect, it } from 'vitest';
import { FEATURE_SET_VERSION } from '../src/features/definitions.js';
import { featureSourceIdentity } from '../src/features/numbers.js';
import { FEATURE_NAMES } from '../src/features/definitions.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import {
  BLOCKING_RISK_FEATURES,
  REQUIRED_FEATURE_SET_VERSION,
  STRATEGY_NAME,
  STRATEGY_THRESHOLDS,
  STRATEGY_VERSION,
} from '../src/strategy/constants.js';
import { STRATEGY_RULE_DEFINITIONS } from '../src/strategy/definitions.js';
import {
  canonicalStrategyDefinition,
  fingerprintStrategyDefinition,
  STRATEGY_DEFINITION_FINGERPRINT,
  strategySourceIdentity,
} from '../src/strategy/identity.js';
import { STRATEGY_RULE_CODES, StrategyError } from '../src/strategy/types.js';
import { T_10_05, T_10_10, sampleVector } from './feature-fixtures.js';
import {
  evaluatePassing,
  passingVector,
  T_10_00,
  withAvailableBoolean,
  withAvailableNumber,
  withUnavailable,
} from './strategy-fixtures.js';

function rule(evaluation: ReturnType<typeof evaluateStrategy>, code: (typeof STRATEGY_RULE_CODES)[number]) {
  const result = evaluation.rules.find((item) => item.ruleCode === code);
  if (result === undefined) {
    throw new Error(`Missing rule ${code}`);
  }
  return result;
}

describe('s07_v1 identity', () => {
  it('uses a stable version, name, feature set, and rule registry', () => {
    expect(STRATEGY_VERSION).toBe('s07_v1');
    expect(STRATEGY_NAME).toBe('conservative_flow_momentum_baseline');
    expect(REQUIRED_FEATURE_SET_VERSION).toBe('c06_v1');
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(STRATEGY_RULE_CODES).toEqual([
      'PRICE_POSITIVE',
      'LIQUIDITY_MINIMUM',
      'PAIR_AGE_RANGE',
      'MARKET_FRESHNESS',
      'TRADES_5M_MINIMUM',
      'VOLUME_LIQUIDITY_5M_MINIMUM',
      'BUY_SHARE_5M_MINIMUM',
      'NET_BUYS_5M_MINIMUM',
      'PRICE_CHANGE_5M_RANGE',
      'NO_BLOCKING_RISK_FINDINGS',
    ]);
    expect(new Set(STRATEGY_RULE_CODES).size).toBe(STRATEGY_RULE_CODES.length);
    expect(STRATEGY_RULE_DEFINITIONS.map((item) => item.code)).toEqual([...STRATEGY_RULE_CODES]);
  });

  it('fingerprints the canonical definition deterministically', () => {
    expect(fingerprintStrategyDefinition()).toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(fingerprintStrategyDefinition(canonicalStrategyDefinition())).toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(
      fingerprintStrategyDefinition(
        canonicalStrategyDefinition({
          thresholds: { MIN_LIQUIDITY_USD: 25_000 },
        }),
      ),
    ).not.toBe(STRATEGY_DEFINITION_FINGERPRINT);
  });
});

describe('s07_v1 evaluator', () => {
  it('classifies the synthetic passing vector as entry_candidate', () => {
    const evaluation = evaluatePassing();
    expect(evaluation.decision).toBe('entry_candidate');
    expect(evaluation.strategyVersion).toBe('s07_v1');
    expect(evaluation.strategyName).toBe(STRATEGY_NAME);
    expect(evaluation.featureSetVersion).toBe('c06_v1');
    expect(evaluation.passedRuleCount).toBe(10);
    expect(evaluation.failedRuleCount).toBe(0);
    expect(evaluation.unavailableRuleCount).toBe(0);
    expect(evaluation.rules).toHaveLength(10);
    expect(evaluation.asOf).toBe(evaluation.featureSourceIdentity.match(/"asOf":"([^"]+)"/)?.[1]);
  });

  it('returns no_entry when one required rule fails', () => {
    const evaluation = evaluateStrategy(withAvailableNumber(passingVector(), 'market_liquidity_usd', 10_000), {
      evaluatedAt: T_10_00,
    });
    expect(evaluation.decision).toBe('no_entry');
    expect(rule(evaluation, 'LIQUIDITY_MINIMUM').status).toBe('fail');
    expect(evaluation.failedRuleCount).toBe(1);
  });

  it('returns insufficient_data when one rule is unavailable and none fail', () => {
    const evaluation = evaluateStrategy(withUnavailable(passingVector(), 'trades_5m'), { evaluatedAt: T_10_00 });
    expect(evaluation.decision).toBe('insufficient_data');
    expect(rule(evaluation, 'TRADES_5M_MINIMUM').status).toBe('unavailable');
    expect(evaluation.failedRuleCount).toBe(0);
    expect(evaluation.unavailableRuleCount).toBe(1);
  });

  it('returns no_entry when a rule fails and another is unavailable', () => {
    const vector = withUnavailable(withAvailableNumber(passingVector(), 'market_liquidity_usd', 10_000), 'trades_5m');
    const evaluation = evaluateStrategy(vector, { evaluatedAt: T_10_00 });
    expect(evaluation.decision).toBe('no_entry');
    expect(evaluation.failedRuleCount).toBe(1);
    expect(evaluation.unavailableRuleCount).toBe(1);
  });

  it('counts every required rule exactly once', () => {
    const evaluation = evaluatePassing();
    expect(
      evaluation.passedRuleCount + evaluation.failedRuleCount + evaluation.unavailableRuleCount,
    ).toBe(STRATEGY_RULE_CODES.length);
  });
});

describe('s07_v1 numeric boundaries', () => {
  it('requires a strictly positive price', () => {
    expect(rule(evaluatePassing(), 'PRICE_POSITIVE').status).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_price_usd', 0), { evaluatedAt: T_10_00 }),
        'PRICE_POSITIVE',
      ).status,
    ).toBe('fail');
    expect(
      rule(evaluateStrategy(withUnavailable(passingVector(), 'market_price_usd'), { evaluatedAt: T_10_00 }), 'PRICE_POSITIVE')
        .status,
    ).toBe('unavailable');
  });

  it('uses the pair-liquidity boundary 50000 inclusive', () => {
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_liquidity_usd', 49_999.99), {
          evaluatedAt: T_10_00,
        }),
        'LIQUIDITY_MINIMUM',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_liquidity_usd', 50_000), {
          evaluatedAt: T_10_00,
        }),
        'LIQUIDITY_MINIMUM',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withUnavailable(passingVector(), 'market_liquidity_usd'), { evaluatedAt: T_10_00 }),
        'LIQUIDITY_MINIMUM',
      ).status,
    ).toBe('unavailable');
  });

  it('uses inclusive pair-age bounds', () => {
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'pair_age_seconds', 899), { evaluatedAt: T_10_00 }),
        'PAIR_AGE_RANGE',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'pair_age_seconds', 900), { evaluatedAt: T_10_00 }),
        'PAIR_AGE_RANGE',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'pair_age_seconds', 604_800), { evaluatedAt: T_10_00 }),
        'PAIR_AGE_RANGE',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'pair_age_seconds', 604_801), { evaluatedAt: T_10_00 }),
        'PAIR_AGE_RANGE',
      ).status,
    ).toBe('fail');
    expect(
      rule(evaluateStrategy(withUnavailable(passingVector(), 'pair_age_seconds'), { evaluatedAt: T_10_00 }), 'PAIR_AGE_RANGE')
        .status,
    ).toBe('unavailable');
  });

  it('uses inclusive market-freshness bounds', () => {
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_age_seconds', 120), { evaluatedAt: T_10_00 }),
        'MARKET_FRESHNESS',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_age_seconds', 121), { evaluatedAt: T_10_00 }),
        'MARKET_FRESHNESS',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withUnavailable(passingVector(), 'market_age_seconds'), { evaluatedAt: T_10_00 }),
        'MARKET_FRESHNESS',
      ).status,
    ).toBe('unavailable');
  });

  it('uses the trades, volume/liquidity, buy-share, and net-buy boundaries', () => {
    expect(
      rule(evaluateStrategy(withAvailableNumber(passingVector(), 'trades_5m', 19), { evaluatedAt: T_10_00 }), 'TRADES_5M_MINIMUM')
        .status,
    ).toBe('fail');
    expect(
      rule(evaluateStrategy(withAvailableNumber(passingVector(), 'trades_5m', 20), { evaluatedAt: T_10_00 }), 'TRADES_5M_MINIMUM')
        .status,
    ).toBe('pass');
    expect(
      rule(evaluateStrategy(withUnavailable(passingVector(), 'trades_5m'), { evaluatedAt: T_10_00 }), 'TRADES_5M_MINIMUM')
        .status,
    ).toBe('unavailable');

    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'volume_to_liquidity_5m_ratio', 0.049999), {
          evaluatedAt: T_10_00,
        }),
        'VOLUME_LIQUIDITY_5M_MINIMUM',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'volume_to_liquidity_5m_ratio', 0.05), {
          evaluatedAt: T_10_00,
        }),
        'VOLUME_LIQUIDITY_5M_MINIMUM',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withUnavailable(passingVector(), 'volume_to_liquidity_5m_ratio'), { evaluatedAt: T_10_00 }),
        'VOLUME_LIQUIDITY_5M_MINIMUM',
      ).status,
    ).toBe('unavailable');

    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'buy_share_5m_bps', 5499), { evaluatedAt: T_10_00 }),
        'BUY_SHARE_5M_MINIMUM',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'buy_share_5m_bps', 5500), { evaluatedAt: T_10_00 }),
        'BUY_SHARE_5M_MINIMUM',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withUnavailable(passingVector(), 'buy_share_5m_bps'), { evaluatedAt: T_10_00 }),
        'BUY_SHARE_5M_MINIMUM',
      ).status,
    ).toBe('unavailable');

    expect(
      rule(evaluateStrategy(withAvailableNumber(passingVector(), 'net_buys_5m', 4), { evaluatedAt: T_10_00 }), 'NET_BUYS_5M_MINIMUM')
        .status,
    ).toBe('fail');
    expect(
      rule(evaluateStrategy(withAvailableNumber(passingVector(), 'net_buys_5m', 5), { evaluatedAt: T_10_00 }), 'NET_BUYS_5M_MINIMUM')
        .status,
    ).toBe('pass');
    expect(
      rule(evaluateStrategy(withUnavailable(passingVector(), 'net_buys_5m'), { evaluatedAt: T_10_00 }), 'NET_BUYS_5M_MINIMUM')
        .status,
    ).toBe('unavailable');
  });

  it('uses inclusive 5-minute price-change bounds', () => {
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 0.999), {
          evaluatedAt: T_10_00,
        }),
        'PRICE_CHANGE_5M_RANGE',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 1), {
          evaluatedAt: T_10_00,
        }),
        'PRICE_CHANGE_5M_RANGE',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 20), {
          evaluatedAt: T_10_00,
        }),
        'PRICE_CHANGE_5M_RANGE',
      ).status,
    ).toBe('pass');
    expect(
      rule(
        evaluateStrategy(withAvailableNumber(passingVector(), 'market_price_change_5m_pct', 20.001), {
          evaluatedAt: T_10_00,
        }),
        'PRICE_CHANGE_5M_RANGE',
      ).status,
    ).toBe('fail');
    expect(
      rule(
        evaluateStrategy(withUnavailable(passingVector(), 'market_price_change_5m_pct'), { evaluatedAt: T_10_00 }),
        'PRICE_CHANGE_5M_RANGE',
      ).status,
    ).toBe('unavailable');
  });
});

describe('s07_v1 risk rule', () => {
  it('passes when all seven blockers are available and false', () => {
    const evaluation = evaluatePassing();
    expect(rule(evaluation, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('pass');
    expect(rule(evaluation, 'NO_BLOCKING_RISK_FINDINGS').reason).toContain('no configured s07_v1 blocking findings present');
  });

  it.each([...BLOCKING_RISK_FEATURES])('fails when %s is true', (name) => {
    const evaluation = evaluateStrategy(withAvailableBoolean(passingVector(), name, true), {
      evaluatedAt: T_10_00,
    });
    expect(evaluation.decision).toBe('no_entry');
    expect(rule(evaluation, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('fail');
  });

  it('is unavailable when one risk feature is unavailable and none are true', () => {
    const evaluation = evaluateStrategy(
      withUnavailable(passingVector(), 'risk_finding_transfer_hook_active'),
      { evaluatedAt: T_10_00 },
    );
    expect(rule(evaluation, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('unavailable');
    expect(evaluation.decision).toBe('insufficient_data');
  });

  it('fails when one blocker is true and another is unavailable', () => {
    const vector = withUnavailable(
      withAvailableBoolean(passingVector(), 'risk_finding_mint_authority_active', true),
      'risk_finding_transfer_hook_active',
    );
    const evaluation = evaluateStrategy(vector, { evaluatedAt: T_10_00 });
    expect(rule(evaluation, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('fail');
    expect(evaluation.decision).toBe('no_entry');
  });

  it('classifies a missing risk report as insufficient_data when market rules pass', () => {
    const evaluation = evaluatePassing({ risk: null, riskUnavailableReason: 'risk scan failed' });
    expect(evaluation.decision).toBe('insufficient_data');
    expect(rule(evaluation, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('unavailable');
    expect(rule(evaluation, 'LIQUIDITY_MINIMUM').status).toBe('pass');
  });

  it('does not gate on risk_data_complete, concentration, or Token-2022 alone', () => {
    const base = passingVector();
    const incomplete = evaluateStrategy(withAvailableBoolean(base, 'risk_data_complete', false), {
      evaluatedAt: T_10_00,
    });
    const concentrated = evaluateStrategy(
      withAvailableNumber(base, 'risk_top1_token_account_concentration_bps', 9_000),
      { evaluatedAt: T_10_00 },
    );
    const concentrationMissing = evaluateStrategy(
      withUnavailable(base, 'risk_top1_token_account_concentration_bps'),
      { evaluatedAt: T_10_00 },
    );
    const token2022Vector = evaluateStrategy(withAvailableBoolean(base, 'risk_token_2022', true), {
      evaluatedAt: T_10_00,
    });

    expect(incomplete.decision).toBe('entry_candidate');
    expect(concentrated.decision).toBe('entry_candidate');
    expect(concentrationMissing.decision).toBe('entry_candidate');
    expect(token2022Vector.decision).toBe('entry_candidate');
  });
});

describe('s07_v1 non-gating features', () => {
  it('ignores historical deltas and 1h features', () => {
    const base = passingVector();
    const mutated = evaluateStrategy(
      withAvailableNumber(
        withAvailableNumber(
          withAvailableNumber(
            withAvailableNumber(
              withAvailableNumber(base, 'seconds_since_previous_snapshot', 1),
              'observed_price_change_from_previous_pct',
              -50,
            ),
            'observed_liquidity_change_from_previous_pct',
            -50,
          ),
          'buy_share_1h_bps',
          100,
        ),
        'net_buys_1h',
        -100,
      ),
      { evaluatedAt: T_10_00 },
    );
    expect(mutated.decision).toBe('entry_candidate');
    expect(mutated.failedRuleCount).toBe(0);
  });
});

describe('s07_v1 feature-vector reuse and evaluatedAt', () => {
  it('reuses FeatureVector invariants and preserves token identity', () => {
    const vector = passingVector();
    const evaluation = evaluateStrategy(vector, { evaluatedAt: T_10_00 });
    expect(evaluation.tokenMint).toBe(vector.tokenMint);
    expect(evaluation.asOf).toBe(vector.asOf);
    expect(evaluation.featureSourceIdentity).toBe(featureSourceIdentity(vector));

    expect(() => {
      evaluateStrategy({ ...vector, featureSetVersion: 'c06_v2' }, { evaluatedAt: T_10_00 });
    }).toThrow(/feature-set version/);

    const firstValue = vector.values[0];
    const secondValue = vector.values[1];
    if (firstValue === undefined || secondValue === undefined) {
      throw new Error('Expected at least two feature values.');
    }
    const swapped = {
      ...vector,
      values: [secondValue, firstValue, ...vector.values.slice(2)],
    };
    expect(() => {
      evaluateStrategy(swapped, { evaluatedAt: T_10_00 });
    }).toThrow(StrategyError);
    expect(FEATURE_NAMES[0]).toBe('market_price_usd');
  });

  it('enforces evaluatedAt >= asOf and treats evaluatedAt as metadata only', () => {
    const vector = passingVector();
    expect(() => {
      evaluateStrategy(vector, { evaluatedAt: '2026-08-17T09:00:00.000Z' });
    }).toThrow(/evaluatedAt must be at or after asOf/);

    const first = evaluateStrategy(vector, { evaluatedAt: T_10_00 });
    const later = evaluateStrategy(vector, { evaluatedAt: T_10_10 });
    expect(later.decision).toBe(first.decision);
    expect(later.rules.map((item) => item.status)).toEqual(first.rules.map((item) => item.status));
    expect(strategySourceIdentity({
      strategyVersion: later.strategyVersion,
      strategyDefinitionFingerprint: later.strategyDefinitionFingerprint,
      featureSourceIdentity: later.featureSourceIdentity,
    })).toBe(
      strategySourceIdentity({
        strategyVersion: first.strategyVersion,
        strategyDefinitionFingerprint: first.strategyDefinitionFingerprint,
        featureSourceIdentity: first.featureSourceIdentity,
      }),
    );
    expect(later.featureSourceIdentity).toBe(first.featureSourceIdentity);
    expect(later.evaluatedAt).not.toBe(first.evaluatedAt);
    expect(T_10_05).toBe('2026-08-17T10:05:00.000Z');
  });

  it('does not introduce score, probability, expected return, position size, or exit decisions', () => {
    const evaluation = evaluatePassing();
    expect(evaluation).not.toHaveProperty('score');
    expect(evaluation).not.toHaveProperty('confidence');
    expect(evaluation).not.toHaveProperty('probability');
    expect(evaluation).not.toHaveProperty('expectedReturn');
    expect(evaluation).not.toHaveProperty('positionSize');
    expect(evaluation).not.toHaveProperty('exit');
    expect(evaluation).not.toHaveProperty('sell');
    expect(JSON.stringify(evaluation)).not.toMatch(/"sell"|"exit"|"takeProfit"|"stopLoss"/);
    expect(STRATEGY_THRESHOLDS.MIN_LIQUIDITY_USD).toBe(50_000);
    expect(sampleVector).toBeTypeOf('function');
  });
});
