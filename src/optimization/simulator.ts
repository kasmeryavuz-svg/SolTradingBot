import { requireUtcTimestamp } from '../features/numbers.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { requireUtcMillis } from '../performance/numbers.js';
import { calculateHoldingDurationMs } from '../performance/trade.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_SPEC_VERSION } from '../position/constants.js';
import { POSITION_DEFINITION_FINGERPRINT, positionEntrySourceIdentity } from '../position/identity.js';
import { derivePaperQuantityTokens } from '../position/invariants.js';
import type { OpenPaperPosition } from '../position/types.js';
import { getOptimizationEntryDescriptor, getOptimizationExitDescriptor } from './catalog.js';
import {
  OPTIMIZATION_ENTRY_REFERENCE_NOTIONAL_USD,
} from './constants.js';
import { evaluateOptimizationEntry } from './entries.js';
import {
  applyExitStepToState,
  evaluateOptimizationExitStep,
  type OpenOptimizationPositionState,
} from './exits.js';
import { isEntryEligible, isObservationInWindow } from './folds.js';
import {
  OPTIMIZATION_DEFINITION_FINGERPRINT,
  optimizationMarketTimeIdentity,
  optimizationPositionIdentity,
} from './identity.js';
import { allScenarioMetrics, buildCompletedTradeEconomics, coverageFromCounts, unresolvedAndPartialCounts } from './metrics.js';
import { pnlByToken } from './concentration.js';
import {
  reconstructIndexedPointInTimeVector,
  sortOptimizationMarketEvents,
  type OptimizationIndexes,
} from './timeline.js';
import {
  OptimizationError,
  type OptimizationCompletedTrade,
  type OptimizationDataset,
  type OptimizationDecisionCounts,
  type OptimizationEntryCandidateId,
  type OptimizationExitCandidateId,
  type OptimizationSimulationResult,
  type OptimizationUnresolvedPosition,
  type SimulationWindow,
} from './types.js';

export function simulateOptimizationPair(input: {
  dataset: OptimizationDataset;
  indexes: OptimizationIndexes;
  entryCandidateId: OptimizationEntryCandidateId;
  exitCandidateId: OptimizationExitCandidateId;
  window: SimulationWindow;
}): OptimizationSimulationResult {
  const entryDescriptor = getOptimizationEntryDescriptor(input.entryCandidateId);
  const exitDescriptor = getOptimizationExitDescriptor(input.exitCandidateId);
  const events = sortOptimizationMarketEvents(input.dataset.marketSnapshots);
  const openByToken = new Map<string, OpenOptimizationPositionState>();
  const lastLifecycleCollectedAtByToken = new Map<string, string>();
  const completedTrades: OptimizationCompletedTrade[] = [];
  const decisions: OptimizationDecisionCounts = {
    evaluatedSnapshotCount: 0,
    entryCandidateCount: 0,
    noEntryCount: 0,
    insufficientDataCount: 0,
    skippedWhileOpenCount: 0,
  };

  let snapshotsInWindow = 0;
  const tokensInWindow = new Set<string>();
  const pairsInWindow = new Set<string>();

  for (const snapshot of events) {
    const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
    if (!isObservationInWindow(collectedMs, input.window)) {
      continue;
    }
    snapshotsInWindow += 1;
    tokensInWindow.add(snapshot.tokenMint);
    pairsInWindow.add(`${snapshot.tokenMint}:${snapshot.pairAddress}`);

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
      const exitMarketIdentity = optimizationMarketTimeIdentity(snapshot);
      const step = evaluateOptimizationExitStep({
        exitCandidateId: input.exitCandidateId,
        open,
        marketSnapshot: snapshot,
        exitMarketIdentity,
      });
      const next = applyExitStepToState(open, step, snapshot, exitMarketIdentity);
      if (step.action === 'no_change') {
        openByToken.set(snapshot.tokenMint, next);
        continue;
      }
      if (step.positionFullyClosed || next.remainingQuantityTokens === 0) {
        completedTrades.push(
          buildCompletedTrade({
            open: next,
            tokenMint: snapshot.tokenMint,
            pairAddress: snapshot.pairAddress,
          }),
        );
        openByToken.delete(snapshot.tokenMint);
        continue;
      }
      openByToken.set(snapshot.tokenMint, next);
      continue;
    }

    if (!isEntryEligible(collectedMs, input.window)) {
      continue;
    }

    const vector = reconstructIndexedPointInTimeVector({
      snapshot,
      indexes: input.indexes,
    });
    const evaluation = evaluateOptimizationEntry(input.entryCandidateId, vector);
    decisions.evaluatedSnapshotCount += 1;
    if (evaluation.decision === 'entry_candidate') {
      decisions.entryCandidateCount += 1;
      openByToken.set(
        snapshot.tokenMint,
        openOptimizationPosition({
          snapshot,
          entryDefinitionFingerprint: entryDescriptor.candidateDefinitionFingerprint,
          exitDefinitionFingerprint: exitDescriptor.candidateDefinitionFingerprint,
        }),
      );
    } else if (evaluation.decision === 'no_entry') {
      decisions.noEntryCount += 1;
    } else {
      decisions.insufficientDataCount += 1;
    }
  }

  const unresolvedReason =
    input.window.kind === 'full_history' ? 'unresolved_at_dataset_end' : 'unresolved_at_fold_end';
  const unresolvedPositions: OptimizationUnresolvedPosition[] = [...openByToken.values()].map((open) => ({
    tokenMint: open.paper.tokenMint,
    pairAddress: open.paper.pairAddress,
    positionIdentity: open.paper.openingPaperSourceIdentity,
    entryMarketIdentity: optimizationMarketTimeIdentity({
      tokenMint: open.paper.tokenMint,
      pairAddress: open.paper.pairAddress,
      collectedAt: open.paper.openedAt,
    }),
    openedAt: open.paper.openedAt,
    unresolvedReason: open.realizedLegs.length > 0 ? 'partially_realized_censored' : unresolvedReason,
    realizedLegCount: open.realizedLegs.length,
    remainingQuantityTokens: open.remainingQuantityTokens,
    lastExactPairMarketIdentity: open.realizedLegs.at(-1)?.exitMarketIdentity ?? null,
  }));

  const counts = unresolvedAndPartialCounts(unresolvedPositions);
  const coverage = coverageFromCounts({
    snapshots: snapshotsInWindow,
    uniqueTokenMints: tokensInWindow.size,
    uniquePairs: pairsInWindow.size,
    openedPositions: completedTrades.length + unresolvedPositions.length,
    completedTrades: completedTrades.length,
    unresolvedTrades: counts.unresolvedTrades,
    partiallyCensoredTrades: counts.partiallyCensoredTrades,
  });
  const scenarios = allScenarioMetrics(completedTrades);

  return {
    entryCandidateId: input.entryCandidateId,
    exitCandidateId: input.exitCandidateId,
    entryDefinitionFingerprint: entryDescriptor.candidateDefinitionFingerprint,
    exitDefinitionFingerprint: exitDescriptor.candidateDefinitionFingerprint,
    decisions,
    coverage,
    completedTrades,
    unresolvedPositions,
    ...scenarios,
    pnlByToken: pnlByToken(completedTrades),
  };
}

function openOptimizationPosition(input: {
  snapshot: MarketSnapshot;
  entryDefinitionFingerprint: string;
  exitDefinitionFingerprint: string;
}): OpenOptimizationPositionState {
  const entryPriceUsd = input.snapshot.priceUsd;
  if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || !(entryPriceUsd > 0)) {
    throw new OptimizationError(
      'Optimization entry_candidate requires a finite snapshot priceUsd greater than 0.',
    );
  }
  const quantityTokens = derivePaperQuantityTokens(entryPriceUsd);
  const entryMarketIdentity = optimizationMarketTimeIdentity(input.snapshot);
  const identity = optimizationPositionIdentity({
    optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
    entryDefinitionFingerprint: input.entryDefinitionFingerprint,
    exitDefinitionFingerprint: input.exitDefinitionFingerprint,
    tokenMint: input.snapshot.tokenMint,
    pairAddress: input.snapshot.pairAddress,
    entryMarketIdentity,
    entryPriceUsd,
    quantityTokens,
  });
  const positionSourceIdentity = positionEntrySourceIdentity({
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    openingPaperSourceIdentity: identity,
  });
  const paper: OpenPaperPosition = {
    chain: 'solana',
    tokenMint: input.snapshot.tokenMint,
    pairAddress: input.snapshot.pairAddress,
    positionSpecVersion: POSITION_SPEC_VERSION,
    positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
    openedAt: input.snapshot.collectedAt,
    entryMarketCollectedAt: input.snapshot.collectedAt,
    entryPriceUsd,
    entryNotionalUsd: POSITION_ENTRY_NOTIONAL_USD,
    quantityTokens,
    openingPaperSourceIdentity: identity,
    positionSourceIdentity,
  };
  return {
    paper,
    originalQuantityTokens: quantityTokens,
    remainingQuantityTokens: quantityTokens,
    partialTakeTriggered: false,
    highestObservedPostEntryPriceUsd: null,
    realizedLegs: [],
  };
}

function buildCompletedTrade(input: {
  open: OpenOptimizationPositionState;
  tokenMint: string;
  pairAddress: string;
}): OptimizationCompletedTrade {
  const lastLeg = input.open.realizedLegs.at(-1);
  if (lastLeg === undefined) {
    throw new OptimizationError('Completed trade requires at least one realized leg.');
  }
  const economics = buildCompletedTradeEconomics({
    originalQuantityTokens: input.open.originalQuantityTokens,
    entryReferencePriceUsd: input.open.paper.entryPriceUsd,
    legs: input.open.realizedLegs,
  });
  return {
    tokenMint: input.tokenMint,
    pairAddress: input.pairAddress,
    positionIdentity: input.open.paper.openingPaperSourceIdentity,
    entryMarketIdentity: optimizationMarketTimeIdentity({
      tokenMint: input.open.paper.tokenMint,
      pairAddress: input.open.paper.pairAddress,
      collectedAt: input.open.paper.openedAt,
    }),
    openedAt: input.open.paper.openedAt,
    exitedAt: lastLeg.exitedAt,
    holdingDurationMs: calculateHoldingDurationMs(
      requireUtcMillis(input.open.paper.openedAt, 'openedAt'),
      requireUtcMillis(lastLeg.exitedAt, 'exitedAt'),
    ),
    entryReferencePriceUsd: input.open.paper.entryPriceUsd,
    entryReferenceNotionalUsd: OPTIMIZATION_ENTRY_REFERENCE_NOTIONAL_USD,
    originalQuantityTokens: input.open.originalQuantityTokens,
    legs: input.open.realizedLegs,
    ...economics,
  };
}
