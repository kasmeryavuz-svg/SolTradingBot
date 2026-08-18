import { createHash } from 'node:crypto';
import type { MarketSnapshot } from '../market-data/types.js';
import {
  researchMarketObservationIdentity,
  researchMarketTimeIdentity,
  researchRiskEvidenceIdentity,
} from '../research/identity.js';
import { canonicalOptimizationDefinition, type CanonicalOptimizationDefinition } from './definition.js';
import { COST_DEFINITION_FINGERPRINT } from './costs.js';
import { optimizationEntryCatalog, optimizationExitCatalog } from './catalog.js';
import { OPTIMIZATION_SPEC_VERSION } from './constants.js';

export function fingerprintOptimizationDefinition(
  definition: CanonicalOptimizationDefinition = canonicalOptimizationDefinition(),
): string {
  return createHash('sha256').update(JSON.stringify(definition), 'utf8').digest('hex');
}

export const OPTIMIZATION_DEFINITION_FINGERPRINT = fingerprintOptimizationDefinition();

export function optimizationMarketTimeIdentity(
  snapshot: Pick<MarketSnapshot, 'tokenMint' | 'pairAddress' | 'collectedAt'>,
): string {
  return researchMarketTimeIdentity(snapshot);
}

export function optimizationMarketObservationIdentity(snapshot: MarketSnapshot): string {
  return researchMarketObservationIdentity(snapshot);
}

export { researchRiskEvidenceIdentity };

/**
 * Dataset fingerprint projection (economic inputs).
 *
 * Binds:
 * - included research snapshot observation identities (full DexScreener
 *   market payload used by c06/r125/o17: mint, pair, collectedAt, price,
 *   liquidity, volumes, buys/sells, price changes, pairCreatedAt, names,
 *   dex, quote mint, marketCap, fdv)
 * - risk evidence identities (scan time, program, completeness, findings,
 *   concentration)
 * - exclusion provenance (exit-referenced snapshot identities + count)
 * - min/max timestamps and row counts
 *
 * Does not bind: current time, machine path, SQLite path, DB row ids.
 */
export const OPTIMIZATION_DATASET_FINGERPRINT_PROJECTION =
  'included_market_observation_identities+risk_evidence_identities+exit_exclusion_provenance+span_counts' as const;

export function fingerprintOptimizationDataset(input: {
  includedMarketObservationIdentities: readonly string[];
  riskEvidenceIdentities: readonly string[];
  excludedRuntimeExitMarketIdentities: readonly string[];
  runtimeExitReferencedSnapshotCountExcluded: number;
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
  rawMarketSnapshotCount: number;
  researchMarketSnapshotCount: number;
  uniqueTokenCount: number;
  uniquePairCount: number;
  riskScanCount: number;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        includedMarketObservationIdentities: input.includedMarketObservationIdentities,
        riskEvidenceIdentities: input.riskEvidenceIdentities,
        excludedRuntimeExitMarketIdentities: input.excludedRuntimeExitMarketIdentities,
        runtimeExitReferencedSnapshotCountExcluded: input.runtimeExitReferencedSnapshotCountExcluded,
        firstSnapshotAt: input.firstSnapshotAt,
        lastSnapshotAt: input.lastSnapshotAt,
        rawMarketSnapshotCount: input.rawMarketSnapshotCount,
        researchMarketSnapshotCount: input.researchMarketSnapshotCount,
        uniqueTokenCount: input.uniqueTokenCount,
        uniquePairCount: input.uniquePairCount,
        riskScanCount: input.riskScanCount,
      }),
      'utf8',
    )
    .digest('hex');
}

export function fingerprintOptimizationFold(input: {
  optimizationDefinitionFingerprint: string;
  optimizationDatasetFingerprint: string;
  foldId: number;
  trainStartInclusiveMs: number;
  trainEndExclusiveMs: number;
  testStartInclusiveMs: number;
  testEndExclusiveMs: number | null;
  testEndInclusiveMs: number;
  trainLatestEntryInclusiveMs: number;
  testLatestEntryInclusiveMs: number;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        optimizationDefinitionFingerprint: input.optimizationDefinitionFingerprint,
        optimizationDatasetFingerprint: input.optimizationDatasetFingerprint,
        foldId: input.foldId,
        trainStartInclusiveMs: input.trainStartInclusiveMs,
        trainEndExclusiveMs: input.trainEndExclusiveMs,
        testStartInclusiveMs: input.testStartInclusiveMs,
        testEndExclusiveMs: input.testEndExclusiveMs,
        testEndInclusiveMs: input.testEndInclusiveMs,
        trainLatestEntryInclusiveMs: input.trainLatestEntryInclusiveMs,
        testLatestEntryInclusiveMs: input.testLatestEntryInclusiveMs,
        entryCutoff: 'observationEnd_minus_MAX_OPTIMIZATION_HOLD_MS_inclusive',
        boundaryConstruction: 'integer_ms_span_divmod_6',
      }),
      'utf8',
    )
    .digest('hex');
}

export function fingerprintOptimizationRun(input: {
  optimizationDefinitionFingerprint: string;
  optimizationDatasetFingerprint: string;
}): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        optimizationSpecVersion: OPTIMIZATION_SPEC_VERSION,
        optimizationDefinitionFingerprint: input.optimizationDefinitionFingerprint,
        optimizationDatasetFingerprint: input.optimizationDatasetFingerprint,
        entryCatalogFingerprints: optimizationEntryCatalog(),
        exitCatalogFingerprints: optimizationExitCatalog(),
        costDefinitionFingerprint: COST_DEFINITION_FINGERPRINT,
      }),
      'utf8',
    )
    .digest('hex');
}

export function optimizationPositionIdentity(input: {
  optimizationDefinitionFingerprint: string;
  entryDefinitionFingerprint: string;
  exitDefinitionFingerprint: string;
  tokenMint: string;
  pairAddress: string;
  entryMarketIdentity: string;
  entryPriceUsd: number;
  quantityTokens: number;
}): string {
  return JSON.stringify({
    optimizationSpecVersion: OPTIMIZATION_SPEC_VERSION,
    optimizationDefinitionFingerprint: input.optimizationDefinitionFingerprint,
    entryDefinitionFingerprint: input.entryDefinitionFingerprint,
    exitDefinitionFingerprint: input.exitDefinitionFingerprint,
    tokenMint: input.tokenMint,
    pairAddress: input.pairAddress,
    entryMarketIdentity: input.entryMarketIdentity,
    entryPriceUsd: input.entryPriceUsd,
    quantityTokens: input.quantityTokens,
  });
}
