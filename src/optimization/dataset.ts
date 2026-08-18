import type { AppConfig } from '../config/types.js';
import { currentSchemaVersion } from '../persistence/sqlite/migrations.js';
import type { ResearchDataset } from '../research/types.js';
import { openReadOnlyResearchDatabase, SqliteResearchDataSource } from '../research/sqlite-source.js';
import { REQUIRED_SCHEMA_VERSION } from './constants.js';
import { OPTIMIZATION_DEFINITION_FINGERPRINT, fingerprintOptimizationDataset } from './identity.js';
import { OptimizationError, type OptimizationDataset } from './types.js';

export function researchDatasetToOptimizationDataset(
  research: ResearchDataset,
  schemaVersion: number,
): OptimizationDataset {
  return {
    optimizationDefinitionFingerprint: OPTIMIZATION_DEFINITION_FINGERPRINT,
    optimizationDatasetFingerprint: fingerprintOptimizationDataset({
      includedMarketObservationIdentities: research.includedMarketObservationIdentities,
      riskEvidenceIdentities: research.riskEvidenceIdentities,
      excludedRuntimeExitMarketIdentities: research.excludedRuntimeExitMarketIdentities,
      runtimeExitReferencedSnapshotCountExcluded: research.runtimeExitReferencedSnapshotCountExcluded,
      firstSnapshotAt: research.firstSnapshotAt,
      lastSnapshotAt: research.lastSnapshotAt,
      rawMarketSnapshotCount: research.rawMarketSnapshotCount,
      researchMarketSnapshotCount: research.researchMarketSnapshotCount,
      uniqueTokenCount: research.uniqueTokenCount,
      uniquePairCount: research.uniquePairCount,
      riskScanCount: research.riskScanCount,
    }),
    researchDatasetFingerprint: research.researchDatasetFingerprint,
    rawMarketSnapshotCount: research.rawMarketSnapshotCount,
    runtimeExitReferencedSnapshotCountExcluded: research.runtimeExitReferencedSnapshotCountExcluded,
    researchMarketSnapshotCount: research.researchMarketSnapshotCount,
    uniqueTokenCount: research.uniqueTokenCount,
    uniquePairCount: research.uniquePairCount,
    firstSnapshotAt: research.firstSnapshotAt,
    lastSnapshotAt: research.lastSnapshotAt,
    datasetSpanMs: research.datasetSpanMs,
    riskScanCount: research.riskScanCount,
    uniqueTokensWithRiskScan: research.uniqueTokensWithRiskScan,
    snapshotsWithFinitePriceCount: research.snapshotsWithFinitePriceCount,
    snapshotsWithNullPriceCount: research.snapshotsWithNullPriceCount,
    includedMarketIdentities: research.includedMarketIdentities,
    includedMarketObservationIdentities: research.includedMarketObservationIdentities,
    riskEvidenceIdentities: research.riskEvidenceIdentities,
    excludedRuntimeExitMarketIdentities: research.excludedRuntimeExitMarketIdentities,
    marketSnapshots: research.marketSnapshots,
    riskReports: research.riskReports,
    schemaVersion,
    migration009Present: schemaVersion >= 9,
  };
}

export function executeLoadOptimizationDataset(config: AppConfig): OptimizationDataset {
  const database = openReadOnlyResearchDatabase(config.database);
  const source = new SqliteResearchDataSource(database);
  try {
    return source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      source.verifyIntegrity();
      if (!source.queryOnlyEnabled()) {
        throw new OptimizationError('Optimization commands require PRAGMA query_only = ON.');
      }
      const schemaVersion = currentSchemaVersion(database);
      if (schemaVersion < REQUIRED_SCHEMA_VERSION || schemaVersion > 9) {
        throw new OptimizationError(
          `Checkpoint 17 requires schema ${String(REQUIRED_SCHEMA_VERSION)} or 9. Found ${String(schemaVersion)}. Wallet-intelligence tables on schema 9 are unused by o17.`,
        );
      }
      const forbiddenTable = database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND (name = 'optimization_runs'
               OR name = 'optimization_results'
               OR name = 'hyperopt_results'
               OR name = 'strategy_winners'
               OR name = 'strategy_parameters')`,
        )
        .get();
      if (forbiddenTable !== undefined) {
        throw new OptimizationError('Optimization result tables must not exist.');
      }
      return researchDatasetToOptimizationDataset(source.loadResearchDataset(), schemaVersion);
    });
  } finally {
    source.close();
  }
}
