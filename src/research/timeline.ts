import { generateFeatureVector } from '../features/engine.js';
import { requireUtcTimestamp } from '../features/numbers.js';
import type { FeatureVector, RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { compareLexical, selectLatestRisk, selectPreviousMarket } from '../backtest/timeline.js';
import {
  researchMarketObservationIdentity,
  researchMarketTimeIdentity,
} from './identity.js';
import { ResearchError } from './types.js';

export function sortResearchMarketEvents(snapshots: readonly MarketSnapshot[]): MarketSnapshot[] {
  return [...snapshots].sort((left, right) => {
    const leftMs = requireUtcTimestamp(left.collectedAt, 'market.collectedAt');
    const rightMs = requireUtcTimestamp(right.collectedAt, 'market.collectedAt');
    if (leftMs !== rightMs) {
      return leftMs < rightMs ? -1 : 1;
    }

    const token = compareLexical(left.tokenMint, right.tokenMint);
    if (token !== 0) {
      return token;
    }

    const pair = compareLexical(left.pairAddress, right.pairAddress);
    if (pair !== 0) {
      return pair;
    }

    const timeIdentity = compareLexical(researchMarketTimeIdentity(left), researchMarketTimeIdentity(right));
    if (timeIdentity !== 0) {
      return timeIdentity;
    }

    return compareLexical(researchMarketObservationIdentity(left), researchMarketObservationIdentity(right));
  });
}

export function reconstructPointInTimeVector(input: {
  snapshot: MarketSnapshot;
  researchMarketSnapshots: readonly MarketSnapshot[];
  riskReports: readonly RiskFeatureInput[];
}): FeatureVector {
  const asOf = input.snapshot.collectedAt;
  const previousMarket = selectPreviousMarket(input.snapshot, input.researchMarketSnapshots);
  if (previousMarket !== null) {
    const previousMs = requireUtcTimestamp(previousMarket.collectedAt, 'previousMarket.collectedAt');
    const currentMs = requireUtcTimestamp(input.snapshot.collectedAt, 'market.collectedAt');
    if (previousMs >= currentMs) {
      throw new ResearchError('previousMarket must be strictly earlier than the current research snapshot.');
    }
    if (previousMarket === input.snapshot) {
      throw new ResearchError('A research snapshot cannot use itself as previousMarket.');
    }
  }

  const risk = selectLatestRisk(input.snapshot.tokenMint, asOf, input.riskReports);
  if (risk !== null) {
    const scannedMs = requireUtcTimestamp(risk.scannedAt, 'risk.scannedAt');
    const asOfMs = requireUtcTimestamp(asOf, 'asOf');
    if (scannedMs > asOfMs) {
      throw new ResearchError('Risk evidence scanned after asOf cannot be used at T.');
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

export { selectLatestRisk, selectPreviousMarket };
