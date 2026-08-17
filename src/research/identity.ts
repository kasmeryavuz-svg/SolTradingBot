import { createHash } from 'node:crypto';
import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { marketSourceIdentity } from '../exit/identity.js';
import { canonicalResearchDefinition, type CanonicalResearchDefinition } from './definition.js';
import { RESEARCH_SPEC_VERSION } from './constants.js';
import type {
  ResearchCandidateId,
  ResearchCompletedTrade,
  ResearchDecisionCounts,
  ResearchLifecycleCounts,
  ResearchUnresolvedPosition,
} from './types.js';

export function fingerprintResearchDefinition(
  definition: CanonicalResearchDefinition = canonicalResearchDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const RESEARCH_DEFINITION_FINGERPRINT = fingerprintResearchDefinition();

export function researchMarketTimeIdentity(snapshot: Pick<MarketSnapshot, 'tokenMint' | 'pairAddress' | 'collectedAt'>): string {
  return marketSourceIdentity({
    tokenMint: snapshot.tokenMint,
    pairAddress: snapshot.pairAddress,
    collectedAt: snapshot.collectedAt,
  });
}

export function researchMarketObservationIdentity(snapshot: MarketSnapshot): string {
  return JSON.stringify({
    chain: snapshot.chain,
    tokenMint: snapshot.tokenMint,
    tokenName: snapshot.tokenName,
    tokenSymbol: snapshot.tokenSymbol,
    pairAddress: snapshot.pairAddress,
    collectedAt: snapshot.collectedAt,
    dexId: snapshot.dexId,
    quoteTokenMint: snapshot.quoteTokenMint,
    quoteTokenSymbol: snapshot.quoteTokenSymbol,
    priceUsd: snapshot.priceUsd,
    liquidityUsd: snapshot.liquidityUsd,
    volume5mUsd: snapshot.volume5mUsd,
    volume1hUsd: snapshot.volume1hUsd,
    volume24hUsd: snapshot.volume24hUsd,
    buys5m: snapshot.buys5m,
    sells5m: snapshot.sells5m,
    buys1h: snapshot.buys1h,
    sells1h: snapshot.sells1h,
    priceChange5mPct: snapshot.priceChange5mPct,
    priceChange1hPct: snapshot.priceChange1hPct,
    priceChange24hPct: snapshot.priceChange24hPct,
    marketCapUsd: snapshot.marketCapUsd,
    fdvUsd: snapshot.fdvUsd,
    pairCreatedAt: snapshot.pairCreatedAt,
  });
}

export function researchRiskEvidenceIdentity(risk: RiskFeatureInput): string {
  const findings = [...risk.findings]
    .map((finding) => ({
      code: finding.code,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
      title: finding.title,
      description: finding.description,
    }))
    .sort((left, right) => {
      if (left.code !== right.code) {
        return left.code < right.code ? -1 : 1;
      }
      if (left.severity !== right.severity) {
        return left.severity < right.severity ? -1 : 1;
      }
      return left.title < right.title ? -1 : 1;
    });

  return JSON.stringify({
    tokenMint: risk.tokenMint,
    scannedAt: risk.scannedAt,
    tokenProgram: risk.tokenProgram,
    dataCompleteness: risk.dataCompleteness,
    findings,
    concentration: risk.concentration,
  });
}

export function fingerprintResearchDataset(input: {
  researchDefinitionFingerprint: string;
  includedMarketObservationIdentities: readonly string[];
  riskEvidenceIdentities: readonly string[];
  excludedRuntimeExitMarketIdentities: readonly string[];
  runtimeExitReferencedSnapshotCountExcluded: number;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        researchDefinitionFingerprint: input.researchDefinitionFingerprint,
        includedMarketObservationIdentities: input.includedMarketObservationIdentities,
        riskEvidenceIdentities: input.riskEvidenceIdentities,
        excludedRuntimeExitMarketIdentities: input.excludedRuntimeExitMarketIdentities,
        runtimeExitReferencedSnapshotCountExcluded: input.runtimeExitReferencedSnapshotCountExcluded,
      }),
      'utf8',
    )
    .digest('hex');
}

export function researchPositionIdentity(input: {
  researchSpecVersion: string;
  researchDefinitionFingerprint: string;
  candidateDefinitionFingerprint: string;
  tokenMint: string;
  pairAddress: string;
  entryMarketIdentity: string;
  entryPriceUsd: number;
  entryReferenceNotionalUsd: number;
  quantityTokens: number;
}): string {
  return JSON.stringify({
    researchSpecVersion: input.researchSpecVersion,
    researchDefinitionFingerprint: input.researchDefinitionFingerprint,
    candidateDefinitionFingerprint: input.candidateDefinitionFingerprint,
    tokenMint: input.tokenMint,
    pairAddress: input.pairAddress,
    entryMarketIdentity: input.entryMarketIdentity,
    entryPriceUsd: input.entryPriceUsd,
    entryReferenceNotionalUsd: input.entryReferenceNotionalUsd,
    quantityTokens: input.quantityTokens,
  });
}

export function researchTradeIdentity(input: {
  researchSpecVersion: string;
  researchDefinitionFingerprint: string;
  candidateId: ResearchCandidateId;
  candidateDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  researchPositionIdentity: string;
  entryMarketIdentity: string;
  exitMarketIdentity: string;
  openedAt: string;
  exitedAt: string;
  entryPriceUsd: number;
  entryReferenceNotionalUsd: number;
  quantityTokens: number;
  exitPriceUsd: number;
  exitReason: string;
}): string {
  return JSON.stringify({
    researchSpecVersion: input.researchSpecVersion,
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
    entryReferenceNotionalUsd: input.entryReferenceNotionalUsd,
    quantityTokens: input.quantityTokens,
    exitPriceUsd: input.exitPriceUsd,
    exitReason: input.exitReason,
  });
}

export function fingerprintResearchCandidateRun(input: {
  researchDefinitionFingerprint: string;
  researchDatasetFingerprint: string;
  candidateDefinitionFingerprint: string;
  completedTradeIdentities: readonly string[];
  unresolvedRecords: readonly {
    researchPositionIdentity: string;
    unresolvedReason: string;
    lastExactPairMarketIdentity: string | null;
    lastExactPairExitReason: string | null;
  }[];
  decisions: ResearchDecisionCounts;
  lifecycle: Pick<
    ResearchLifecycleCounts,
    'positionsOpened' | 'completedPositions' | 'unresolvedPositions'
  >;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        researchSpecVersion: RESEARCH_SPEC_VERSION,
        researchDefinitionFingerprint: input.researchDefinitionFingerprint,
        researchDatasetFingerprint: input.researchDatasetFingerprint,
        candidateDefinitionFingerprint: input.candidateDefinitionFingerprint,
        completedTradeIdentities: input.completedTradeIdentities,
        unresolvedRecords: input.unresolvedRecords,
        decisions: input.decisions,
        lifecycle: input.lifecycle,
      }),
      'utf8',
    )
    .digest('hex');
}

export function orderedCompletedTradeIdentities(
  trades: readonly ResearchCompletedTrade[],
): string[] {
  return [...trades]
    .sort((left, right) => {
      if (left.exitedAt !== right.exitedAt) {
        return left.exitedAt < right.exitedAt ? -1 : 1;
      }
      if (left.researchTradeIdentity !== right.researchTradeIdentity) {
        return left.researchTradeIdentity < right.researchTradeIdentity ? -1 : 1;
      }
      return left.researchPositionIdentity < right.researchPositionIdentity ? -1 : 1;
    })
    .map((trade) => trade.researchTradeIdentity);
}

export function orderedUnresolvedRecords(
  positions: readonly ResearchUnresolvedPosition[],
): {
  researchPositionIdentity: string;
  unresolvedReason: string;
  lastExactPairMarketIdentity: string | null;
  lastExactPairExitReason: string | null;
}[] {
  return [...positions]
    .sort((left, right) => {
      if (left.openedAt !== right.openedAt) {
        return left.openedAt < right.openedAt ? -1 : 1;
      }
      return left.researchPositionIdentity < right.researchPositionIdentity ? -1 : 1;
    })
    .map((position) => ({
      researchPositionIdentity: position.researchPositionIdentity,
      unresolvedReason: position.unresolvedReason,
      lastExactPairMarketIdentity: position.lastExactPairMarketIdentity,
      lastExactPairExitReason: position.lastExactPairExitReason,
    }));
}
