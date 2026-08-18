import type { DatabaseConfig } from '../config/types.js';
import { currentSchemaVersion } from '../persistence/sqlite/migrations.js';
import { openReadOnlyResearchDatabase, SqliteResearchDataSource } from '../research/sqlite-source.js';
import { researchDatasetToOptimizationDataset } from '../optimization/dataset.js';
import {
  buildOptimizationIndexes,
  reconstructIndexedPointInTimeVector,
} from '../optimization/timeline.js';
import type { OptimizationDataset } from '../optimization/types.js';
import {
  FORBIDDEN_MIGRATION_010_PREFIX,
  REQUIRED_SCHEMA_VERSION,
} from './constants.js';
import { MlError } from './errors.js';
import { assignSampleIdentity, fingerprintMlDataset, ML_DEFINITION_FINGERPRINT } from './identity.js';
import { simulateX11Label } from './labels.js';
import { rawFeaturesFromVector } from './preprocessing.js';
import { selectDecisionObservations } from './sampling.js';
import type { MlDataset, MlDecisionSample, WalletIntelligenceReadiness } from './types.js';
import { emptyWalletIntelligenceReadiness, loadWalletIntelligenceReadiness } from './wallet-readiness.js';

export function buildMlDataset(input: {
  optimization: OptimizationDataset;
  walletIntelligenceReadiness?: WalletIntelligenceReadiness;
}): MlDataset {
  const indexes = buildOptimizationIndexes({
    marketSnapshots: input.optimization.marketSnapshots,
    riskReports: input.optimization.riskReports,
  });
  const selected = selectDecisionObservations(input.optimization.marketSnapshots);
  const samples: MlDecisionSample[] = selected.map((observation) => {
    const vector = reconstructIndexedPointInTimeVector({
      snapshot: observation.snapshot,
      indexes,
    });
    const rawFeatures = rawFeaturesFromVector(vector);
    const datasetLabel = simulateX11Label({
      entry: observation.snapshot,
      indexes,
      bound: null,
    });
    const entryPriceUsd = observation.snapshot.priceUsd;
    if (typeof entryPriceUsd !== 'number') {
      throw new MlError('Decision sample lost its finite entry price.');
    }
    return assignSampleIdentity({
      tokenMint: observation.snapshot.tokenMint,
      pairAddress: observation.snapshot.pairAddress,
      collectedAt: observation.snapshot.collectedAt,
      collectedAtMs: observation.collectedAtMs,
      entryPriceUsd,
      rawFeatures,
      datasetLabel,
    });
  });

  const labeled = samples.filter((sample) => sample.datasetLabel.state !== 'CENSORED');
  const positiveCount = labeled.filter((sample) => sample.datasetLabel.state === 'POSITIVE').length;
  const nonPositiveCount = labeled.filter((sample) => sample.datasetLabel.state === 'NON_POSITIVE').length;

  return {
    mlDefinitionFingerprint: ML_DEFINITION_FINGERPRINT,
    mlDatasetFingerprint: fingerprintMlDataset(samples),
    optimizationDatasetFingerprint: input.optimization.optimizationDatasetFingerprint,
    researchDatasetFingerprint: input.optimization.researchDatasetFingerprint,
    schemaVersion: input.optimization.schemaVersion,
    migration010Present: false,
    rawMarketSnapshotCount: input.optimization.rawMarketSnapshotCount,
    researchMarketSnapshotCount: input.optimization.researchMarketSnapshotCount,
    uniqueTokenCount: input.optimization.uniqueTokenCount,
    uniquePairCount: input.optimization.uniquePairCount,
    firstSnapshotAt: input.optimization.firstSnapshotAt,
    lastSnapshotAt: input.optimization.lastSnapshotAt,
    datasetSpanMs: input.optimization.datasetSpanMs,
    decisionSampleCount: samples.length,
    labeledCount: labeled.length,
    positiveCount,
    nonPositiveCount,
    censoredCount: samples.length - labeled.length,
    samples,
    marketSnapshots: input.optimization.marketSnapshots,
    riskReports: input.optimization.riskReports,
    optimization: input.optimization,
    walletIntelligenceReadiness:
      input.walletIntelligenceReadiness ??
      emptyWalletIntelligenceReadiness(),
  };
}

export function executeLoadMlDataset(config: { database: DatabaseConfig }): MlDataset {
  const database = openReadOnlyResearchDatabase(config.database);
  const source = new SqliteResearchDataSource(database);
  try {
    return source.withReadSnapshot(() => {
      source.verifyCompatibleSchema();
      source.verifyIntegrity();
      if (!source.queryOnlyEnabled()) {
        throw new MlError('ML commands require PRAGMA query_only = ON.');
      }
      const schemaVersion = currentSchemaVersion(database);
      if (schemaVersion !== REQUIRED_SCHEMA_VERSION) {
        throw new MlError(`Checkpoint 19 requires schema ${String(REQUIRED_SCHEMA_VERSION)}. Found ${String(schemaVersion)}.`);
      }
      const migration010 = database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE (type = 'table' OR type = 'trigger' OR type = 'index')
             AND name LIKE ?`,
        )
        .get(`${FORBIDDEN_MIGRATION_010_PREFIX}%`);
      if (migration010 !== undefined) {
        throw new MlError('Migration 010 must not exist.');
      }
      const schema010 = database
        .prepare(`SELECT version FROM schema_migrations WHERE version >= 10`)
        .get();
      if (schema010 !== undefined) {
        throw new MlError('Migration 010 must not exist.');
      }
      const forbiddenTable = database
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table'
             AND (name = 'ml_models'
               OR name = 'ml_predictions'
               OR name = 'ml_coefficients'
               OR name = 'ml_fold_results'
               OR name = 'ml_candidates'
               OR name = 'model_winners')`,
        )
        .get();
      if (forbiddenTable !== undefined) {
        throw new MlError('ML result tables must not exist.');
      }
      const optimization = researchDatasetToOptimizationDataset(source.loadResearchDataset(), schemaVersion);
      const walletIntelligenceReadiness = loadWalletIntelligenceReadiness(
        database,
        optimization.marketSnapshots,
      );
      const dataset = buildMlDataset({ optimization, walletIntelligenceReadiness });
      return dataset;
    });
  } finally {
    source.close();
  }
}
