import { USDC_MINT, WRAPPED_SOL_MINT } from '../src/config/index.js';
import { generateFeatureVector } from '../src/features/engine.js';
import type { FeatureInputs, FeatureName, FeatureVector } from '../src/features/index.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import type { MarketDataProvider } from '../src/market-data/provider.js';
import { FINDING_CODES } from '../src/risk/constants.js';
import type { RiskDataProvider } from '../src/risk/provider.js';
import type { RiskFinding, TokenRiskReport } from '../src/risk/types.js';
import { fakeRiskProvider, sampleReport } from './risk-fixtures.js';

export const FEATURE_AS_OF = '2026-08-17T10:00:00.000Z';
export const FEATURE_GENERATED_AT = '2026-08-17T10:00:00.000Z';
export const T_09_00 = '2026-08-17T09:00:00.000Z';
export const T_09_30 = '2026-08-17T09:30:00.000Z';
export const T_09_55 = '2026-08-17T09:55:00.000Z';
export const T_10_00 = '2026-08-17T10:00:00.000Z';
export const T_10_05 = '2026-08-17T10:05:00.000Z';
export const T_10_10 = '2026-08-17T10:10:00.000Z';
export const T_10_15 = '2026-08-17T10:15:00.000Z';
export const PAIR_ADDRESS = 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE';
export const OTHER_PAIR = 'BZtgQEyS6eXUXicYPHecYQ7PybqodXQMvkjUbP4R8mUU';

export function sampleSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return {
    chain: 'solana',
    tokenMint: WRAPPED_SOL_MINT,
    tokenName: 'Wrapped SOL',
    tokenSymbol: 'SOL',
    dexId: 'orca',
    pairAddress: PAIR_ADDRESS,
    quoteTokenMint: USDC_MINT,
    quoteTokenSymbol: 'USDC',
    priceUsd: 100,
    liquidityUsd: 25_000,
    volume5mUsd: 50,
    volume1hUsd: 500,
    volume24hUsd: 5_000,
    buys5m: 60,
    sells5m: 40,
    buys1h: 300,
    sells1h: 200,
    priceChange5mPct: 1.5,
    priceChange1hPct: -0.25,
    priceChange24hPct: 4,
    marketCapUsd: 100_000,
    fdvUsd: 200_000,
    pairCreatedAt: T_09_00,
    collectedAt: T_10_00,
    ...overrides,
  };
}

export function previousSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return sampleSnapshot({
    priceUsd: 80,
    liquidityUsd: 20_000,
    collectedAt: T_09_30,
    ...overrides,
  });
}

export function sampleRisk(overrides: Partial<TokenRiskReport> = {}): TokenRiskReport {
  return sampleReport({
    tokenMint: WRAPPED_SOL_MINT,
    scannedAt: T_09_55,
    ...overrides,
  });
}

export function finding(code: string, severity: RiskFinding['severity'] = 'high'): RiskFinding {
  return {
    code,
    category: code.includes('CONCENTRATION') ? 'concentration' : 'authority',
    severity,
    confidence: 'high',
    title: code,
    description: code,
  };
}

export function featureInputs(overrides: Partial<FeatureInputs> = {}): FeatureInputs {
  return {
    market: sampleSnapshot(),
    previousMarket: previousSnapshot(),
    risk: sampleRisk({
      findings: [finding(FINDING_CODES.MINT_AUTHORITY_ACTIVE)],
      highestFindingSeverity: 'high',
    }),
    riskUnavailableReason: null,
    asOf: FEATURE_AS_OF,
    ...overrides,
  };
}

export function sampleVector(
  overrides: Partial<FeatureInputs> = {},
  options: { generatedAt?: string } = {},
): FeatureVector {
  const inputs = featureInputs(overrides);
  return generateFeatureVector(inputs, {
    generatedAt: options.generatedAt ?? inputs.asOf,
  });
}

export function featureValue(vector: FeatureVector, name: FeatureName) {
  const value = vector.values.find((item) => item.name === name);
  if (value === undefined) {
    throw new Error(`Missing feature ${name}`);
  }

  return value;
}

export function fakeMarketProvider(snapshot: MarketSnapshot): MarketDataProvider {
  return {
    getSnapshot: () => Promise.resolve(snapshot),
  };
}

export function failingMarketProvider(message: string): MarketDataProvider {
  return {
    getSnapshot: () => Promise.reject(new Error(message)),
  };
}

export function liveRiskProvider(): RiskDataProvider {
  return fakeRiskProvider({
    mintSlot: 10,
    supplySlot: 11,
    largestSlot: 12,
  });
}
