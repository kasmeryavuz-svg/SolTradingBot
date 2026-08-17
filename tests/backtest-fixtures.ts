import { generateFeatureVector } from '../src/features/engine.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import type { TokenRiskReport } from '../src/risk/types.js';
import { evaluateStrategy } from '../src/strategy/evaluator.js';
import { runBacktest } from '../src/backtest/engine.js';
import type { BacktestDataset, BacktestScope } from '../src/backtest/types.js';
import {
  OTHER_PAIR,
  PAIR_ADDRESS,
  T_09_55,
  T_10_00,
  T_10_15,
  featureValue,
} from './feature-fixtures.js';
import { passingRisk, passingSnapshot } from './strategy-fixtures.js';

export const T_09_58 = '2026-08-17T09:58:00.000Z';
export const T_10_01 = '2026-08-17T10:01:00.000Z';
export const T_10_14_59_999 = '2026-08-17T10:14:59.999Z';
export const T_10_15_999 = '2026-08-17T10:15:00.999Z';
export const T_10_16 = '2026-08-17T10:16:00.000Z';
export const T_10_17 = '2026-08-17T10:17:00.000Z';
export const T_10_17_001 = '2026-08-17T10:17:00.001Z';

export function candidateSnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return passingSnapshot({
    collectedAt: T_10_00,
    ...overrides,
  });
}

export function candidateRisk(overrides: Partial<TokenRiskReport> = {}): TokenRiskReport {
  return passingRisk({
    scannedAt: T_09_55,
    ...overrides,
  });
}

export function outcomeOnlySnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return candidateSnapshot({
    collectedAt: T_10_15,
    priceUsd: 110,
    liquidityUsd: 1_000,
    ...overrides,
  });
}

export function replayVector(
  snapshot: MarketSnapshot,
  previousMarket: MarketSnapshot | null,
  risk: TokenRiskReport | null,
) {
  const asOf = snapshot.collectedAt;
  const vector = generateFeatureVector(
    {
      market: snapshot,
      previousMarket,
      risk,
      riskUnavailableReason: null,
      asOf,
    },
    { generatedAt: asOf },
  );
  const evaluation = evaluateStrategy(vector, { evaluatedAt: asOf });
  return { vector, evaluation };
}

export function runStudy(
  dataset: BacktestDataset,
  scope: BacktestScope = { kind: 'all' },
) {
  return runBacktest(dataset, { scope });
}

export function eventAt(
  datasetResult: ReturnType<typeof runStudy>,
  asOf: string,
  tokenMint?: string,
) {
  const event = datasetResult.events.find(
    (item) => item.asOf === asOf && (tokenMint === undefined || item.tokenMint === tokenMint),
  );
  if (event === undefined) {
    throw new Error(`Missing backtest event at ${asOf}`);
  }
  return event;
}

export function marketAge(snapshot: MarketSnapshot, previous: MarketSnapshot | null, risk: TokenRiskReport | null) {
  return featureValue(replayVector(snapshot, previous, risk).vector, 'market_age_seconds').value;
}

export { OTHER_PAIR, PAIR_ADDRESS, T_09_55, T_10_00, T_10_15 };
