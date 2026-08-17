import { aggregateResearchCompletedTrades } from './aggregate.js';
import { getResearchCandidateDescriptor } from './catalog.js';
import { RESEARCH_SPEC_NAME, RESEARCH_SPEC_VERSION } from './constants.js';
import {
  fingerprintResearchCandidateRun,
  orderedCompletedTradeIdentities,
  orderedUnresolvedRecords,
  RESEARCH_DEFINITION_FINGERPRINT,
} from './identity.js';
import { divideFinite, multiplyFinite } from '../performance/numbers.js';
import { simulateResearchCandidate } from './simulator.js';
import { buildResearchSliceMetrics } from './slices.js';
import type {
  ResearchCandidateId,
  ResearchCandidateReport,
  ResearchCompareReport,
  ResearchDataset,
  ResearchLifecycleCounts,
} from './types.js';
import { RESEARCH_CANDIDATE_IDS } from './types.js';

export function buildResearchCompareReport(dataset: ResearchDataset): ResearchCompareReport {
  const candidates = RESEARCH_CANDIDATE_IDS.map((candidateId) =>
    buildResearchCandidateReport(dataset, candidateId),
  );

  return {
    researchSpecVersion: RESEARCH_SPEC_VERSION,
    researchSpecName: RESEARCH_SPEC_NAME,
    researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
    researchDatasetFingerprint: dataset.researchDatasetFingerprint,
    rawMarketSnapshotCount: dataset.rawMarketSnapshotCount,
    runtimeExitReferencedSnapshotCountExcluded: dataset.runtimeExitReferencedSnapshotCountExcluded,
    researchMarketSnapshotCount: dataset.researchMarketSnapshotCount,
    uniqueTokenCount: dataset.uniqueTokenCount,
    uniquePairCount: dataset.uniquePairCount,
    firstSnapshotAt: dataset.firstSnapshotAt,
    lastSnapshotAt: dataset.lastSnapshotAt,
    datasetSpanMs: dataset.datasetSpanMs,
    riskScanCount: dataset.riskScanCount,
    uniqueTokensWithRiskScan: dataset.uniqueTokensWithRiskScan,
    snapshotsWithFinitePriceCount: dataset.snapshotsWithFinitePriceCount,
    snapshotsWithNullPriceCount: dataset.snapshotsWithNullPriceCount,
    candidates,
  };
}

export function buildResearchCandidateReport(
  dataset: ResearchDataset,
  candidateId: ResearchCandidateId,
): ResearchCandidateReport {
  const descriptor = getResearchCandidateDescriptor(candidateId);
  const simulation = simulateResearchCandidate(dataset, candidateId);
  const lifecycle = lifecycleFromSimulation(simulation);
  const performance = aggregateResearchCompletedTrades(simulation.completedTrades);
  const candidateRunFingerprint = fingerprintResearchCandidateRun({
    researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
    researchDatasetFingerprint: dataset.researchDatasetFingerprint,
    candidateDefinitionFingerprint: descriptor.candidateDefinitionFingerprint,
    completedTradeIdentities: orderedCompletedTradeIdentities(simulation.completedTrades),
    unresolvedRecords: orderedUnresolvedRecords(simulation.unresolvedPositions),
    decisions: simulation.decisions,
    lifecycle: {
      positionsOpened: lifecycle.positionsOpened,
      completedPositions: lifecycle.completedPositions,
      unresolvedPositions: lifecycle.unresolvedPositions,
    },
  });

  return {
    candidate: descriptor,
    researchSpecVersion: RESEARCH_SPEC_VERSION,
    researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
    researchDatasetFingerprint: dataset.researchDatasetFingerprint,
    candidateRunFingerprint,
    coverage: {
      researchSnapshotCount: dataset.researchMarketSnapshotCount,
      uniqueTokenCount: dataset.uniqueTokenCount,
      uniquePairCount: dataset.uniquePairCount,
      firstSnapshotAt: dataset.firstSnapshotAt,
      lastSnapshotAt: dataset.lastSnapshotAt,
      datasetSpanMs: dataset.datasetSpanMs,
      riskScanCount: dataset.riskScanCount,
      uniqueTokensWithRiskScan: dataset.uniqueTokensWithRiskScan,
      snapshotsWithFinitePriceCount: dataset.snapshotsWithFinitePriceCount,
      snapshotsWithNullPriceCount: dataset.snapshotsWithNullPriceCount,
    },
    decisions: simulation.decisions,
    lifecycle,
    performance,
    slices: buildResearchSliceMetrics({
      trades: simulation.completedTrades,
      firstSnapshotAt: dataset.firstSnapshotAt,
      lastSnapshotAt: dataset.lastSnapshotAt,
    }),
    completedTrades: simulation.completedTrades,
    unresolvedPositions: simulation.unresolvedPositions,
  };
}

function lifecycleFromSimulation(simulation: {
  completedTrades: readonly { tokenMint: string }[];
  unresolvedPositions: readonly { tokenMint: string }[];
}): ResearchLifecycleCounts {
  const positionsOpened = simulation.completedTrades.length + simulation.unresolvedPositions.length;
  const uniqueTokens = new Set([
    ...simulation.completedTrades.map((trade) => trade.tokenMint),
    ...simulation.unresolvedPositions.map((position) => position.tokenMint),
  ]);
  return {
    positionsOpened,
    completedPositions: simulation.completedTrades.length,
    unresolvedPositions: simulation.unresolvedPositions.length,
    uniqueTokensTraded: uniqueTokens.size,
    completionRatePct:
      positionsOpened === 0
        ? null
        : multiplyFinite(
            divideFinite(simulation.completedTrades.length, positionsOpened, 'completion rate'),
            100,
            'completionRatePct',
          ),
  };
}
