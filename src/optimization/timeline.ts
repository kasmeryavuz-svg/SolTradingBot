import { generateFeatureVector } from '../features/engine.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { FeatureVector, RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { compareLexical } from '../backtest/timeline.js';
import { sortResearchMarketEvents } from '../research/timeline.js';
import { OptimizationError } from './types.js';

export type OptimizationIndexes = {
  snapshotsByPair: Map<string, MarketSnapshot[]>;
  riskByToken: Map<string, RiskFeatureInput[]>;
};

export function pairKey(tokenMint: string, pairAddress: string): string {
  return `${tokenMint}\0${pairAddress}`;
}

export function buildOptimizationIndexes(input: {
  marketSnapshots: readonly MarketSnapshot[];
  riskReports: readonly RiskFeatureInput[];
}): OptimizationIndexes {
  const snapshotsByPair = new Map<string, MarketSnapshot[]>();
  for (const snapshot of sortResearchMarketEvents(input.marketSnapshots)) {
    const key = pairKey(snapshot.tokenMint, snapshot.pairAddress);
    const list = snapshotsByPair.get(key);
    if (list === undefined) {
      snapshotsByPair.set(key, [snapshot]);
    } else {
      list.push(snapshot);
    }
  }

  const riskByToken = new Map<string, RiskFeatureInput[]>();
  const orderedRisk = [...input.riskReports].sort((left, right) => {
    const token = compareLexical(left.tokenMint, right.tokenMint);
    if (token !== 0) {
      return token;
    }
    return compareLexical(left.scannedAt, right.scannedAt);
  });
  for (const risk of orderedRisk) {
    const list = riskByToken.get(risk.tokenMint);
    if (list === undefined) {
      riskByToken.set(risk.tokenMint, [risk]);
    } else {
      list.push(risk);
    }
  }

  return { snapshotsByPair, riskByToken };
}

export function selectPreviousMarketIndexed(
  current: MarketSnapshot,
  indexes: OptimizationIndexes,
): MarketSnapshot | null {
  const series = indexes.snapshotsByPair.get(pairKey(current.tokenMint, current.pairAddress));
  if (series === undefined || series.length === 0) {
    return null;
  }
  const currentMs = requireUtcTimestamp(current.collectedAt, 'market.collectedAt');
  let lo = 0;
  let hi = series.length - 1;
  let selected: MarketSnapshot | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = series[mid];
    if (candidate === undefined) {
      break;
    }
    const candidateMs = requireUtcTimestamp(candidate.collectedAt, 'previousMarket.collectedAt');
    if (candidateMs < currentMs) {
      selected = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return selected;
}

export function selectLatestRiskIndexed(
  tokenMint: string,
  asOf: string,
  indexes: OptimizationIndexes,
): RiskFeatureInput | null {
  const series = indexes.riskByToken.get(tokenMint);
  if (series === undefined || series.length === 0) {
    return null;
  }
  const asOfMs = requireUtcTimestamp(asOf, 'asOf');
  let lo = 0;
  let hi = series.length - 1;
  let selected: RiskFeatureInput | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const candidate = series[mid];
    if (candidate === undefined) {
      break;
    }
    const scannedMs = requireUtcTimestamp(candidate.scannedAt, 'risk.scannedAt');
    if (scannedMs <= asOfMs) {
      selected = candidate;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return selected;
}

export function reconstructIndexedPointInTimeVector(input: {
  snapshot: MarketSnapshot;
  indexes: OptimizationIndexes;
}): FeatureVector {
  const asOf = input.snapshot.collectedAt;
  const previousMarket = selectPreviousMarketIndexed(input.snapshot, input.indexes);
  if (previousMarket !== null) {
    const previousMs = requireUtcTimestamp(previousMarket.collectedAt, 'previousMarket.collectedAt');
    const currentMs = requireUtcTimestamp(input.snapshot.collectedAt, 'market.collectedAt');
    if (previousMs >= currentMs) {
      throw new OptimizationError('previousMarket must be strictly earlier than the current snapshot.');
    }
    if (previousMarket === input.snapshot) {
      throw new OptimizationError('A snapshot cannot use itself as previousMarket.');
    }
  }

  const risk = selectLatestRiskIndexed(input.snapshot.tokenMint, asOf, input.indexes);
  if (risk !== null) {
    const scannedMs = requireUtcTimestamp(risk.scannedAt, 'risk.scannedAt');
    const asOfMs = requireUtcTimestamp(asOf, 'asOf');
    if (scannedMs > asOfMs) {
      throw new OptimizationError('Risk evidence scanned after asOf cannot be used at T.');
    }
  }

  return generateFeatureVector(
    {
      market: input.snapshot,
      previousMarket,
      risk,
      riskUnavailableReason: null,
      asOf,
    },
    { generatedAt: asOf },
  );
}

export { sortResearchMarketEvents as sortOptimizationMarketEvents };
