import { calculateGrossTradeMetrics } from '../performance/trade.js';
import { requireUtcMillis } from '../performance/numbers.js';
import type { ClosedExitReason } from '../performance/types.js';
import {
  RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
  RESEARCH_SPEC_VERSION,
} from './constants.js';
import { researchTradeIdentity } from './identity.js';
import { ResearchError, type ResearchCandidateId, type ResearchCompletedTrade } from './types.js';

export function buildResearchCompletedTrade(input: {
  researchDefinitionFingerprint: string;
  candidateId: ResearchCandidateId;
  candidateDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  tokenMint: string;
  pairAddress: string;
  researchPositionIdentity: string;
  entryMarketIdentity: string;
  exitMarketIdentity: string;
  openedAt: string;
  exitedAt: string;
  entryPriceUsd: number;
  quantityTokens: number;
  exitPriceUsd: number;
  exitReason: ClosedExitReason;
}): ResearchCompletedTrade {
  if (!(input.entryPriceUsd > 0) || !Number.isFinite(input.entryPriceUsd)) {
    throw new ResearchError('Research entryPriceUsd must be finite and greater than 0.');
  }
  if (typeof input.exitPriceUsd !== 'number' || !Number.isFinite(input.exitPriceUsd) || input.exitPriceUsd < 0) {
    throw new ResearchError('Research exitPriceUsd must be a finite number greater than or equal to 0.');
  }

  const metrics = calculateGrossTradeMetrics({
    entryPriceUsd: input.entryPriceUsd,
    entryReferenceNotionalUsd: RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
    quantityTokens: input.quantityTokens,
    exitPriceUsd: input.exitPriceUsd,
    openedAtMs: requireUtcMillis(input.openedAt, 'openedAt'),
    exitedAtMs: requireUtcMillis(input.exitedAt, 'exitedAt'),
  });

  const identity = researchTradeIdentity({
    researchSpecVersion: RESEARCH_SPEC_VERSION,
    researchDefinitionFingerprint: input.researchDefinitionFingerprint,
    candidateId: input.candidateId,
    candidateDefinitionFingerprint: input.candidateDefinitionFingerprint,
    researchDatasetFingerprint: input.researchDatasetFingerprint,
    researchPositionIdentity: input.researchPositionIdentity,
    entryMarketIdentity: input.entryMarketIdentity,
    exitMarketIdentity: input.exitMarketIdentity,
    openedAt: input.openedAt,
    exitedAt: input.exitedAt,
    entryPriceUsd: input.entryPriceUsd,
    entryReferenceNotionalUsd: RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
    quantityTokens: input.quantityTokens,
    exitPriceUsd: input.exitPriceUsd,
    exitReason: input.exitReason,
  });

  return {
    researchSpecVersion: RESEARCH_SPEC_VERSION,
    researchDefinitionFingerprint: input.researchDefinitionFingerprint,
    candidateId: input.candidateId,
    candidateDefinitionFingerprint: input.candidateDefinitionFingerprint,
    researchDatasetFingerprint: input.researchDatasetFingerprint,
    tokenMint: input.tokenMint,
    pairAddress: input.pairAddress,
    researchPositionIdentity: input.researchPositionIdentity,
    entryMarketIdentity: input.entryMarketIdentity,
    exitMarketIdentity: input.exitMarketIdentity,
    researchTradeIdentity: identity,
    openedAt: input.openedAt,
    exitedAt: input.exitedAt,
    holdingDurationMs: metrics.holdingDurationMs,
    entryPriceUsd: input.entryPriceUsd,
    entryReferenceNotionalUsd: RESEARCH_ENTRY_REFERENCE_NOTIONAL_USD,
    quantityTokens: input.quantityTokens,
    exitPriceUsd: input.exitPriceUsd,
    exitReason: input.exitReason,
    grossExitValueUsd: metrics.grossExitValueUsd,
    grossPnlUsd: metrics.grossPnlUsd,
    grossReturnPct: metrics.grossReturnPct,
    outcome: metrics.outcome,
  };
}
