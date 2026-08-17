import { riskFeatureInputFromReport } from '../src/features/risk-features.js';
import type { RiskFeatureInput } from '../src/features/types.js';
import type { MarketSnapshot } from '../src/market-data/types.js';
import {
  RESEARCH_DEFINITION_FINGERPRINT,
  fingerprintResearchDataset,
  researchMarketObservationIdentity,
  researchMarketTimeIdentity,
  researchRiskEvidenceIdentity,
  sortResearchMarketEvents,
  type ResearchDataset,
} from '../src/research/index.js';
import { OTHER_PAIR, PAIR_ADDRESS, T_09_55, T_10_00, sampleSnapshot } from './feature-fixtures.js';
import { passingRisk, passingSnapshot } from './strategy-fixtures.js';

export function allEntrySnapshot(overrides: Partial<MarketSnapshot> = {}): MarketSnapshot {
  return passingSnapshot({
    priceUsd: 1,
    priceChange1hPct: 1,
    priceChange24hPct: 1,
    collectedAt: T_10_00,
    ...overrides,
  });
}

export function researchRisk(overrides: Parameters<typeof passingRisk>[0] = {}): RiskFeatureInput {
  return riskFeatureInputFromReport(
    passingRisk({
      scannedAt: T_09_55,
      ...overrides,
    }),
  );
}

export function makeResearchDataset(
  snapshots: readonly MarketSnapshot[],
  riskReports: readonly RiskFeatureInput[] = [researchRisk()],
  options: {
    rawMarketSnapshotCount?: number;
    runtimeExitReferencedSnapshotCountExcluded?: number;
    excludedRuntimeExitMarketIdentities?: readonly string[];
  } = {},
): ResearchDataset {
  const marketSnapshots = sortResearchMarketEvents(snapshots);
  const includedMarketObservationIdentities = marketSnapshots.map(researchMarketObservationIdentity);
  const includedMarketIdentities = marketSnapshots.map(researchMarketTimeIdentity);
  const riskEvidenceIdentities = [...riskReports]
    .sort((left, right) => {
      if (left.tokenMint !== right.tokenMint) {
        return left.tokenMint < right.tokenMint ? -1 : 1;
      }
      return left.scannedAt < right.scannedAt ? -1 : 1;
    })
    .map(researchRiskEvidenceIdentity);
  const excludedRuntimeExitMarketIdentities = options.excludedRuntimeExitMarketIdentities ?? [];
  const runtimeExitReferencedSnapshotCountExcluded =
    options.runtimeExitReferencedSnapshotCountExcluded ?? excludedRuntimeExitMarketIdentities.length;
  const firstSnapshotAt = marketSnapshots[0]?.collectedAt ?? null;
  const lastSnapshotAt = marketSnapshots[marketSnapshots.length - 1]?.collectedAt ?? null;

  return {
    researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
    researchDatasetFingerprint: fingerprintResearchDataset({
      researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
      includedMarketObservationIdentities,
      riskEvidenceIdentities,
      excludedRuntimeExitMarketIdentities,
      runtimeExitReferencedSnapshotCountExcluded,
    }),
    rawMarketSnapshotCount: options.rawMarketSnapshotCount ?? marketSnapshots.length,
    runtimeExitReferencedSnapshotCountExcluded,
    researchMarketSnapshotCount: marketSnapshots.length,
    uniqueTokenCount: new Set(marketSnapshots.map((snapshot) => snapshot.tokenMint)).size,
    uniquePairCount: new Set(marketSnapshots.map((snapshot) => `${snapshot.tokenMint}:${snapshot.pairAddress}`))
      .size,
    firstSnapshotAt,
    lastSnapshotAt,
    datasetSpanMs:
      firstSnapshotAt === null || lastSnapshotAt === null
        ? null
        : Date.parse(lastSnapshotAt) - Date.parse(firstSnapshotAt),
    riskScanCount: riskReports.length,
    uniqueTokensWithRiskScan: new Set(riskReports.map((report) => report.tokenMint)).size,
    snapshotsWithFinitePriceCount: marketSnapshots.filter(
      (snapshot) => typeof snapshot.priceUsd === 'number' && Number.isFinite(snapshot.priceUsd),
    ).length,
    snapshotsWithNullPriceCount: marketSnapshots.filter((snapshot) => snapshot.priceUsd === null).length,
    includedMarketIdentities,
    includedMarketObservationIdentities,
    riskEvidenceIdentities,
    excludedRuntimeExitMarketIdentities,
    marketSnapshots,
    riskReports,
  };
}

export { OTHER_PAIR, PAIR_ADDRESS, sampleSnapshot, T_10_00 };
