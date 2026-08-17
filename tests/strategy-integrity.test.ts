import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FEATURE_NAMES, requireFeatureDefinition } from '../src/features/definitions.js';
import { featureSourceIdentity } from '../src/features/numbers.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import {
  BLOCKING_RISK_FEATURES,
  REQUIRED_FEATURE_SET_VERSION,
  STRATEGY_THRESHOLDS,
  STRATEGY_VERSION,
} from '../src/strategy/constants.js';
import { STRATEGY_REQUIRED_FEATURE_NAMES, STRATEGY_RULE_DEFINITIONS } from '../src/strategy/definitions.js';
import {
  canonicalStrategyDefinition,
  fingerprintStrategyDefinition,
  mutateCanonicalDefinition,
  STRATEGY_DEFINITION_FINGERPRINT,
  strategySourceIdentity,
  strategySourceIdentityFromVector,
} from '../src/strategy/identity.js';
import { assertStrategyEvaluationInvariants } from '../src/strategy/invariants.js';
import { STRATEGY_RULE_CODES, StrategyError, type StrategyEvaluation } from '../src/strategy/types.js';
import {
  evaluatePassing,
  passingVector,
  T_10_00,
  withAvailableBoolean,
  withAvailableNumber,
  withFeatureValue,
  withUnavailable,
} from './strategy-fixtures.js';

function rule(evaluation: StrategyEvaluation, code: (typeof STRATEGY_RULE_CODES)[number]) {
  const result = evaluation.rules.find((item) => item.ruleCode === code);
  if (result === undefined) {
    throw new Error(`Missing rule ${code}`);
  }
  return result;
}

function statuses(evaluation: StrategyEvaluation): string[] {
  return evaluation.rules.map((item) => `${item.ruleCode}:${item.status}`);
}

describe('s07_v1 definition fingerprint contract', () => {
  it('hashes canonical ordered data and excludes runtime metadata', () => {
    const definition = canonicalStrategyDefinition();
    expect(Object.keys(definition)).toEqual([
      'strategyVersion',
      'strategyName',
      'requiredFeatureSetVersion',
      'rules',
      'thresholds',
      'comparisons',
      'riskAggregate',
      'decisionPrecedence',
    ]);
    expect(definition.strategyVersion).toBe('s07_v1');
    expect(definition.requiredFeatureSetVersion).toBe('c06_v1');
    expect(definition.rules.map((item) => item.code)).toEqual([...STRATEGY_RULE_CODES]);
    expect(definition.rules.map((item) => item.ordinal)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(definition.comparisons.PRICE_POSITIVE).toEqual({
      feature: 'market_price_usd',
      kind: 'number',
      operator: '>',
      bound: 0,
    });
    expect(definition.comparisons.LIQUIDITY_MINIMUM).toEqual({
      feature: 'market_liquidity_usd',
      kind: 'number',
      operator: '>=',
      bound: 50_000,
    });
    expect(definition.comparisons.PAIR_AGE_RANGE).toEqual({
      feature: 'pair_age_seconds',
      kind: 'integer',
      minOperator: '>=',
      min: 900,
      maxOperator: '<=',
      max: 604_800,
    });
    expect(definition.comparisons.MARKET_FRESHNESS).toEqual({
      feature: 'market_age_seconds',
      kind: 'integer',
      minOperator: '>=',
      min: 0,
      maxOperator: '<=',
      max: 120,
    });
    expect(definition.comparisons.TRADES_5M_MINIMUM).toEqual({
      feature: 'trades_5m',
      kind: 'integer',
      operator: '>=',
      bound: 20,
    });
    expect(definition.comparisons.VOLUME_LIQUIDITY_5M_MINIMUM).toEqual({
      feature: 'volume_to_liquidity_5m_ratio',
      kind: 'number',
      operator: '>=',
      bound: 0.05,
    });
    expect(definition.comparisons.BUY_SHARE_5M_MINIMUM).toEqual({
      feature: 'buy_share_5m_bps',
      kind: 'integer',
      operator: '>=',
      bound: 5_500,
    });
    expect(definition.comparisons.NET_BUYS_5M_MINIMUM).toEqual({
      feature: 'net_buys_5m',
      kind: 'integer',
      operator: '>=',
      bound: 5,
    });
    expect(definition.comparisons.PRICE_CHANGE_5M_RANGE).toEqual({
      feature: 'market_price_change_5m_pct',
      kind: 'number',
      minOperator: '>=',
      min: 1,
      maxOperator: '<=',
      max: 20,
    });
    expect(definition.riskAggregate).toEqual({
      blockingFeatures: [...BLOCKING_RISK_FEATURES],
      anyTrueBlocker: 'fail',
      noTrueAndAnyUnavailable: 'unavailable',
      allAvailableFalse: 'pass',
    });
    expect(definition.decisionPrecedence).toEqual({
      anyFail: 'no_entry',
      elseAnyUnavailable: 'insufficient_data',
      elseAllPass: 'entry_candidate',
    });

    const encoded = JSON.stringify(definition);
    expect(fingerprintStrategyDefinition(definition)).toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(encoded).toBe(JSON.stringify(canonicalStrategyDefinition()));
    expect(encoded).not.toMatch(/"evaluatedAt"|"first_recorded_at"|"sourceIdentity"/);
    expect(Object.keys(definition)).not.toContain('observed');
  });

  it('does not hash function source, compiled JavaScript, file bytes, or git SHA', () => {
    const source = readFileSync(new URL('../src/strategy/identity.ts', import.meta.url), 'utf8');
    const fingerprintFn = source.slice(
      source.indexOf('export function fingerprintStrategyDefinition'),
      source.indexOf('export const STRATEGY_DEFINITION_FINGERPRINT'),
    );
    expect(fingerprintFn).toContain("createHash('sha256').update(JSON.stringify(definition)");
    expect(fingerprintFn).not.toMatch(/toString\(|readFileSync|git rev-parse/);
  });

  it.each([
    [
      'liquidity 50000 -> 49999',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.thresholds.MIN_LIQUIDITY_USD = 49_999;
          definition.comparisons.LIQUIDITY_MINIMUM.bound = 49_999;
        }),
    ],
    [
      '>= -> >',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.comparisons.LIQUIDITY_MINIMUM.operator = '>';
        }),
    ],
    [
      'pair max age 604800 -> 604801',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.thresholds.MAX_PAIR_AGE_SECONDS = 604_801;
          definition.comparisons.PAIR_AGE_RANGE.max = 604_801;
        }),
    ],
    [
      'buy share 5500 -> 5499',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.thresholds.MIN_BUY_SHARE_5M_BPS = 5_499;
          definition.comparisons.BUY_SHARE_5M_MINIMUM.bound = 5_499;
        }),
    ],
    [
      'remove one risk blocker',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.riskAggregate.blockingFeatures.pop();
          const riskRule = definition.rules.find((item) => item.code === 'NO_BLOCKING_RISK_FINDINGS');
          if (riskRule === undefined) {
            throw new Error('Missing risk rule');
          }
          riskRule.featureNames = [...definition.riskAggregate.blockingFeatures];
          riskRule.expectedKinds = riskRule.featureNames.map(() => 'boolean');
        }),
    ],
    [
      'reorder risk blocker list',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.riskAggregate.blockingFeatures.reverse();
          const riskRule = definition.rules.find((item) => item.code === 'NO_BLOCKING_RISK_FINDINGS');
          if (riskRule === undefined) {
            throw new Error('Missing risk rule');
          }
          riskRule.featureNames = [...definition.riskAggregate.blockingFeatures];
        }),
    ],
    [
      'change TRUE-over-unavailable precedence',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.riskAggregate.anyTrueBlocker = 'unavailable';
        }),
    ],
    [
      'change overall FAIL-over-UNAVAILABLE decision precedence',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.decisionPrecedence.anyFail = 'insufficient_data';
        }),
    ],
    [
      'change required feature set',
      () =>
        mutateCanonicalDefinition((definition) => {
          definition.requiredFeatureSetVersion = 'c06_v2';
        }),
    ],
    [
      'reorder required rule registry',
      () =>
        mutateCanonicalDefinition((definition) => {
          const [first, second, ...rest] = definition.rules;
          if (first === undefined || second === undefined) {
            throw new Error('Expected at least two rules.');
          }
          definition.rules = [second, first, ...rest].map((item, index) => ({
            ...item,
            ordinal: index + 1,
          }));
        }),
    ],
    [
      'change criterion',
      () =>
        mutateCanonicalDefinition((definition) => {
          const first = definition.rules[0];
          if (first === undefined) {
            throw new Error('Missing first rule');
          }
          first.criterion = 'mutated criterion';
        }),
    ],
    [
      'change description',
      () =>
        mutateCanonicalDefinition((definition) => {
          const first = definition.rules[0];
          if (first === undefined) {
            throw new Error('Missing first rule');
          }
          first.description = 'mutated description';
        }),
    ],
  ] as const)('changes the fingerprint when %s', (_label, mutate) => {
    expect(fingerprintStrategyDefinition(mutate())).not.toBe(STRATEGY_DEFINITION_FINGERPRINT);
    expect(STRATEGY_THRESHOLDS.MIN_LIQUIDITY_USD).toBe(50_000);
    expect(STRATEGY_THRESHOLDS.MAX_PAIR_AGE_SECONDS).toBe(604_800);
    expect(STRATEGY_THRESHOLDS.MIN_BUY_SHARE_5M_BPS).toBe(5_500);
    expect(STRATEGY_VERSION).toBe('s07_v1');
    expect(REQUIRED_FEATURE_SET_VERSION).toBe('c06_v1');
    expect(fingerprintStrategyDefinition()).toBe(STRATEGY_DEFINITION_FINGERPRINT);
  });
});

describe('s07_v1 required feature kinds', () => {
  it('binds each registered rule input to a specific c06_v1 kind', () => {
    const expected: Record<string, 'number' | 'integer' | 'boolean'> = {
      market_price_usd: 'number',
      market_liquidity_usd: 'number',
      pair_age_seconds: 'integer',
      market_age_seconds: 'integer',
      trades_5m: 'integer',
      volume_to_liquidity_5m_ratio: 'number',
      buy_share_5m_bps: 'integer',
      net_buys_5m: 'integer',
      market_price_change_5m_pct: 'number',
      risk_finding_mint_authority_active: 'boolean',
      risk_finding_freeze_authority_active: 'boolean',
      risk_finding_permanent_delegate_active: 'boolean',
      risk_finding_non_transferable: 'boolean',
      risk_finding_transfer_hook_active: 'boolean',
      risk_finding_default_account_state_frozen: 'boolean',
      risk_finding_transfer_fee_configured: 'boolean',
    };

    expect(STRATEGY_REQUIRED_FEATURE_NAMES).toEqual(Object.keys(expected));
    for (const definition of STRATEGY_RULE_DEFINITIONS) {
      for (const name of definition.featureNames) {
        expect(requireFeatureDefinition(name).kind).toBe(expected[name]);
      }
    }
    expect(canonicalStrategyDefinition().rules.flatMap((item) => item.expectedKinds)).toEqual(
      STRATEGY_RULE_DEFINITIONS.flatMap((item) =>
        item.featureNames.map((name) => requireFeatureDefinition(name).kind),
      ),
    );
  });

  it('does not coerce strings, numbers, or null into the expected kinds', () => {
    expect(() => {
      evaluateStrategy(
        withFeatureValue(passingVector(), 'buy_share_5m_bps', { value: '5500' as unknown as number }),
        { evaluatedAt: T_10_00 },
      );
    }).toThrow(StrategyError);
    expect(() => {
      evaluateStrategy(
        withFeatureValue(passingVector(), 'risk_finding_mint_authority_active', {
          value: 1,
        }),
        { evaluatedAt: T_10_00 },
      );
    }).toThrow(StrategyError);
    expect(() => {
      evaluateStrategy(
        withFeatureValue(passingVector(), 'risk_finding_mint_authority_active', {
          status: 'available',
          value: null,
          unavailableReason: null,
        }),
        { evaluatedAt: T_10_00 },
      );
    }).toThrow(StrategyError);
  });
});

describe('s07_v1 global decision precedence', () => {
  it('uses fail-over-unavailable, not majority', () => {
    const tenPass = evaluatePassing();
    expect(tenPass.decision).toBe('entry_candidate');
    expect(tenPass.passedRuleCount).toBe(10);

    const ninePassOneUnavailable = evaluateStrategy(withUnavailable(passingVector(), 'trades_5m'), {
      evaluatedAt: T_10_00,
    });
    expect(ninePassOneUnavailable.decision).toBe('insufficient_data');
    expect(ninePassOneUnavailable.passedRuleCount).toBe(9);
    expect(ninePassOneUnavailable.unavailableRuleCount).toBe(1);

    const ninePassOneFail = evaluateStrategy(
      withAvailableNumber(passingVector(), 'market_liquidity_usd', 10_000),
      { evaluatedAt: T_10_00 },
    );
    expect(ninePassOneFail.decision).toBe('no_entry');
    expect(ninePassOneFail.failedRuleCount).toBe(1);

    const eightPassFailUnavailable = evaluateStrategy(
      withUnavailable(withAvailableNumber(passingVector(), 'market_liquidity_usd', 10_000), 'trades_5m'),
      { evaluatedAt: T_10_00 },
    );
    expect(eightPassFailUnavailable.decision).toBe('no_entry');
    expect(eightPassFailUnavailable.passedRuleCount).toBe(8);
    expect(eightPassFailUnavailable.failedRuleCount).toBe(1);
    expect(eightPassFailUnavailable.unavailableRuleCount).toBe(1);

    const unavailableFeatures = [
      'market_price_usd',
      'pair_age_seconds',
      'market_age_seconds',
      'trades_5m',
      'volume_to_liquidity_5m_ratio',
      'buy_share_5m_bps',
      'net_buys_5m',
      'market_price_change_5m_pct',
      'risk_finding_mint_authority_active',
    ] as const;
    let oneFailNineUnavailable = withAvailableNumber(passingVector(), 'market_liquidity_usd', 1);
    for (const name of unavailableFeatures) {
      oneFailNineUnavailable = withUnavailable(oneFailNineUnavailable, name);
    }
    const mixed = evaluateStrategy(oneFailNineUnavailable, { evaluatedAt: T_10_00 });
    expect(mixed.failedRuleCount).toBe(1);
    expect(mixed.unavailableRuleCount).toBe(9);
    expect(mixed.decision).toBe('no_entry');
  });

  it('rejects a forged entry_candidate that still has a failed rule', () => {
    const vector = withAvailableNumber(passingVector(), 'market_liquidity_usd', 10_000);
    const evaluation = evaluateStrategy(vector, { evaluatedAt: T_10_00 });
    const forged: StrategyEvaluation = {
      ...evaluation,
      decision: 'entry_candidate',
    };
    expect(forged.failedRuleCount).toBe(1);
    expect(() => {
      assertStrategyEvaluationInvariants(forged, vector);
    }).toThrow(/decision does not match/);
  });
});

describe('s07_v1 risk aggregate precedence', () => {
  it('treats true blockers as fail even when another blocker is unavailable', () => {
    const allFalse = evaluatePassing();
    expect(rule(allFalse, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('pass');

    const firstBlocker = 'risk_finding_mint_authority_active' as const;
    const lastBlocker = 'risk_finding_transfer_fee_configured' as const;
    const firstTrue = evaluateStrategy(
      withAvailableBoolean(passingVector(), firstBlocker, true),
      { evaluatedAt: T_10_00 },
    );
    const lastTrue = evaluateStrategy(
      withAvailableBoolean(passingVector(), lastBlocker, true),
      { evaluatedAt: T_10_00 },
    );
    expect(rule(firstTrue, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('fail');
    expect(rule(lastTrue, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('fail');
    expect(firstTrue.decision).toBe(lastTrue.decision);

    const unavailableOnly = evaluateStrategy(
      withUnavailable(passingVector(), 'risk_finding_transfer_hook_active'),
      { evaluatedAt: T_10_00 },
    );
    expect(rule(unavailableOnly, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('unavailable');

    const multipleUnavailable = evaluateStrategy(
      withUnavailable(
        withUnavailable(passingVector(), 'risk_finding_mint_authority_active'),
        'risk_finding_transfer_fee_configured',
      ),
      { evaluatedAt: T_10_00 },
    );
    expect(rule(multipleUnavailable, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('unavailable');
    expect(multipleUnavailable.decision).toBe('insufficient_data');

    const trueAndUnavailable = evaluateStrategy(
      withUnavailable(
        withAvailableBoolean(passingVector(), 'risk_finding_freeze_authority_active', true),
        'risk_finding_non_transferable',
      ),
      { evaluatedAt: T_10_00 },
    );
    expect(rule(trueAndUnavailable, 'NO_BLOCKING_RISK_FINDINGS').status).toBe('fail');
    expect(trueAndUnavailable.decision).toBe('no_entry');
  });
});

describe('s07_v1 non-gating features', () => {
  it('does not change rule statuses or the decision when non-required features mutate', () => {
    const baseline = evaluatePassing();
    const required = new Set<string>(STRATEGY_REQUIRED_FEATURE_NAMES);
    const nonGating = FEATURE_NAMES.filter((name) => !required.has(name));
    expect(nonGating).toEqual(
      expect.arrayContaining([
        'risk_data_complete',
        'risk_token_2022',
        'risk_top1_token_account_concentration_bps',
        'risk_top5_token_account_concentration_bps',
        'risk_top10_token_account_concentration_bps',
        'risk_top20_token_account_concentration_bps',
        'buy_share_1h_bps',
        'net_buys_1h',
        'trades_1h',
        'market_buys_1h',
        'market_sells_1h',
        'market_price_change_1h_pct',
        'market_volume_24h_usd',
        'market_price_change_24h_pct',
        'seconds_since_previous_snapshot',
        'observed_price_change_from_previous_pct',
        'observed_liquidity_change_from_previous_pct',
        'market_cap_usd',
        'market_fdv_usd',
      ]),
    );

    for (const name of nonGating) {
      const definition = requireFeatureDefinition(name);
      const current = passingVector().values.find((value) => value.name === name);
      const mutated =
        definition.kind === 'boolean'
          ? withAvailableBoolean(passingVector(), name, current?.value !== true)
          : withAvailableNumber(passingVector(), name, definition.kind === 'integer' ? 9_999 : -12.5);
      const evaluation = evaluateStrategy(mutated, { evaluatedAt: T_10_00 });
      expect(evaluation.decision).toBe(baseline.decision);
      expect(statuses(evaluation)).toEqual(statuses(baseline));
    }
  });

  it('does not treat partial feature completeness as a hidden gate', () => {
    const vector = passingVector({ previousMarket: null });
    expect(vector.featureCompleteness).toBe('partial');
    expect(vector.values.some((value) => value.name === 'seconds_since_previous_snapshot' && value.status === 'unavailable')).toBe(
      true,
    );
    const evaluation = evaluateStrategy(vector, { evaluatedAt: vector.asOf });
    expect(evaluation.decision).toBe('entry_candidate');
    expect(evaluation.passedRuleCount).toBe(10);
    expect(evaluation.unavailableRuleCount).toBe(0);
  });

  it('does not read non-gating feature names from the evaluator or rule engine', () => {
    const required = new Set<string>(STRATEGY_REQUIRED_FEATURE_NAMES);
    const evaluator = readFileSync(new URL('../src/strategy/evaluator.ts', import.meta.url), 'utf8');
    const rules = readFileSync(new URL('../src/strategy/rules.ts', import.meta.url), 'utf8');
    for (const name of FEATURE_NAMES) {
      if (required.has(name)) {
        continue;
      }
      expect(evaluator).not.toContain(`'${name}'`);
      expect(rules).not.toContain(`'${name}'`);
    }
  });
});

describe('s07_v1 point-in-time evaluator boundary', () => {
  it('does not import market, risk, persistence, RPC, or DEX Screener clients', () => {
    const files = ['../src/strategy/evaluator.ts', '../src/strategy/rules.ts', '../src/strategy/invariants.ts'];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), 'utf8');
      expect(source).not.toMatch(/from '\.\.\/market-data|from '\.\.\/risk\/|from '\.\.\/persistence|from '\.\.\/solana/);
      expect(source).not.toMatch(/dexscreener|createReadOnlySolanaRpc|fetch\(/i);
    }
  });
});

describe('s07_v1 persisted evidence determinism', () => {
  it('stores locale-independent observed strings', () => {
    const evaluation = evaluatePassing();
    expect(rule(evaluation, 'PRICE_POSITIVE').observed).toBe('0.001');
    expect(rule(evaluation, 'LIQUIDITY_MINIMUM').observed).toBe('100000');
    expect(rule(evaluation, 'VOLUME_LIQUIDITY_5M_MINIMUM').observed).toBe('0.2');
    expect(rule(evaluation, 'BUY_SHARE_5M_MINIMUM').observed).toBe('6000 bps');
    expect(rule(evaluation, 'TRADES_5M_MINIMUM').observed).toBe('100');
    expect(rule(evaluation, 'NET_BUYS_5M_MINIMUM').observed).toBe('20');
    expect(rule(evaluation, 'PRICE_CHANGE_5M_RANGE').observed).toBe('5');
    expect(JSON.stringify(evaluation.rules)).not.toMatch(/\$|toLocaleString|,000|NaN|Infinity/);

    const rules = readFileSync(new URL('../src/strategy/rules.ts', import.meta.url), 'utf8');
    expect(rules).not.toMatch(/toLocaleString|toFixed\(/);
  });

  it('keeps identity, rules, and decision stable across evaluatedAt', () => {
    const vector = passingVector();
    const first = evaluateStrategy(vector, { evaluatedAt: vector.asOf });
    const later = evaluateStrategy(vector, { evaluatedAt: '2026-08-17T11:00:00.000Z' });
    expect(later.decision).toBe(first.decision);
    expect(later.rules).toEqual(first.rules);
    expect(later.strategyDefinitionFingerprint).toBe(first.strategyDefinitionFingerprint);
    expect(strategySourceIdentityFromVector(vector)).toBe(
      strategySourceIdentity({
        strategyVersion: first.strategyVersion,
        strategyDefinitionFingerprint: first.strategyDefinitionFingerprint,
        featureSourceIdentity: featureSourceIdentity(vector),
      }),
    );
    expect(later.featureSourceIdentity).toBe(first.featureSourceIdentity);
    expect(JSON.stringify(later)).not.toMatch(/"id":/);
    expect(later.evaluatedAt).not.toBe(first.evaluatedAt);
  });
});
