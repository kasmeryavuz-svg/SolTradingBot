import { evaluateExitAction } from '../exit/evaluator.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_SPEC_VERSION } from '../position/constants.js';
import { POSITION_DEFINITION_FINGERPRINT, positionEntrySourceIdentity } from '../position/identity.js';
import { derivePaperQuantityTokens } from '../position/invariants.js';
import type { OpenPaperPosition } from '../position/types.js';
import { CLOSED_EXIT_REASONS, type ClosedExitReason } from '../performance/types.js';
import { getResearchCandidateDescriptor } from './catalog.js';
import {
  RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
  RESEARCH_SPEC_VERSION,
} from './constants.js';
import { RESEARCH_DEFINITION_FINGERPRINT, researchMarketTimeIdentity, researchPositionIdentity } from './identity.js';
import { evaluateResearchCandidate } from './evaluator.js';
import { reconstructPointInTimeVector, sortResearchMarketEvents } from './timeline.js';
import { buildResearchCompletedTrade } from './trade.js';
import { ResearchError, type ResearchCandidateId, type ResearchCompletedTrade, type ResearchDataset, type ResearchDecisionCounts, type ResearchUnresolvedPosition } from './types.js';

export type ResearchSimulationResult = {
  candidateId: ResearchCandidateId;
  candidateDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  decisions: ResearchDecisionCounts;
  completedTrades: ResearchCompletedTrade[];
  unresolvedPositions: ResearchUnresolvedPosition[];
};

type OpenResearchPosition = {
  paper: OpenPaperPosition;
  researchPositionIdentity: string;
  entryMarketIdentity: string;
  lastExactPairMarketIdentity: string | null;
  lastExactPairExitReason: string | null;
};

export function simulateResearchCandidate(
  dataset: ResearchDataset,
  candidateId: ResearchCandidateId,
): ResearchSimulationResult {
  const descriptor = getResearchCandidateDescriptor(candidateId);
  const events = sortResearchMarketEvents(dataset.marketSnapshots);
  const openByToken = new Map<string, OpenResearchPosition>();
  const lastLifecycleCollectedAtByToken = new Map<string, string>();
  const completedTrades: ResearchCompletedTrade[] = [];
  const decisions: ResearchDecisionCounts = {
    evaluatedSnapshotCount: 0,
    entryCandidateCount: 0,
    noEntryCount: 0,
    insufficientDataCount: 0,
    skippedWhileOpenCount: 0,
  };

  for (const snapshot of events) {
    if (lastLifecycleCollectedAtByToken.get(snapshot.tokenMint) === snapshot.collectedAt) {
      continue;
    }
    lastLifecycleCollectedAtByToken.set(snapshot.tokenMint, snapshot.collectedAt);

    const open = openByToken.get(snapshot.tokenMint);
    if (open !== undefined) {
      decisions.skippedWhileOpenCount += 1;
      if (snapshot.pairAddress !== open.paper.pairAddress) {
        continue;
      }

      const evaluation = evaluateExitAction({
        openPosition: open.paper,
        marketSnapshot: snapshot,
      });
      const marketIdentity = researchMarketTimeIdentity(snapshot);
      open.lastExactPairMarketIdentity = marketIdentity;
      open.lastExactPairExitReason = evaluation.exitReason;

      if (evaluation.exitAction === 'no_change') {
        continue;
      }

      if (evaluation.simulatedExitPriceUsd === null) {
        throw new ResearchError('x11 close_position must provide a simulated exit price.');
      }
      if (!isClosedExitReason(evaluation.exitReason)) {
        throw new ResearchError(`Unexpected x11 close reason: ${evaluation.exitReason}.`);
      }

      completedTrades.push(
        buildResearchCompletedTrade({
          researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
          candidateId,
          candidateDefinitionFingerprint: descriptor.candidateDefinitionFingerprint,
          researchDatasetFingerprint: dataset.researchDatasetFingerprint,
          tokenMint: snapshot.tokenMint,
          pairAddress: snapshot.pairAddress,
          researchPositionIdentity: open.researchPositionIdentity,
          entryMarketIdentity: open.entryMarketIdentity,
          exitMarketIdentity: marketIdentity,
          openedAt: open.paper.openedAt,
          exitedAt: snapshot.collectedAt,
          entryPriceUsd: open.paper.entryPriceUsd,
          quantityTokens: open.paper.quantityTokens,
          exitPriceUsd: evaluation.simulatedExitPriceUsd,
          exitReason: evaluation.exitReason,
        }),
      );
      openByToken.delete(snapshot.tokenMint);
      continue;
    }

    const vector = reconstructPointInTimeVector({
      snapshot,
      researchMarketSnapshots: dataset.marketSnapshots,
      riskReports: dataset.riskReports,
    });
    const evaluation = evaluateResearchCandidate(candidateId, vector);
    decisions.evaluatedSnapshotCount += 1;
    if (evaluation.decision === 'entry_candidate') {
      decisions.entryCandidateCount += 1;
      openByToken.set(
        snapshot.tokenMint,
        openResearchPosition(descriptor.candidateDefinitionFingerprint, snapshot),
      );
    } else if (evaluation.decision === 'no_entry') {
      decisions.noEntryCount += 1;
    } else {
      decisions.insufficientDataCount += 1;
    }
  }

  const unresolvedPositions: ResearchUnresolvedPosition[] = [...openByToken.values()].map((open) => ({
    researchSpecVersion: RESEARCH_SPEC_VERSION,
    researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
    candidateId,
    candidateDefinitionFingerprint: descriptor.candidateDefinitionFingerprint,
    researchDatasetFingerprint: dataset.researchDatasetFingerprint,
    tokenMint: open.paper.tokenMint,
    pairAddress: open.paper.pairAddress,
    researchPositionIdentity: open.researchPositionIdentity,
    entryMarketIdentity: open.entryMarketIdentity,
    openedAt: open.paper.openedAt,
    unresolvedReason: 'unresolved_at_dataset_end',
    lastExactPairMarketIdentity: open.lastExactPairMarketIdentity,
    lastExactPairExitReason: open.lastExactPairExitReason,
  }));

  return {
    candidateId,
    candidateDefinitionFingerprint: descriptor.candidateDefinitionFingerprint,
    researchDatasetFingerprint: dataset.researchDatasetFingerprint,
    decisions,
    completedTrades,
    unresolvedPositions,
  };
}

function openResearchPosition(
  candidateDefinitionFingerprint: string,
  snapshot: MarketSnapshot,
): OpenResearchPosition {
  const entryPriceUsd = snapshot.priceUsd;
  if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || !(entryPriceUsd > 0)) {
    throw new ResearchError(
      'Research entry_candidate requires a finite snapshot priceUsd greater than 0. This is a paper reference entry, not a fill.',
    );
  }

  const quantityTokens = derivePaperQuantityTokens(entryPriceUsd);
  const entryMarketIdentity = researchMarketTimeIdentity(snapshot);
  const identity = researchPositionIdentity({
    researchSpecVersion: RESEARCH_SPEC_VERSION,
    researchDefinitionFingerprint: RESEARCH_DEFINITION_FINGERPRINT,
    candidateDefinitionFingerprint,
    tokenMint: snapshot.tokenMint,
    pairAddress: snapshot.pairAddress,
    entryMarketIdentity,
    entryPriceUsd,
    entryReferenceNotionalUsd: RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
    quantityTokens,
  });
  const positionSourceIdentity = positionEntrySourceIdentity({
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    openingPaperSourceIdentity: identity,
  });

  const paper: OpenPaperPosition = {
    chain: 'solana',
    tokenMint: snapshot.tokenMint,
    pairAddress: snapshot.pairAddress,
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    openedAt: snapshot.collectedAt,
    entryMarketCollectedAt: snapshot.collectedAt,
    entryPriceUsd,
    entryNotionalUsd: POSITION_ENTRY_NOTIONAL_USD,
    quantityTokens,
    openingPaperSourceIdentity: identity,
    positionSourceIdentity,
  };

  return {
    paper,
    researchPositionIdentity: identity,
    entryMarketIdentity,
    lastExactPairMarketIdentity: null,
    lastExactPairExitReason: null,
  };
}

function isClosedExitReason(reason: string): reason is ClosedExitReason {
  return (CLOSED_EXIT_REASONS as readonly string[]).includes(reason);
}
