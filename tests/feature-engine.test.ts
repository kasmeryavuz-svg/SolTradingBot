import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { USDC_MINT } from '../src/config/index.js';
import { FEATURE_DEFINITIONS, FEATURE_NAMES, FEATURE_SET_VERSION, featureRegistrySize } from '../src/features/definitions.js';
import { generateFeatureVector } from '../src/features/engine.js';
import { assertSourceIdentity } from '../src/features/invariants.js';
import { featureSourceIdentity, requireUtcTimestamp } from '../src/features/numbers.js';
import {
  CONCENTRATION_UNAVAILABLE_REASON,
  RISK_REPORT_UNAVAILABLE_REASON,
  riskDerivedFeatures,
  riskDerivedFeaturesFromFacts,
  riskFeatureInputFromReport,
} from '../src/features/risk-features.js';
import { FINDING_CODES, TOKEN_2022_PROGRAM_ID } from '../src/risk/constants.js';
import {
  FEATURE_AS_OF,
  FEATURE_GENERATED_AT,
  OTHER_PAIR,
  T_09_00,
  T_09_30,
  T_09_55,
  T_10_00,
  T_10_05,
  T_10_10,
  featureInputs,
  featureValue,
  finding,
  previousSnapshot,
  sampleRisk,
  sampleSnapshot,
  sampleVector,
} from './feature-fixtures.js';

describe('feature registry', () => {
  it('has unique names, deterministic order, and a stable feature-set version', () => {
    expect(FEATURE_SET_VERSION).toBe('c06_v1');
    expect(new Set(FEATURE_NAMES).size).toBe(FEATURE_NAMES.length);
    expect(FEATURE_DEFINITIONS.map((definition) => definition.name)).toEqual([...FEATURE_NAMES]);
    expect(featureRegistrySize()).toBe(FEATURE_DEFINITIONS.length);
    expect(FEATURE_NAMES).toHaveLength(FEATURE_DEFINITIONS.length);
    expect(FEATURE_SET_VERSION).not.toMatch(/[0-9a-f]{7,}|[0-9]{4}-[0-9]{2}-[0-9]{2}/);
  });
});

describe('feature engine market and flow features', () => {
  it('copies direct market fields and keeps market cap separate from FDV', () => {
    const vector = sampleVector();
    expect(featureValue(vector, 'market_price_usd')).toMatchObject({ status: 'available', value: 100 });
    expect(featureValue(vector, 'market_liquidity_usd')).toMatchObject({ status: 'available', value: 25_000 });
    expect(featureValue(vector, 'market_volume_5m_usd')).toMatchObject({ status: 'available', value: 50 });
    expect(featureValue(vector, 'market_volume_1h_usd')).toMatchObject({ status: 'available', value: 500 });
    expect(featureValue(vector, 'market_volume_24h_usd')).toMatchObject({ status: 'available', value: 5_000 });
    expect(featureValue(vector, 'market_price_change_5m_pct')).toMatchObject({ status: 'available', value: 1.5 });
    expect(featureValue(vector, 'market_cap_usd')).toMatchObject({ status: 'available', value: 100_000 });
    expect(featureValue(vector, 'market_fdv_usd')).toMatchObject({ status: 'available', value: 200_000 });
    expect(featureValue(vector, 'market_cap_usd').value).not.toBe(featureValue(vector, 'market_fdv_usd').value);
  });

  it('marks a null source field unavailable instead of deriving zero', () => {
    const vector = sampleVector({
      market: sampleSnapshot({ priceUsd: null, volume5mUsd: null }),
    });
    expect(featureValue(vector, 'market_price_usd')).toMatchObject({
      status: 'unavailable',
      value: null,
    });
    expect(featureValue(vector, 'market_volume_5m_usd').unavailableReason).toMatch(/unavailable/);
  });

  it('computes trade counts, net buys, and buy-share basis points', () => {
    const vector = sampleVector();
    expect(featureValue(vector, 'trades_5m')).toMatchObject({ status: 'available', value: 100 });
    expect(featureValue(vector, 'trades_1h')).toMatchObject({ status: 'available', value: 500 });
    expect(featureValue(vector, 'net_buys_5m')).toMatchObject({ status: 'available', value: 20 });
    expect(featureValue(vector, 'net_buys_1h')).toMatchObject({ status: 'available', value: 100 });
    expect(featureValue(vector, 'buy_share_5m_bps')).toMatchObject({ status: 'available', value: 6000 });
    expect(featureValue(vector, 'buy_share_1h_bps')).toMatchObject({ status: 'available', value: 6000 });

    const uneven = sampleVector({ market: sampleSnapshot({ buys5m: 1, sells5m: 2 }) });
    const zeroBuys = sampleVector({ market: sampleSnapshot({ buys5m: 0, sells5m: 1 }) });
    expect(featureValue(uneven, 'buy_share_5m_bps')).toMatchObject({ status: 'available', value: 3333 });
    expect(featureValue(zeroBuys, 'buy_share_5m_bps')).toMatchObject({ status: 'available', value: 0 });
  });

  it('allows zero and negative net buys and does not treat them as a signal', () => {
    const zero = sampleVector({ market: sampleSnapshot({ buys5m: 10, sells5m: 10 }) });
    const negative = sampleVector({ market: sampleSnapshot({ buys5m: 10, sells5m: 15 }) });
    expect(featureValue(zero, 'net_buys_5m').value).toBe(0);
    expect(featureValue(negative, 'net_buys_5m').value).toBe(-5);
  });

  it('makes trade-derived features unavailable when a count is missing, negative, or unsafe', () => {
    const missing = sampleVector({ market: sampleSnapshot({ sells5m: null }) });
    const negative = sampleVector({ market: sampleSnapshot({ buys5m: -1 }) });
    const unsafe = sampleVector({ market: sampleSnapshot({ buys5m: Number.MAX_SAFE_INTEGER + 1 }) });
    expect(featureValue(missing, 'trades_5m').status).toBe('unavailable');
    expect(featureValue(missing, 'buy_share_5m_bps').status).toBe('unavailable');
    expect(featureValue(negative, 'net_buys_5m').status).toBe('unavailable');
    expect(featureValue(unsafe, 'trades_5m').status).toBe('unavailable');
  });

  it('makes buy share unavailable for zero trades and never emits NaN or Infinity', () => {
    const vector = sampleVector({ market: sampleSnapshot({ buys5m: 0, sells5m: 0 }) });
    const share = featureValue(vector, 'buy_share_5m_bps');
    expect(share.status).toBe('unavailable');
    expect(share.value).toBeNull();
    expect(share.unavailableReason).toMatch(/no observed trades/);
    expect(JSON.stringify(vector)).not.toMatch(/NaN|Infinity/);
  });

  it('computes volume/liquidity ratios, allows values above 1, and rejects zero or missing liquidity', () => {
    const vector = sampleVector();
    expect(featureValue(vector, 'volume_to_liquidity_5m_ratio').value).toBe(50 / 25_000);
    expect(featureValue(vector, 'volume_to_liquidity_1h_ratio').value).toBe(500 / 25_000);
    expect(featureValue(vector, 'volume_to_liquidity_24h_ratio').value).toBe(5_000 / 25_000);

    const aboveOne = sampleVector({ market: sampleSnapshot({ volume5mUsd: 50, liquidityUsd: 25 }) });
    expect(featureValue(aboveOne, 'volume_to_liquidity_5m_ratio').value).toBe(2);

    const zeroLiq = sampleVector({ market: sampleSnapshot({ liquidityUsd: 0 }) });
    const missingLiq = sampleVector({ market: sampleSnapshot({ liquidityUsd: null }) });
    expect(featureValue(zeroLiq, 'volume_to_liquidity_5m_ratio').status).toBe('unavailable');
    expect(featureValue(missingLiq, 'volume_to_liquidity_5m_ratio').status).toBe('unavailable');
    expect(featureValue(zeroLiq, 'volume_to_liquidity_5m_ratio').value).not.toBe(Number.POSITIVE_INFINITY);

    const zeroVolume = sampleVector({ market: sampleSnapshot({ volume5mUsd: 0, liquidityUsd: 1000 }) });
    expect(featureValue(zeroVolume, 'volume_to_liquidity_5m_ratio')).toMatchObject({
      status: 'available',
      value: 0,
    });
  });

  it('computes liquidity/market-cap without substituting FDV', () => {
    const vector = sampleVector();
    expect(featureValue(vector, 'liquidity_to_market_cap_ratio').value).toBe(25_000 / 100_000);

    const zeroCap = sampleVector({ market: sampleSnapshot({ marketCapUsd: 0, fdvUsd: 200_000 }) });
    const missingCap = sampleVector({ market: sampleSnapshot({ marketCapUsd: null, fdvUsd: 200_000 }) });
    expect(featureValue(zeroCap, 'liquidity_to_market_cap_ratio').status).toBe('unavailable');
    expect(featureValue(missingCap, 'liquidity_to_market_cap_ratio').status).toBe('unavailable');
    expect(featureValue(missingCap, 'liquidity_to_market_cap_ratio').unavailableReason).toMatch(/marketCapUsd/);
  });

  it('computes pair age and market age and does not clamp a future pairCreatedAt', () => {
    const vector = sampleVector();
    expect(featureValue(vector, 'pair_age_seconds').value).toBe(3600);
    expect(featureValue(vector, 'market_age_seconds').value).toBe(0);

    const missing = sampleVector({ market: sampleSnapshot({ pairCreatedAt: null }) });
    const futurePair = sampleVector({ market: sampleSnapshot({ pairCreatedAt: T_10_05 }) });
    expect(featureValue(missing, 'pair_age_seconds').status).toBe('unavailable');
    expect(featureValue(futurePair, 'pair_age_seconds').status).toBe('unavailable');
    expect(featureValue(futurePair, 'pair_age_seconds').value).not.toBe(0);
  });

  it('floors millisecond timestamp gaps to whole seconds and does not clamp a 1ms-future pairCreatedAt', () => {
    const vector = sampleVector({
      asOf: '2026-08-17T10:00:00.750Z',
      market: sampleSnapshot({ collectedAt: '2026-08-17T10:00:00.250Z' }),
    });
    expect(featureValue(vector, 'market_age_seconds').value).toBe(0);
    expect(featureValue(vector, 'pair_age_seconds').value).toBe(3600);

    const slightlyFuturePair = sampleVector({
      market: sampleSnapshot({ pairCreatedAt: '2026-08-17T10:00:00.001Z' }),
    });
    expect(featureValue(slightlyFuturePair, 'pair_age_seconds').status).toBe('unavailable');
    expect(featureValue(slightlyFuturePair, 'pair_age_seconds').value).not.toBe(0);
  });

  it('floors age seconds at 999ms, 1000ms, and 1999ms and never emits a negative age', () => {
    const almostOne = sampleVector({
      asOf: '2026-08-17T10:00:00.999Z',
      market: sampleSnapshot({ collectedAt: T_10_00 }),
    });
    const exactlyOne = sampleVector({
      asOf: '2026-08-17T10:00:01.000Z',
      market: sampleSnapshot({ collectedAt: T_10_00 }),
    });
    const almostTwo = sampleVector({
      asOf: '2026-08-17T10:00:01.999Z',
      market: sampleSnapshot({ collectedAt: T_10_00 }),
    });
    expect(featureValue(almostOne, 'market_age_seconds').value).toBe(0);
    expect(featureValue(exactlyOne, 'market_age_seconds').value).toBe(1);
    expect(featureValue(almostTwo, 'market_age_seconds').value).toBe(1);
    expect(featureValue(almostOne, 'market_age_seconds').value).toBeGreaterThanOrEqual(0);
    expect(featureValue(exactlyOne, 'risk_age_seconds').value).toBeGreaterThanOrEqual(0);
  });

  it('changes market and risk age when asOf changes and gives those vectors different identities', () => {
    const first = sampleVector({ asOf: T_10_05 }, { generatedAt: T_10_05 });
    const second = sampleVector({ asOf: T_10_10 }, { generatedAt: T_10_10 });
    expect(featureValue(first, 'market_age_seconds').value).toBe(300);
    expect(featureValue(first, 'risk_age_seconds').value).toBe(600);
    expect(featureValue(second, 'market_age_seconds').value).toBe(600);
    expect(featureValue(second, 'risk_age_seconds').value).toBe(900);
    expect(featureSourceIdentity(first)).not.toBe(featureSourceIdentity(second));
  });
});

describe('feature engine historical and risk features', () => {
  it('uses a same-pair previous snapshot and computes observed changes', () => {
    const vector = sampleVector();
    expect(featureValue(vector, 'seconds_since_previous_snapshot').value).toBe(1800);
    expect(featureValue(vector, 'observed_price_change_from_previous_pct').value).toBe(25);
    expect(featureValue(vector, 'observed_liquidity_change_from_previous_pct').value).toBe(25);
  });

  it('rejects incompatible previous snapshots instead of computing a delta', () => {
    expect(() => {
      sampleVector({ previousMarket: previousSnapshot({ pairAddress: OTHER_PAIR }) });
    }).toThrow(/pair address/);
    expect(() => {
      sampleVector({ previousMarket: previousSnapshot({ tokenMint: USDC_MINT }) });
    }).toThrow(/token mint/);
    expect(() => {
      sampleVector({ previousMarket: previousSnapshot({ collectedAt: T_10_00 }) });
    }).toThrow(/strictly before/);
    expect(() => {
      sampleVector({ previousMarket: previousSnapshot({ collectedAt: T_10_05 }) });
    }).toThrow(/strictly before/);
  });

  it('makes observed changes unavailable when a previous price or liquidity is zero', () => {
    const zeroPrice = sampleVector({ previousMarket: previousSnapshot({ priceUsd: 0 }) });
    const zeroLiq = sampleVector({ previousMarket: previousSnapshot({ liquidityUsd: 0 }) });
    expect(featureValue(zeroPrice, 'observed_price_change_from_previous_pct').status).toBe('unavailable');
    expect(featureValue(zeroLiq, 'observed_liquidity_change_from_previous_pct').status).toBe('unavailable');
  });

  it('does not treat a missing risk report as false risk findings', () => {
    const vector = sampleVector({
      risk: null,
      riskUnavailableReason: 'risk scan failed',
    });
    expect(featureValue(vector, 'risk_finding_mint_authority_active')).toMatchObject({
      status: 'unavailable',
      value: null,
      unavailableReason: RISK_REPORT_UNAVAILABLE_REASON,
    });
    expect(featureValue(vector, 'risk_data_complete').status).toBe('unavailable');
    expect(featureValue(vector, 'risk_token_2022').value).toBeNull();

    const otherReason = sampleVector({
      risk: null,
      riskUnavailableReason: 'a different transient RPC error',
    });
    expect(otherReason.values).toEqual(vector.values);
  });

  it('maps risk completeness, program, findings, counts, and concentration', () => {
    const complete = sampleVector({
      risk: sampleRisk({
        dataCompleteness: 'complete',
        tokenProgram: 'spl_token',
        findings: [
          finding(FINDING_CODES.MINT_AUTHORITY_ACTIVE, 'high'),
          finding(FINDING_CODES.FREEZE_AUTHORITY_ACTIVE, 'high'),
          finding(FINDING_CODES.PERMANENT_DELEGATE_ACTIVE, 'critical'),
          finding(FINDING_CODES.NON_TRANSFERABLE_TOKEN, 'critical'),
          finding(FINDING_CODES.TRANSFER_HOOK_ACTIVE, 'high'),
          finding(FINDING_CODES.DEFAULT_ACCOUNT_STATE_FROZEN, 'high'),
          finding(FINDING_CODES.TRANSFER_FEE_CONFIGURED, 'medium'),
        ],
        highestFindingSeverity: 'critical',
        concentration: {
          top1Bps: 1111,
          top5Bps: 2222,
          top10Bps: 3333,
          top20Bps: 4444,
          observedAccountsCount: 1,
        },
      }),
    });

    expect(featureValue(complete, 'risk_data_complete').value).toBe(true);
    expect(featureValue(complete, 'risk_token_2022').value).toBe(false);
    expect(featureValue(complete, 'risk_finding_mint_authority_active').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_freeze_authority_active').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_permanent_delegate_active').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_non_transferable').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_transfer_hook_active').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_default_account_state_frozen').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_transfer_fee_configured').value).toBe(true);
    expect(featureValue(complete, 'risk_finding_count').value).toBe(7);
    expect(featureValue(complete, 'risk_critical_finding_count').value).toBe(2);
    expect(featureValue(complete, 'risk_high_finding_count').value).toBe(4);
    expect(featureValue(complete, 'risk_medium_finding_count').value).toBe(1);
    expect(featureValue(complete, 'risk_info_finding_count').value).toBe(0);
    expect(featureValue(complete, 'risk_top1_token_account_concentration_bps').value).toBe(1111);
    expect(featureValue(complete, 'risk_top5_token_account_concentration_bps').value).toBe(2222);
    expect(featureValue(complete, 'risk_top10_token_account_concentration_bps').value).toBe(3333);
    expect(featureValue(complete, 'risk_top20_token_account_concentration_bps').value).toBe(4444);
    expect(complete).not.toHaveProperty('riskScore');
    expect(JSON.stringify(complete)).not.toMatch(/risk_score|entry_score|alpha_score/);

    const token2022 = sampleVector({
      risk: sampleRisk({
        tokenProgram: 'token_2022',
        programOwner: TOKEN_2022_PROGRAM_ID,
        dataCompleteness: 'partial',
        findings: [],
        highestFindingSeverity: 'none',
        concentration: null,
        concentrationUnavailableReason: 'largest token accounts unavailable',
        checks: [
          { check: 'mint_account', ok: true, contextSlot: 100, error: null },
          { check: 'supply', ok: true, contextSlot: 101, error: null },
          { check: 'largest_accounts', ok: false, contextSlot: null, error: 'unavailable' },
        ],
        largestTokenAccounts: [],
      }),
    });
    expect(featureValue(token2022, 'risk_token_2022').value).toBe(true);
    expect(featureValue(token2022, 'risk_data_complete').value).toBe(false);
    expect(featureValue(token2022, 'risk_finding_mint_authority_active').value).toBe(false);
    expect(featureValue(token2022, 'risk_top1_token_account_concentration_bps').status).toBe('unavailable');
    expect(featureValue(token2022, 'risk_top1_token_account_concentration_bps').unavailableReason).toBe(
      CONCENTRATION_UNAVAILABLE_REASON,
    );
    expect(featureValue(token2022, 'risk_top1_token_account_concentration_bps').value).not.toBe(0);
    expect(featureValue(token2022, 'risk_age_seconds').value).toBe(300);
  });

  it('derives identical c06_v1 risk features from a live TokenRiskReport and its projection', () => {
    const report = sampleRisk({
      dataCompleteness: 'partial',
      tokenProgram: 'token_2022',
      programOwner: TOKEN_2022_PROGRAM_ID,
      findings: [
        finding(FINDING_CODES.MINT_AUTHORITY_ACTIVE, 'high'),
        finding(FINDING_CODES.TOKEN_ACCOUNT_CONCENTRATION_VERY_HIGH, 'critical'),
        finding(FINDING_CODES.UNCLASSIFIED_TOKEN_EXTENSION_PRESENT, 'info'),
      ],
      highestFindingSeverity: 'critical',
      concentration: null,
      concentrationUnavailableReason: 'largest token accounts unavailable',
      checks: [
        { check: 'mint_account', ok: true, contextSlot: 100, error: null },
        { check: 'supply', ok: true, contextSlot: 101, error: null },
        { check: 'largest_accounts', ok: false, contextSlot: null, error: 'unavailable' },
      ],
      largestTokenAccounts: [],
    });
    const facts = riskFeatureInputFromReport(report);
    expect(riskDerivedFeatures(report, FEATURE_AS_OF)).toEqual(
      riskDerivedFeaturesFromFacts(facts, FEATURE_AS_OF),
    );
    expect(facts).not.toHaveProperty('extensions');
    expect(facts).not.toHaveProperty('classified');
    expect(facts).not.toHaveProperty('rawName');
  });

  it('rejects future risk, mismatched tokens, and market collected after asOf', () => {
    expect(() => {
      sampleVector({ risk: sampleRisk({ scannedAt: T_10_05 }) });
    }).toThrow(/risk.scannedAt/);
    expect(() => {
      sampleVector({ risk: sampleRisk({ tokenMint: USDC_MINT }) });
    }).toThrow(/token mint/);
    expect(() => {
      generateFeatureVector(featureInputs({ market: sampleSnapshot({ collectedAt: T_10_05 }) }), {
        generatedAt: FEATURE_GENERATED_AT,
      });
    }).toThrow(/collectedAt/);
    expect(() => {
      generateFeatureVector(featureInputs(), { generatedAt: T_09_55 });
    }).toThrow(/generatedAt must be at or after asOf/);
  });

  it('allows historical recomputation with generatedAt after asOf', () => {
    const vector = generateFeatureVector(
      featureInputs({
        asOf: T_09_30,
        market: sampleSnapshot({ collectedAt: T_09_30 }),
        previousMarket: null,
        risk: sampleRisk({ scannedAt: T_09_00 }),
      }),
      { generatedAt: T_10_00 },
    );
    expect(vector.asOf).toBe(T_09_30);
    expect(vector.generatedAt).toBe(T_10_00);
    expect(featureValue(vector, 'market_age_seconds').value).toBe(0);
    expect(featureValue(vector, 'risk_age_seconds').value).toBe(1800);
  });

  it('accepts canonical UTC timestamps and rejects local, ambiguous, and invalid dates', () => {
    expect(requireUtcTimestamp(T_10_00, 'asOf')).toBe(Date.parse(T_10_00));
    expect(() => requireUtcTimestamp('2026-08-17 10:00', 'asOf')).toThrow(/UTC ISO-8601/);
    expect(() => requireUtcTimestamp('08/17/2026 10:00', 'asOf')).toThrow(/UTC ISO-8601/);
    expect(() => requireUtcTimestamp('2026-08-17T10:00:00', 'asOf')).toThrow(/UTC ISO-8601/);
    expect(() => requireUtcTimestamp('2026-08-17T10:00:00.000+02:00', 'asOf')).toThrow(/UTC ISO-8601/);
    expect(() => requireUtcTimestamp('2026-02-31T10:00:00.000Z', 'asOf')).toThrow(/valid UTC calendar/);
    expect(() => {
      generateFeatureVector(featureInputs({ asOf: '2026-08-17T10:00:00' }), { generatedAt: T_10_00 });
    }).toThrow(/asOf/);
  });
});

describe('feature engine integrity', () => {
  it('produces the same vector for the same inputs and uses explicit timestamps', () => {
    const first = sampleVector();
    const second = sampleVector();
    expect(first).toEqual(second);
    expect(first.generatedAt).toBe(FEATURE_GENERATED_AT);
    expect(first.asOf).toBe(FEATURE_AS_OF);
    expect(first.values.map((value) => value.name)).toEqual([...FEATURE_NAMES]);
    expect(first.availableFeatureCount + first.unavailableFeatureCount).toBe(featureRegistrySize());

    const laterGeneration = sampleVector({}, { generatedAt: T_10_05 });
    expect(featureSourceIdentity(laterGeneration)).toBe(featureSourceIdentity(first));
    expect(featureSourceIdentity(first)).toContain('"asOf"');
    expect(featureSourceIdentity(first)).not.toContain('generatedAt');
    expect(() => {
      assertSourceIdentity(first, '{"tampered":true}');
    }).toThrow(/sourceIdentity/);
  });

  it('counts available and unavailable features and allows a valid partial vector', () => {
    const complete = sampleVector();
    expect(complete.availableFeatureCount + complete.unavailableFeatureCount).toBe(FEATURE_NAMES.length);
    expect(complete.featureCompleteness).toBe('complete');

    const partial = sampleVector({
      previousMarket: null,
      risk: null,
      riskUnavailableReason: 'unavailable',
    });
    expect(partial.featureCompleteness).toBe('partial');
    expect(partial.unavailableFeatureCount).toBeGreaterThan(0);
    expect(partial.availableFeatureCount).toBeGreaterThan(0);
  });

  it('does not propagate NaN or Infinity into feature values', () => {
    const vector = sampleVector({
      market: sampleSnapshot({
        priceUsd: Number.NaN,
        liquidityUsd: Number.POSITIVE_INFINITY,
        volume5mUsd: Number.NEGATIVE_INFINITY,
      }),
    });
    expect(featureValue(vector, 'market_price_usd').status).toBe('unavailable');
    expect(featureValue(vector, 'market_liquidity_usd').status).toBe('unavailable');
    expect(featureValue(vector, 'volume_to_liquidity_5m_ratio').status).toBe('unavailable');
    for (const value of vector.values) {
      if (typeof value.value === 'number') {
        expect(Number.isFinite(value.value)).toBe(true);
      }
    }
  });

  it('does not call Date.now, randomness, network, or SQLite inside the engine', () => {
    const source = readFileSync(new URL('../src/features/engine.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/Date\.now|Math\.random|fetch\(|createSqlite|getSnapshot|scanTokenRisk/);
  });

  it('does not define buy/sell/strategy/PnL models', () => {
    const names = FEATURE_NAMES.join(',');
    expect(names).not.toMatch(/buy_signal|sell_signal|should_trade|expected_profit|position_size|pnl/i);
  });
});
