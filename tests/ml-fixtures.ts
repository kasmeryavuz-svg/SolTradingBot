import type { MarketSnapshot } from '../src/market-data/types.js';
import { buildMlDataset } from '../src/ml/dataset.js';
import { buildOptimizationIndexes } from '../src/optimization/timeline.js';
import { chronologicalCutMs } from '../src/optimization/partition.js';
import { makeOptimizationDataset, optimizationMint, qualityControlOnlySnapshot, s07LegalSnapshot, O17_END, O17_START } from './optimization-fixtures.js';
import { addMs } from './exit-fixtures.js';
import { PAIR_ADDRESS } from './feature-fixtures.js';
import type { MlDataset } from '../src/ml/types.js';

export const ML_T0 = '2026-01-01T00:00:00.000Z';
export const SIX_H_MS = 6 * 60 * 60 * 1000;

export function mlSnapshot(
  tokenMint: string,
  collectedAt: string,
  priceUsd: number,
  overrides: Partial<MarketSnapshot> = {},
): MarketSnapshot {
  return qualityControlOnlySnapshot({
    tokenMint,
    pairAddress: PAIR_ADDRESS,
    collectedAt,
    priceUsd,
    ...overrides,
  });
}

export function makeMlDataset(snapshots: readonly MarketSnapshot[]): MlDataset {
  return buildMlDataset({
    optimization: makeOptimizationDataset(snapshots),
  });
}

export function mlIndexes(snapshots: readonly MarketSnapshot[]) {
  const dataset = makeOptimizationDataset(snapshots);
  return buildOptimizationIndexes({
    marketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
}

export { optimizationMint, PAIR_ADDRESS, addMs, O17_START, O17_END };

export function eligibleWalkForwardSnapshots(): MarketSnapshot[] {
  const firstMs = Date.parse(O17_START);
  const lastMs = Date.parse(O17_END);
  const cuts = chronologicalCutMs(firstMs, lastMs);
  const snapshots: MarketSnapshot[] = [
    mlSnapshot(optimizationMint(0), O17_START, 100, {
      liquidityUsd: 1,
      volume5mUsd: 1,
      buys5m: 1,
      sells5m: 1,
      priceChange5mPct: 0,
    }),
    mlSnapshot(optimizationMint(0), O17_END, 101, {
      liquidityUsd: 1,
      volume5mUsd: 1,
      buys5m: 1,
      sells5m: 1,
      priceChange5mPct: 0,
    }),
  ];
  let mint = 1;
  for (let segment = 0; segment < 6; segment += 1) {
    const start = cuts[segment];
    if (start === undefined) {
      throw new Error('o17 cut missing');
    }
    const winners = segment < 2 ? 30 : 18;
    const losers = segment < 2 ? 30 : 18;
    const base = start + 2 * 3_600_000;
    const total = winners + losers;
    let winnerIndex = 0;
    let loserIndex = 0;
    for (let i = 0; i < total; i += 1) {
      const makeWinner = i % 2 === 0 && winnerIndex < winners || loserIndex >= losers;
      if (makeWinner) {
        winnerIndex += 1;
      } else {
        loserIndex += 1;
      }
      const tokenMint = optimizationMint(mint);
      mint += 1;
      const entryAt = base + i * 60_000;
      const liquidityUsd = 80_000 + (makeWinner ? 2_000 : 0) + (i % 9) * 400;
      const volume5mUsd = Math.round(liquidityUsd * 0.1);
      const actuallyWins = makeWinner;
      const exitPrice = actuallyWins ? 121 : 89;
      snapshots.push(
        s07LegalSnapshot({
          collectedAt: new Date(entryAt).toISOString(),
          tokenMint,
          priceUsd: 100,
          liquidityUsd,
          volume5mUsd,
        }),
      );
      snapshots.push(
        s07LegalSnapshot({
          collectedAt: new Date(entryAt + 3_600_000).toISOString(),
          tokenMint,
          priceUsd: exitPrice,
          liquidityUsd,
          volume5mUsd,
        }),
      );
    }
  }
  return snapshots;
}
