import type { DatabaseSync, SQLOutputValue, StatementSync } from 'node:sqlite';
import type { DatabaseConfig } from '../../config/types.js';
import type { DiscoveryCandidate, DiscoveryRunResult, DiscoverySource } from '../../discovery/types.js';
import { FEATURE_SET_VERSION } from '../../features/definitions.js';
import { featureValuesEqual } from '../../features/invariants.js';
import { featureSourceIdentity } from '../../features/numbers.js';
import type { FeatureValue, FeatureValueKind, FeatureValueStatus, FeatureVector } from '../../features/types.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from '../../strategy/constants.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentity } from '../../strategy/identity.js';
import { strategyEvaluationsSemanticallyEqual } from '../../strategy/invariants.js';
import type { StrategyDecision, StrategyEvaluation, StrategyRuleResult } from '../../strategy/types.js';
import type { MarketSnapshot } from '../../market-data/types.js';
import type {
  HighestFindingSeverity,
  RiskCheckName,
  RiskCheckResult,
  RiskFinding,
  RiskFindingCategory,
  RiskFindingSeverity,
  RiskConfidence,
  TokenExtensionObservation,
  TokenProgramKind,
  TokenRiskReport,
} from '../../risk/types.js';
import { clampHistoryLimit } from '../limits.js';
import type { PersistenceRepository } from '../repository.js';
import type {
  FeatureBundle,
  PersistenceIntegrity,
  PersistenceStats,
  RecordedFeatureBundle,
  RecordedRiskScan,
  RecordedRun,
  RecordedStrategyBundle,
  StoredFeatureVectorSummary,
  StoredObservation,
  StoredRiskScanSummary,
  StoredSourceResult,
  StoredStrategyEvaluationSummary,
  StoredToken,
  StrategyBundle,
  TokenFeatureHistory,
  TokenHistory,
  TokenRiskHistory,
  TokenStrategyHistory,
} from '../types.js';
import { PersistenceError } from '../types.js';
import {
  assertPersistableCandidate,
  assertPersistableFeatureVector,
  assertPersistableRiskReport,
  assertPersistableSnapshot,
  assertPersistableStrategyEvaluation,
} from '../validate.js';
import { openSqliteDatabase, readPragmaValue } from './database.js';
import { applyMigrations, currentSchemaVersion } from './migrations.js';
import { interpretIntegrityPragmas } from './integrity.js';
import {
  asNumber,
  asNullableNumber,
  asNullableString,
  asString,
  mapObservationRow,
  mapSnapshotRow,
  mapSourceResultRow,
  mapTokenRow,
} from './row-mappers.js';

type Statements = {
  getToken: StatementSync;
  insertToken: StatementSync;
  updateTokenTimes: StatementSync;
  insertRun: StatementSync;
  insertSourceResult: StatementSync;
  insertObservation: StatementSync;
  insertObservationSource: StatementSync;
  insertLink: StatementSync;
  insertSnapshot: StatementSync;
  countTokens: StatementSync;
  countRuns: StatementSync;
  countObservations: StatementSync;
  countSnapshots: StatementSync;
  observationBounds: StatementSync;
  recentObservations: StatementSync;
  observationSources: StatementSync;
  sourceResultsForRun: StatementSync;
  marketHistory: StatementSync;
  snapshotOwnership: StatementSync;
  countSourceResults: StatementSync;
  countObservationSources: StatementSync;
  countLinks: StatementSync;
  countMigrations: StatementSync;
  insertRiskScan: StatementSync;
  insertRiskCheck: StatementSync;
  insertRiskExtension: StatementSync;
  insertRiskAccount: StatementSync;
  insertRiskFinding: StatementSync;
  countRiskScans: StatementSync;
  countRiskChecks: StatementSync;
  countRiskExtensions: StatementSync;
  countRiskAccounts: StatementSync;
  countRiskFindings: StatementSync;
  riskHistory: StatementSync;
  riskChecks: StatementSync;
  riskExtensions: StatementSync;
  riskAccounts: StatementSync;
  riskFindings: StatementSync;
  previousSnapshot: StatementSync;
  snapshotByIdentity: StatementSync;
  riskAsOf: StatementSync;
  getRiskByScannedAt: StatementSync;
  insertFeatureVector: StatementSync;
  insertFeatureValue: StatementSync;
  getFeatureByIdentity: StatementSync;
  getFeatureById: StatementSync;
  featureHistory: StatementSync;
  featureValues: StatementSync;
  countFeatureVectors: StatementSync;
  countFeatureValues: StatementSync;
  getStrategyDefinition: StatementSync;
  insertStrategyDefinition: StatementSync;
  getStrategyByIdentity: StatementSync;
  insertStrategyEvaluation: StatementSync;
  insertStrategyRuleResult: StatementSync;
  strategyHistory: StatementSync;
  strategyRuleResults: StatementSync;
  countStrategyEvaluations: StatementSync;
  countStrategyDefinitions: StatementSync;
  countStrategyRuleResults: StatementSync;
};

export class SqlitePersistenceRepository implements PersistenceRepository {
  private readonly database: DatabaseSync;
  private statements: Statements | null = null;

  constructor(options: { path: string; busyTimeoutMs: number }) {
    this.database = openSqliteDatabase(options);
  }

  initialize(): void {
    try {
      applyMigrations(this.database);
      this.statements = prepareStatements(this.database);
    } catch (error: unknown) {
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Migration failed. The local database was rolled back.', {
        cause: error,
      });
    }
  }

  recordDiscoveryRun(result: DiscoveryRunResult): RecordedRun {
    return this.transact(() => this.persistDiscoveryRun(result));
  }

  recordDiscoveryRunAndAbort(result: DiscoveryRunResult): void {
    this.transact(() => {
      this.persistDiscoveryRun(result);
      throw new PersistenceError('Test-forced write failure.');
    });
  }

  recordRiskReport(report: TokenRiskReport): RecordedRiskScan {
    return this.transact(() => this.persistRiskReport(report));
  }

  recordRiskReportAndAbort(report: TokenRiskReport): void {
    this.transact(() => {
      this.persistRiskReport(report);
      throw new PersistenceError('Test-forced write failure.');
    });
  }

  recordRiskReportAndAbortAfterChild(report: TokenRiskReport): void {
    this.transact(() => {
      assertPersistableRiskReport(report);
      const statements = this.requireStatements();
      const token = this.upsertToken(report.tokenMint, report.scannedAt, report.scannedAt);
      const inserted = statements.insertRiskScan.run(
        token.id,
        report.scannedAt,
        report.commitment,
        report.tokenProgram,
        report.programOwner,
        report.mintContextSlot,
        report.supplyContextSlot,
        report.largestAccountsContextSlot,
        report.decimals,
        report.supplyRaw,
        report.mintAuthority,
        report.freezeAuthority,
        report.concentration?.top1Bps ?? null,
        report.concentration?.top5Bps ?? null,
        report.concentration?.top10Bps ?? null,
        report.concentration?.top20Bps ?? null,
        report.largestTokenAccounts.length,
        report.dataCompleteness,
        report.highestFindingSeverity,
      );
      const scanId = Number(inserted.lastInsertRowid);
      const check = report.checks[0];
      if (check === undefined) {
        throw new PersistenceError('Risk report is missing checks.');
      }

      statements.insertRiskCheck.run(
        scanId,
        check.check,
        check.ok ? 1 : 0,
        check.contextSlot,
        check.error,
      );
      throw new PersistenceError('Test-forced write failure after child insert.');
    });
  }

  recordMarketSnapshots(snapshots: readonly MarketSnapshot[]): number {
    return this.transact(() => {
      let written = 0;
      for (const snapshot of snapshots) {
        assertPersistableSnapshot(snapshot);
        const token = this.upsertToken(snapshot.tokenMint, snapshot.collectedAt, snapshot.collectedAt);
        written += this.insertSnapshot(token.id, null, snapshot);
      }
      return written;
    });
  }

  recordFeatureBundle(bundle: FeatureBundle): RecordedFeatureBundle {
    return this.transact(() => this.persistFeatureBundle(bundle));
  }

  recordFeatureBundleAndAbortAfterChild(bundle: FeatureBundle): void {
    this.transact(() => {
      this.persistFeatureBundle(bundle, { abortAfterFirstValue: true });
    });
  }

  recordStrategyBundle(bundle: StrategyBundle): RecordedStrategyBundle {
    return this.transact(() => this.persistStrategyBundle(bundle));
  }

  recordStrategyBundleAndAbortAfterChild(bundle: StrategyBundle): void {
    this.transact(() => {
      this.persistStrategyBundle(bundle, { abortAfterFirstRule: true });
    });
  }

  getPreviousMarketSnapshot(
    tokenMint: string,
    pairAddress: string,
    beforeCollectedAt: string,
  ): MarketSnapshot | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const row = this.requireStatements().previousSnapshot.get(token.id, pairAddress, beforeCollectedAt);
    return row === undefined ? null : mapSnapshotRow(row, token.mint);
  }

  getLatestRiskScanAsOf(tokenMint: string, asOf: string): StoredRiskScanSummary | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const row = this.requireStatements().riskAsOf.get(token.id, asOf);
    return row === undefined ? null : this.mapRiskScanSummary(row);
  }

  getFeatureHistory(tokenMint: string, limit: number): TokenFeatureHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const rows = this.requireStatements().featureHistory.all(token.id, clampHistoryLimit(limit));
    return {
      token,
      vectors: rows.map((row) => this.mapFeatureVectorSummary(row)),
    };
  }

  getStrategyHistory(tokenMint: string, limit: number): TokenStrategyHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const rows = this.requireStatements().strategyHistory.all(token.id, clampHistoryLimit(limit));
    return {
      token,
      evaluations: rows.map((row) => this.mapStrategyEvaluationSummary(row)),
    };
  }

  getTableCounts(): {
    tokens: number;
    discoveryRuns: number;
    discoverySourceResults: number;
    discoveryObservations: number;
    discoveryObservationSources: number;
    discoveryLinks: number;
    marketSnapshots: number;
    riskScans: number;
    riskScanChecks: number;
    riskScanExtensions: number;
    riskTopTokenAccounts: number;
    riskFindings: number;
    featureVectors: number;
    featureValues: number;
    strategyDefinitions: number;
    strategyEvaluations: number;
    strategyRuleResults: number;
    schemaMigrations: number;
  } {
    const statements = this.requireStatements();
    return {
      tokens: asNumber(statements.countTokens.get()?.['count']),
      discoveryRuns: asNumber(statements.countRuns.get()?.['count']),
      discoverySourceResults: asNumber(statements.countSourceResults.get()?.['count']),
      discoveryObservations: asNumber(statements.countObservations.get()?.['count']),
      discoveryObservationSources: asNumber(statements.countObservationSources.get()?.['count']),
      discoveryLinks: asNumber(statements.countLinks.get()?.['count']),
      marketSnapshots: asNumber(statements.countSnapshots.get()?.['count']),
      riskScans: asNumber(statements.countRiskScans.get()?.['count']),
      riskScanChecks: asNumber(statements.countRiskChecks.get()?.['count']),
      riskScanExtensions: asNumber(statements.countRiskExtensions.get()?.['count']),
      riskTopTokenAccounts: asNumber(statements.countRiskAccounts.get()?.['count']),
      riskFindings: asNumber(statements.countRiskFindings.get()?.['count']),
      featureVectors: asNumber(statements.countFeatureVectors.get()?.['count']),
      featureValues: asNumber(statements.countFeatureValues.get()?.['count']),
      strategyDefinitions: asNumber(statements.countStrategyDefinitions.get()?.['count']),
      strategyEvaluations: asNumber(statements.countStrategyEvaluations.get()?.['count']),
      strategyRuleResults: asNumber(statements.countStrategyRuleResults.get()?.['count']),
      schemaMigrations: asNumber(statements.countMigrations.get()?.['count']),
    };
  }

  getSnapshotOwnership(tokenMint: string): { collectedAt: string; discoveryObservationId: number | null }[] {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return [];
    }

    return this.requireStatements()
      .snapshotOwnership.all(token.id)
      .map((row) => ({
        collectedAt: asString(row['collected_at']),
        discoveryObservationId: asNullableNumber(row['discovery_observation_id']),
      }));
  }

  getStats(): PersistenceStats {
    const statements = this.requireStatements();
    const bounds = statements.observationBounds.get();

    return {
      schemaVersion: currentSchemaVersion(this.database),
      foreignKeysEnabled: readPragmaValue(this.database, 'foreign_keys') === '1',
      journalMode: readPragmaValue(this.database, 'journal_mode'),
      integrity: this.verifyIntegrity(),
      tokenCount: asNumber(statements.countTokens.get()?.['count']),
      discoveryRunCount: asNumber(statements.countRuns.get()?.['count']),
      discoveryObservationCount: asNumber(statements.countObservations.get()?.['count']),
      marketSnapshotCount: asNumber(statements.countSnapshots.get()?.['count']),
      riskScanCount: asNumber(statements.countRiskScans.get()?.['count']),
      featureVectorCount: asNumber(statements.countFeatureVectors.get()?.['count']),
      strategyEvaluationCount: asNumber(statements.countStrategyEvaluations.get()?.['count']),
      earliestObservationAt: asNullableString(bounds?.['earliest']),
      latestObservationAt: asNullableString(bounds?.['latest']),
    };
  }

  getToken(tokenMint: string): StoredToken | null {
    const row = this.requireStatements().getToken.get(tokenMint);
    return row === undefined ? null : mapTokenRow(row);
  }

  getRecentDiscoveryObservations(limit: number): StoredObservation[] {
    const statements = this.requireStatements();
    const rows = statements.recentObservations.all(clampHistoryLimit(limit));
    return rows.map((row) =>
      mapObservationRow(row, this.readObservationSources(asNumber(row['id']))),
    );
  }

  getSourceResultsForRun(runId: number): StoredSourceResult[] {
    return this.requireStatements()
      .sourceResultsForRun.all(runId)
      .map((row) => mapSourceResultRow(row));
  }

  getRiskHistory(tokenMint: string, limit: number): TokenRiskHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const statements = this.requireStatements();
    const scans = statements.riskHistory.all(token.id, clampHistoryLimit(limit)).map((row) =>
      this.mapRiskScanSummary(row),
    );

    return { token, scans };
  }

  getMarketHistory(tokenMint: string, limit: number): TokenHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const rows = this.requireStatements().marketHistory.all(token.id, clampHistoryLimit(limit));
    return {
      token,
      snapshots: rows.map((row) => mapSnapshotRow(row, token.mint)),
    };
  }

  verifyIntegrity(): PersistenceIntegrity {
    try {
      const check = this.database.prepare('PRAGMA quick_check').get();
      const foreignKeys = this.database.prepare('PRAGMA foreign_key_check').all();
      const quickCheck = check === undefined ? '' : String(Object.values(check)[0] ?? '');
      return interpretIntegrityPragmas(quickCheck, foreignKeys.length);
    } catch (error: unknown) {
      throw new PersistenceError('Integrity check failed.', { cause: error });
    }
  }

  close(): void {
    this.database.close();
  }

  private persistRiskReport(report: TokenRiskReport): RecordedRiskScan {
    assertPersistableRiskReport(report);
    const statements = this.requireStatements();
    const token = this.upsertToken(report.tokenMint, report.scannedAt, report.scannedAt);
    const inserted = statements.insertRiskScan.run(
      token.id,
      report.scannedAt,
      report.commitment,
      report.tokenProgram,
      report.programOwner,
      report.mintContextSlot,
      report.supplyContextSlot,
      report.largestAccountsContextSlot,
      report.decimals,
      report.supplyRaw,
      report.mintAuthority,
      report.freezeAuthority,
      report.concentration?.top1Bps ?? null,
      report.concentration?.top5Bps ?? null,
      report.concentration?.top10Bps ?? null,
      report.concentration?.top20Bps ?? null,
      report.largestTokenAccounts.length,
      report.dataCompleteness,
      report.highestFindingSeverity,
    );
    const scanId = Number(inserted.lastInsertRowid);

    for (const check of report.checks) {
      statements.insertRiskCheck.run(
        scanId,
        check.check,
        check.ok ? 1 : 0,
        check.contextSlot,
        check.error,
      );
    }

    for (const [ordinal, extension] of report.extensions.entries()) {
      statements.insertRiskExtension.run(
        scanId,
        ordinal,
        extension.name,
        extension.authority,
        extension.programId,
        extension.state,
        extension.transferFeeBasisPoints,
        extension.maximumFeeRaw,
        extension.parsed ? 1 : 0,
      );
    }

    for (const account of report.largestTokenAccounts) {
      statements.insertRiskAccount.run(
        scanId,
        account.rank,
        account.tokenAccount,
        account.amountRaw,
        account.shareBps,
      );
    }

    for (const finding of report.findings) {
      statements.insertRiskFinding.run(
        scanId,
        finding.code,
        finding.category,
        finding.severity,
        finding.confidence,
        finding.title,
        finding.description,
      );
    }

    return {
      scanId,
      tokenMint: report.tokenMint,
      scannedAt: report.scannedAt,
      tokenInserted: token.inserted,
    };
  }

  private persistFeatureBundle(
    bundle: FeatureBundle,
    options: { abortAfterFirstValue?: boolean } = {},
  ): RecordedFeatureBundle {
    assertPersistableSnapshot(bundle.marketSnapshot);
    assertPersistableFeatureVector(bundle.featureVector);
    this.assertBundleConsistency(bundle);

    const vector = bundle.featureVector;
    const sourceIdentity = featureSourceIdentity(vector);
    const existing = this.requireStatements().getFeatureByIdentity.get(sourceIdentity);
    if (existing !== undefined) {
      const existingValues = this.readFeatureValues(asNumber(existing['id']));
      if (!featureValuesEqual(existingValues, vector.values)) {
        throw new PersistenceError(
          'Source identity already exists with different feature values. Change FEATURE_SET_VERSION if semantics changed.',
        );
      }

      const token = this.getToken(vector.tokenMint);
      if (token === null) {
        throw new PersistenceError('Feature vector token is missing after source identity reuse.');
      }
      this.persistMarketSnapshotIfAbsent(token.id, bundle.marketSnapshot);
      if (bundle.riskReport !== null) {
        this.persistRiskReportIfAbsent(bundle.riskReport);
      }

      return {
        vectorId: asNumber(existing['id']),
        tokenMint: vector.tokenMint,
        sourceIdentity,
        inserted: false,
        tokenInserted: false,
        marketInserted: false,
        riskInserted: false,
      };
    }

    if (bundle.riskReport !== null) {
      assertPersistableRiskReport(bundle.riskReport);
    }

    const token = this.upsertToken(vector.tokenMint, bundle.marketSnapshot.collectedAt, vector.asOf);
    const marketInserted = this.persistMarketSnapshotIfAbsent(token.id, bundle.marketSnapshot);
    const riskInserted =
      bundle.riskReport === null ? false : this.persistRiskReportIfAbsent(bundle.riskReport);

    const inserted = this.requireStatements().insertFeatureVector.run(
      token.id,
      vector.featureSetVersion,
      vector.generatedAt,
      vector.asOf,
      vector.marketCollectedAt,
      vector.marketPairAddress,
      vector.previousMarketCollectedAt,
      vector.riskScannedAt,
      vector.featureCompleteness,
      vector.availableFeatureCount,
      vector.unavailableFeatureCount,
      sourceIdentity,
    );
    const vectorId = Number(inserted.lastInsertRowid);

    for (const [ordinal, value] of vector.values.entries()) {
      this.insertFeatureValue(vectorId, ordinal, value);
      if (options.abortAfterFirstValue === true) {
        throw new PersistenceError('Test-forced write failure after child insert.');
      }
    }

    return {
      vectorId,
      tokenMint: vector.tokenMint,
      sourceIdentity,
      inserted: true,
      tokenInserted: token.inserted,
      marketInserted,
      riskInserted,
    };
  }

  private persistStrategyBundle(
    bundle: StrategyBundle,
    options: { abortAfterFirstRule?: boolean } = {},
  ): RecordedStrategyBundle {
    assertPersistableStrategyEvaluation(bundle.strategyEvaluation, bundle.featureVector);
    this.assertBundleConsistency(bundle);
    this.assertStrategyBundleConsistency(bundle);

    const evaluation = bundle.strategyEvaluation;
    const expectedFeatureIdentity = featureSourceIdentity(bundle.featureVector);
    const sourceIdentity = strategySourceIdentity({
      strategyVersion: STRATEGY_VERSION,
      strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
      featureSourceIdentity: expectedFeatureIdentity,
    });

    const featureRecorded = this.persistFeatureBundle({
      marketSnapshot: bundle.marketSnapshot,
      riskReport: bundle.riskReport,
      featureVector: bundle.featureVector,
    });
    this.assertExactFeatureVectorLinkage(
      featureRecorded.vectorId,
      evaluation,
      bundle.featureVector,
      expectedFeatureIdentity,
    );

    const definitionInserted = this.ensureStrategyDefinition(evaluation);
    const existing = this.requireStatements().getStrategyByIdentity.get(sourceIdentity);
    if (existing !== undefined) {
      const existingEvaluation = this.mapStrategyEvaluationSummary(existing);
      if (!strategyEvaluationsSemanticallyEqual(existingEvaluation, evaluation)) {
        throw new PersistenceError(
          'Source identity already exists with a different strategy evaluation. This indicates non-determinism or semantic drift.',
        );
      }
      if (asNumber(existing['feature_vector_id']) !== featureRecorded.vectorId) {
        throw new PersistenceError(
          'Existing strategy evaluation does not reference the exact feature vector used for this evaluation.',
        );
      }

      return {
        evaluationId: existingEvaluation.id,
        vectorId: featureRecorded.vectorId,
        tokenMint: evaluation.tokenMint,
        sourceIdentity,
        inserted: false,
        featureInserted: featureRecorded.inserted,
        tokenInserted: featureRecorded.tokenInserted,
        marketInserted: featureRecorded.marketInserted,
        riskInserted: featureRecorded.riskInserted,
        definitionInserted,
      };
    }

    const token = this.getToken(evaluation.tokenMint);
    if (token === null) {
      throw new PersistenceError('Strategy evaluation token is missing after feature persistence.');
    }

    const inserted = this.requireStatements().insertStrategyEvaluation.run(
      token.id,
      featureRecorded.vectorId,
      evaluation.strategyVersion,
      evaluation.strategyDefinitionFingerprint,
      evaluation.featureSetVersion,
      evaluation.evaluatedAt,
      evaluation.asOf,
      evaluation.decision,
      evaluation.passedRuleCount,
      evaluation.failedRuleCount,
      evaluation.unavailableRuleCount,
      sourceIdentity,
    );
    const evaluationId = Number(inserted.lastInsertRowid);

    for (const rule of evaluation.rules) {
      this.requireStatements().insertStrategyRuleResult.run(
        evaluationId,
        rule.ordinal,
        rule.ruleCode,
        rule.category,
        rule.status,
        rule.description,
        rule.criterion,
        rule.observed,
        rule.reason,
      );
      if (options.abortAfterFirstRule === true) {
        throw new PersistenceError('Test-forced write failure after child insert.');
      }
    }

    return {
      evaluationId,
      vectorId: featureRecorded.vectorId,
      tokenMint: evaluation.tokenMint,
      sourceIdentity,
      inserted: true,
      featureInserted: featureRecorded.inserted,
      tokenInserted: featureRecorded.tokenInserted,
      marketInserted: featureRecorded.marketInserted,
      riskInserted: featureRecorded.riskInserted,
      definitionInserted,
    };
  }

  private ensureStrategyDefinition(evaluation: StrategyEvaluation): boolean {
    const existing = this.requireStatements().getStrategyDefinition.get(evaluation.strategyVersion);
    if (existing === undefined) {
      this.requireStatements().insertStrategyDefinition.run(
        evaluation.strategyVersion,
        evaluation.strategyName,
        evaluation.featureSetVersion,
        evaluation.strategyDefinitionFingerprint,
        evaluation.evaluatedAt,
      );
      return true;
    }

    if (
      asString(existing['strategy_name']) !== evaluation.strategyName ||
      asString(existing['feature_set_version']) !== evaluation.featureSetVersion ||
      asString(existing['definition_fingerprint']) !== evaluation.strategyDefinitionFingerprint
    ) {
      throw new PersistenceError(
        'Stored strategy definition for s07_v1 does not match the current code fingerprint. Create a new strategy version instead of mutating s07_v1.',
      );
    }

    return false;
  }

  private assertStrategyBundleConsistency(bundle: StrategyBundle): void {
    const evaluation = bundle.strategyEvaluation;
    const vector = bundle.featureVector;
    if (evaluation.tokenMint !== vector.tokenMint) {
      throw new PersistenceError('Strategy evaluation token mint does not match the feature vector.');
    }
    if (evaluation.asOf !== vector.asOf) {
      throw new PersistenceError('Strategy evaluation asOf must equal the feature vector asOf.');
    }
    if (evaluation.strategyVersion !== STRATEGY_VERSION) {
      throw new PersistenceError(`Unknown strategy version: ${evaluation.strategyVersion}.`);
    }
    if (evaluation.strategyName !== STRATEGY_NAME) {
      throw new PersistenceError('Strategy name does not match conservative_flow_momentum_baseline.');
    }
    if (evaluation.strategyDefinitionFingerprint !== STRATEGY_DEFINITION_FINGERPRINT) {
      throw new PersistenceError('Strategy definition fingerprint does not match the current s07_v1 definition.');
    }
    if (evaluation.featureSetVersion !== FEATURE_SET_VERSION) {
      throw new PersistenceError(`Unknown feature-set version: ${evaluation.featureSetVersion}.`);
    }
  }

  private persistMarketSnapshotIfAbsent(tokenId: number, snapshot: MarketSnapshot): boolean {
    const existingRow = this.requireStatements().snapshotByIdentity.get(
      tokenId,
      snapshot.pairAddress,
      snapshot.collectedAt,
    );
    if (existingRow !== undefined) {
      const existing = mapSnapshotRow(existingRow, snapshot.tokenMint);
      if (!marketSnapshotsEquivalent(existing, snapshot)) {
        throw new PersistenceError(
          'An existing market snapshot with the same token, pair, and collectedAt has different values.',
        );
      }
      return false;
    }

    return this.insertSnapshot(tokenId, null, snapshot) === 1;
  }

  private assertExactFeatureVectorLinkage(
    vectorId: number,
    evaluation: StrategyEvaluation,
    vector: FeatureVector,
    expectedFeatureIdentity: string,
  ): void {
    const featureRow = this.requireStatements().getFeatureById.get(vectorId);
    if (featureRow === undefined) {
      throw new PersistenceError('Strategy evaluation does not reference an exact stored feature vector.');
    }

    const token = this.getToken(evaluation.tokenMint);
    if (token === null) {
      throw new PersistenceError('Strategy evaluation token is missing after feature persistence.');
    }

    if (asNumber(featureRow['id']) !== vectorId) {
      throw new PersistenceError('Strategy evaluation feature_vector_id does not match the exact stored feature vector.');
    }
    if (asNumber(featureRow['token_id']) !== token.id) {
      throw new PersistenceError('Stored feature vector token_id does not match the strategy evaluation token.');
    }
    if (
      asString(featureRow['feature_set_version']) !== evaluation.featureSetVersion ||
      asString(featureRow['feature_set_version']) !== vector.featureSetVersion
    ) {
      throw new PersistenceError('Stored feature vector feature_set_version does not match the strategy evaluation.');
    }
    if (asString(featureRow['as_of']) !== evaluation.asOf || asString(featureRow['as_of']) !== vector.asOf) {
      throw new PersistenceError('Stored feature vector asOf does not match the strategy evaluation.');
    }
    if (asString(featureRow['source_identity']) !== expectedFeatureIdentity) {
      throw new PersistenceError(
        'Stored feature vector source identity does not match the recomputed Checkpoint 06 identity.',
      );
    }
  }

  private persistRiskReportIfAbsent(report: TokenRiskReport): boolean {
    const token = this.getToken(report.tokenMint);
    if (token !== null) {
      const existing = this.requireStatements().getRiskByScannedAt.get(token.id, report.scannedAt);
      if (existing !== undefined) {
        const scanId = asNumber(existing['id']);
        const stored = persistedRiskFactsFromStored({
          row: existing,
          checks: this.readRiskChecks(scanId),
          extensions: this.readRiskExtensionFacts(scanId),
          accounts: this.readRiskAccounts(scanId),
          findings: this.readRiskFindings(scanId),
        });
        if (JSON.stringify(stored) !== JSON.stringify(persistedRiskFactsFromReport(report))) {
          throw new PersistenceError(
            'An existing risk scan with the same token and scannedAt has different persisted values.',
          );
        }
        return false;
      }
    }

    this.persistRiskReport(report);
    return true;
  }

  private insertFeatureValue(vectorId: number, ordinal: number, value: FeatureValue): void {
    if (value.status === 'unavailable') {
      this.requireStatements().insertFeatureValue.run(
        vectorId,
        ordinal,
        value.name,
        value.kind,
        value.status,
        null,
        null,
        null,
        value.unavailableReason,
      );
      return;
    }

    if (value.kind === 'number') {
      if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
        throw new PersistenceError(`Feature ${value.name} is not a finite number.`);
      }
      this.requireStatements().insertFeatureValue.run(
        vectorId,
        ordinal,
        value.name,
        value.kind,
        value.status,
        value.value,
        null,
        null,
        null,
      );
      return;
    }

    if (value.kind === 'integer') {
      if (typeof value.value !== 'number' || !Number.isSafeInteger(value.value)) {
        throw new PersistenceError(`Feature ${value.name} is not a safe integer.`);
      }
      this.requireStatements().insertFeatureValue.run(
        vectorId,
        ordinal,
        value.name,
        value.kind,
        value.status,
        null,
        value.value,
        null,
        null,
      );
      return;
    }

    if (typeof value.value !== 'boolean') {
      throw new PersistenceError(`Feature ${value.name} is not a boolean.`);
    }

    this.requireStatements().insertFeatureValue.run(
      vectorId,
      ordinal,
      value.name,
      value.kind,
      value.status,
      null,
      null,
      value.value ? 1 : 0,
      null,
    );
  }

  private assertBundleConsistency(bundle: FeatureBundle): void {
    const vector = bundle.featureVector;
    if (vector.featureSetVersion !== FEATURE_SET_VERSION) {
      throw new PersistenceError(`Unknown feature-set version: ${vector.featureSetVersion}.`);
    }
    if (bundle.marketSnapshot.tokenMint !== vector.tokenMint) {
      throw new PersistenceError('Feature vector token mint does not match the market snapshot.');
    }
    if (bundle.marketSnapshot.collectedAt !== vector.marketCollectedAt) {
      throw new PersistenceError('Feature vector marketCollectedAt does not match the market snapshot.');
    }
    if (bundle.marketSnapshot.pairAddress !== vector.marketPairAddress) {
      throw new PersistenceError('Feature vector market pair does not match the market snapshot.');
    }
    if (bundle.riskReport === null && vector.riskScannedAt !== null) {
      throw new PersistenceError('Feature vector has riskScannedAt but no risk report was supplied.');
    }
    if (bundle.riskReport !== null && bundle.riskReport.scannedAt !== vector.riskScannedAt) {
      throw new PersistenceError('Feature vector riskScannedAt does not match the risk report.');
    }
    if (bundle.riskReport !== null && bundle.riskReport.tokenMint !== vector.tokenMint) {
      throw new PersistenceError('Risk report token mint does not match the feature vector.');
    }
  }

  private persistDiscoveryRun(result: DiscoveryRunResult): RecordedRun {
    const recordedAt = new Date().toISOString();
    const statements = this.requireStatements();
    const run = statements.insertRun.run(result.observedAt, recordedAt, result.candidates.length);
    const runId = Number(run.lastInsertRowid);

    for (const source of result.sourceResults) {
      statements.insertSourceResult.run(
        runId,
        source.source,
        source.ok ? 1 : 0,
        source.recordCount,
        source.error,
      );
    }

    let tokensInserted = 0;
    let tokensUpdated = 0;
    let observationsWritten = 0;
    let snapshotsWritten = 0;

    for (const candidate of result.candidates) {
      assertPersistableCandidate(candidate);
      const token = this.upsertToken(candidate.tokenMint, candidate.observedAt, recordedAt);
      if (token.inserted) {
        tokensInserted += 1;
      } else {
        tokensUpdated += 1;
      }

      const observationId = this.insertObservation(runId, token.id, candidate);
      observationsWritten += 1;
      snapshotsWritten += this.insertAttachedSnapshot(token.id, observationId, candidate);
    }

    return {
      runId,
      observedAt: result.observedAt,
      recordedAt,
      candidateCount: result.candidates.length,
      tokensInserted,
      tokensUpdated,
      observationsWritten,
      snapshotsWritten,
    };
  }

  private upsertToken(
    mint: string,
    observedAt: string,
    createdAt: string,
  ): { id: number; inserted: boolean } {
    const statements = this.requireStatements();
    const existing = statements.getToken.get(mint);
    if (existing === undefined) {
      const inserted = statements.insertToken.run('solana', mint, observedAt, observedAt, createdAt);
      return { id: Number(inserted.lastInsertRowid), inserted: true };
    }

    const firstObservedAt = minIso(asString(existing['first_observed_at']), observedAt);
    const lastObservedAt = maxIso(asString(existing['last_observed_at']), observedAt);
    statements.updateTokenTimes.run(firstObservedAt, lastObservedAt, asNumber(existing['id']));
    return { id: asNumber(existing['id']), inserted: false };
  }

  private insertObservation(
    runId: number,
    tokenId: number,
    candidate: DiscoveryCandidate,
  ): number {
    const statements = this.requireStatements();
    const inserted = statements.insertObservation.run(
      runId,
      tokenId,
      candidate.observedAt,
      candidate.dexScreenerUrl,
      candidate.description,
      candidate.profileUpdatedAt,
      candidate.boostAmount,
      candidate.boostTotalAmount,
      candidate.marketDataStatus,
    );
    const observationId = Number(inserted.lastInsertRowid);

    for (const source of uniqueSources(candidate.sources)) {
      statements.insertObservationSource.run(observationId, source);
    }

    for (const [ordinal, link] of candidate.links.entries()) {
      statements.insertLink.run(observationId, ordinal, link.type, link.label, link.url);
    }

    return observationId;
  }

  private insertAttachedSnapshot(
    tokenId: number,
    observationId: number,
    candidate: DiscoveryCandidate,
  ): number {
    if (candidate.marketDataStatus !== 'available' || candidate.marketSnapshot === null) {
      return 0;
    }

    return this.insertSnapshot(tokenId, observationId, candidate.marketSnapshot);
  }

  private insertSnapshot(
    tokenId: number,
    observationId: number | null,
    snapshot: MarketSnapshot,
  ): number {
    assertPersistableSnapshot(snapshot);
    const result = this.requireStatements().insertSnapshot.run(
      tokenId,
      observationId,
      snapshot.chain,
      snapshot.tokenName,
      snapshot.tokenSymbol,
      snapshot.dexId,
      snapshot.pairAddress,
      snapshot.quoteTokenMint,
      snapshot.quoteTokenSymbol,
      snapshot.priceUsd,
      snapshot.liquidityUsd,
      snapshot.volume5mUsd,
      snapshot.volume1hUsd,
      snapshot.volume24hUsd,
      snapshot.buys5m,
      snapshot.sells5m,
      snapshot.buys1h,
      snapshot.sells1h,
      snapshot.priceChange5mPct,
      snapshot.priceChange1hPct,
      snapshot.priceChange24hPct,
      snapshot.marketCapUsd,
      snapshot.fdvUsd,
      snapshot.pairCreatedAt,
      snapshot.collectedAt,
    );

    return Number(result.changes) > 0 ? 1 : 0;
  }

  private readRiskChecks(scanId: number): RiskCheckResult[] {
    return this.requireStatements()
      .riskChecks.all(scanId)
      .map((row) => ({
        check: asString(row['check_name']) as RiskCheckName,
        ok: asNumber(row['ok']) === 1,
        contextSlot: asNullableNumber(row['context_slot']),
        error: asNullableString(row['error']),
      }));
  }

  private readRiskExtensionFacts(scanId: number): PersistedRiskExtensionFact[] {
    return this.requireStatements()
      .riskExtensions.all(scanId)
      .map((row) => ({
        ordinal: asNumber(row['ordinal']),
        name: asString(row['extension_name']),
        authority: asNullableString(row['authority']),
        programId: asNullableString(row['program_id']),
        state: asNullableString(row['state']),
        transferFeeBasisPoints: asNullableNumber(row['transfer_fee_basis_points']),
        maximumFeeRaw: asNullableString(row['maximum_fee_raw']),
        parsed: asNumber(row['parsed']) === 1,
      }));
  }

  private readRiskAccounts(scanId: number): PersistedRiskAccountFact[] {
    return this.requireStatements()
      .riskAccounts.all(scanId)
      .map((row) => ({
        rank: asNumber(row['rank']),
        tokenAccount: asString(row['token_account']),
        amountRaw: asString(row['amount_raw']),
        shareBps: asNullableNumber(row['share_bps']),
      }));
  }

  private readRiskExtensions(scanId: number): TokenExtensionObservation[] {
    return this.requireStatements()
      .riskExtensions.all(scanId)
      .map((row) => ({
        name: asString(row['extension_name']),
        rawName: asString(row['extension_name']),
        authority: asNullableString(row['authority']),
        programId: asNullableString(row['program_id']),
        state: asNullableString(row['state']),
        transferFeeBasisPoints: asNullableNumber(row['transfer_fee_basis_points']),
        maximumFeeRaw: asNullableString(row['maximum_fee_raw']),
        olderTransferFeeBasisPoints: null,
        newerTransferFeeBasisPoints: null,
        olderMaximumFeeRaw: null,
        newerMaximumFeeRaw: null,
        parsed: asNumber(row['parsed']) === 1,
        classified: true,
      }));
  }

  private readRiskFindings(scanId: number): RiskFinding[] {
    return this.requireStatements()
      .riskFindings.all(scanId)
      .map((row) => ({
        code: asString(row['code']),
        category: asString(row['category']) as RiskFindingCategory,
        severity: asString(row['severity']) as RiskFindingSeverity,
        confidence: asString(row['confidence']) as RiskConfidence,
        title: asString(row['title']),
        description: asString(row['description']),
      }));
  }

  private mapRiskScanSummary(row: Record<string, SQLOutputValue>): StoredRiskScanSummary {
    const scanId = asNumber(row['id']);
    const findings = this.readRiskFindings(scanId);
    return {
      id: scanId,
      scannedAt: asString(row['scanned_at']),
      tokenProgram: asString(row['token_program']) as TokenProgramKind,
      mintAuthority: asNullableString(row['mint_authority']),
      freezeAuthority: asNullableString(row['freeze_authority']),
      supplyRaw: asNullableString(row['supply_raw']),
      top1Bps: asNullableNumber(row['top1_bps']),
      top5Bps: asNullableNumber(row['top5_bps']),
      highestFindingSeverity: asString(row['highest_finding_severity']) as HighestFindingSeverity,
      findingCodes: findings.map((finding) => finding.code),
      checks: this.readRiskChecks(scanId),
      extensions: this.readRiskExtensions(scanId),
      findings,
    };
  }

  private mapFeatureVectorSummary(
    row: Record<string, SQLOutputValue>,
  ): StoredFeatureVectorSummary {
    const vectorId = asNumber(row['id']);
    return {
      id: vectorId,
      featureSetVersion: asString(row['feature_set_version']),
      generatedAt: asString(row['generated_at']),
      asOf: asString(row['as_of']),
      marketCollectedAt: asString(row['market_collected_at']),
      marketPairAddress: asString(row['market_pair_address']),
      previousMarketCollectedAt: asNullableString(row['previous_market_collected_at']),
      riskScannedAt: asNullableString(row['risk_scanned_at']),
      featureCompleteness: asString(row['feature_completeness']) as StoredFeatureVectorSummary['featureCompleteness'],
      availableFeatureCount: asNumber(row['available_feature_count']),
      unavailableFeatureCount: asNumber(row['unavailable_feature_count']),
      sourceIdentity: asString(row['source_identity']),
      values: this.readFeatureValues(vectorId),
    };
  }

  private mapStrategyEvaluationSummary(
    row: Record<string, SQLOutputValue>,
  ): StoredStrategyEvaluationSummary {
    const evaluationId = asNumber(row['id']);
    return {
      id: evaluationId,
      tokenMint: asString(row['token_mint']),
      strategyVersion: asString(row['strategy_version']),
      strategyName: asString(row['strategy_name']),
      strategyDefinitionFingerprint: asString(row['strategy_definition_fingerprint']),
      featureSetVersion: asString(row['feature_set_version']),
      evaluatedAt: asString(row['evaluated_at']),
      asOf: asString(row['as_of']),
      decision: asString(row['decision']) as StrategyDecision,
      passedRuleCount: asNumber(row['passed_rule_count']),
      failedRuleCount: asNumber(row['failed_rule_count']),
      unavailableRuleCount: asNumber(row['unavailable_rule_count']),
      sourceIdentity: asString(row['source_identity']),
      featureSourceIdentity: asString(row['feature_source_identity']),
      rules: this.readStrategyRuleResults(evaluationId),
    };
  }

  private readStrategyRuleResults(evaluationId: number): StrategyRuleResult[] {
    return this.requireStatements()
      .strategyRuleResults.all(evaluationId)
      .map((row) => ({
        ordinal: asNumber(row['ordinal']),
        ruleCode: asString(row['rule_code']) as StrategyRuleResult['ruleCode'],
        category: asString(row['category']) as StrategyRuleResult['category'],
        status: asString(row['status']) as StrategyRuleResult['status'],
        description: asString(row['description']),
        criterion: asString(row['criterion']),
        observed: asString(row['observed']),
        reason: asString(row['reason']),
      }));
  }

  private readFeatureValues(vectorId: number): FeatureValue[] {
    return this.requireStatements()
      .featureValues.all(vectorId)
      .map((row) => {
        const kind = asString(row['kind']) as FeatureValueKind;
        const status = asString(row['status']) as FeatureValueStatus;
        return {
          name: asString(row['feature_name']) as FeatureValue['name'],
          kind,
          status,
          value: readStoredFeatureValue(kind, status, row),
          unavailableReason: asNullableString(row['unavailable_reason']),
        };
      });
  }

  private readObservationSources(observationId: number): DiscoverySource[] {
    return this.requireStatements()
      .observationSources.all(observationId)
      .map((row) => asString(row['source']) as DiscoverySource);
  }

  private transact<T>(fn: () => T): T {
    this.requireStatements();
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const value = fn();
      this.database.exec('COMMIT');
      return value;
    } catch (error: unknown) {
      try {
        this.database.exec('ROLLBACK');
      } catch {
        // The failed transaction is already closed.
      }
      if (error instanceof PersistenceError) {
        throw error;
      }
      throw new PersistenceError('Database transaction failed.', { cause: error });
    }
  }

  private requireStatements(): Statements {
    if (this.statements === null) {
      throw new PersistenceError('Database is not initialized.');
    }
    return this.statements;
  }
}

export function createSqlitePersistenceRepository(
  config: Pick<DatabaseConfig, 'path' | 'busyTimeoutMs'>,
): SqlitePersistenceRepository {
  return new SqlitePersistenceRepository(config);
}

function prepareStatements(database: DatabaseSync): Statements {
  return {
    getToken: database.prepare(
      'SELECT id, chain, mint, first_observed_at, last_observed_at, created_at FROM tokens WHERE mint = ?',
    ),
    insertToken: database.prepare(
      'INSERT INTO tokens (chain, mint, first_observed_at, last_observed_at, created_at) VALUES (?, ?, ?, ?, ?)',
    ),
    updateTokenTimes: database.prepare(
      'UPDATE tokens SET first_observed_at = ?, last_observed_at = ? WHERE id = ?',
    ),
    insertRun: database.prepare(
      'INSERT INTO discovery_runs (observed_at, recorded_at, candidate_count) VALUES (?, ?, ?)',
    ),
    insertSourceResult: database.prepare(
      'INSERT INTO discovery_source_results (run_id, source, ok, record_count, error) VALUES (?, ?, ?, ?, ?)',
    ),
    insertObservation: database.prepare(
      `INSERT INTO discovery_observations (
        run_id, token_id, observed_at, dex_screener_url, description, profile_updated_at,
        boost_amount, boost_total_amount, market_data_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertObservationSource: database.prepare(
      'INSERT INTO discovery_observation_sources (observation_id, source) VALUES (?, ?)',
    ),
    insertLink: database.prepare(
      'INSERT INTO discovery_links (observation_id, ordinal, type, label, url) VALUES (?, ?, ?, ?, ?)',
    ),
    insertSnapshot: database.prepare(
      `INSERT INTO market_snapshots (
        token_id, discovery_observation_id, chain, token_name, token_symbol, dex_id, pair_address,
        quote_token_mint, quote_token_symbol, price_usd, liquidity_usd, volume_5m_usd, volume_1h_usd,
        volume_24h_usd, buys_5m, sells_5m, buys_1h, sells_1h, price_change_5m_pct, price_change_1h_pct,
        price_change_24h_pct, market_cap_usd, fdv_usd, pair_created_at, collected_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(token_id, pair_address, collected_at) DO NOTHING`,
    ),
    countTokens: database.prepare('SELECT COUNT(*) AS count FROM tokens'),
    countRuns: database.prepare('SELECT COUNT(*) AS count FROM discovery_runs'),
    countObservations: database.prepare('SELECT COUNT(*) AS count FROM discovery_observations'),
    countSnapshots: database.prepare('SELECT COUNT(*) AS count FROM market_snapshots'),
    snapshotOwnership: database.prepare(
      `SELECT collected_at, discovery_observation_id
       FROM market_snapshots
       WHERE token_id = ?
       ORDER BY collected_at ASC, id ASC`,
    ),
    countSourceResults: database.prepare('SELECT COUNT(*) AS count FROM discovery_source_results'),
    countObservationSources: database.prepare(
      'SELECT COUNT(*) AS count FROM discovery_observation_sources',
    ),
    countLinks: database.prepare('SELECT COUNT(*) AS count FROM discovery_links'),
    countMigrations: database.prepare('SELECT COUNT(*) AS count FROM schema_migrations'),
    insertRiskScan: database.prepare(
      `INSERT INTO risk_scans (
        token_id, scanned_at, commitment, token_program, program_owner, mint_context_slot,
        supply_context_slot, largest_accounts_context_slot, decimals, supply_raw, mint_authority,
        freeze_authority, top1_bps, top5_bps, top10_bps, top20_bps, largest_accounts_count,
        data_completeness, highest_finding_severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertRiskCheck: database.prepare(
      'INSERT INTO risk_scan_checks (scan_id, check_name, ok, context_slot, error) VALUES (?, ?, ?, ?, ?)',
    ),
    insertRiskExtension: database.prepare(
      `INSERT INTO risk_scan_extensions (
        scan_id, ordinal, extension_name, authority, program_id, state,
        transfer_fee_basis_points, maximum_fee_raw, parsed
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertRiskAccount: database.prepare(
      `INSERT INTO risk_top_token_accounts (scan_id, rank, token_account, amount_raw, share_bps)
       VALUES (?, ?, ?, ?, ?)`,
    ),
    insertRiskFinding: database.prepare(
      `INSERT INTO risk_findings (scan_id, code, category, severity, confidence, title, description)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    countRiskScans: database.prepare('SELECT COUNT(*) AS count FROM risk_scans'),
    countRiskChecks: database.prepare('SELECT COUNT(*) AS count FROM risk_scan_checks'),
    countRiskExtensions: database.prepare('SELECT COUNT(*) AS count FROM risk_scan_extensions'),
    countRiskAccounts: database.prepare('SELECT COUNT(*) AS count FROM risk_top_token_accounts'),
    countRiskFindings: database.prepare('SELECT COUNT(*) AS count FROM risk_findings'),
    riskHistory: database.prepare(
      `SELECT id, scanned_at, token_program, mint_authority, freeze_authority, supply_raw,
              top1_bps, top5_bps, highest_finding_severity
       FROM risk_scans
       WHERE token_id = ?
       ORDER BY scanned_at DESC, id DESC
       LIMIT ?`,
    ),
    riskChecks: database.prepare(
      `SELECT check_name, ok, context_slot, error
       FROM risk_scan_checks
       WHERE scan_id = ?
       ORDER BY CASE check_name
         WHEN 'mint_account' THEN 0
         WHEN 'supply' THEN 1
         ELSE 2
       END`,
    ),
    riskExtensions: database.prepare(
      `SELECT ordinal, extension_name, authority, program_id, state, transfer_fee_basis_points,
              maximum_fee_raw, parsed
       FROM risk_scan_extensions
       WHERE scan_id = ?
       ORDER BY ordinal ASC`,
    ),
    riskAccounts: database.prepare(
      `SELECT rank, token_account, amount_raw, share_bps
       FROM risk_top_token_accounts
       WHERE scan_id = ?
       ORDER BY rank ASC`,
    ),
    riskFindings: database.prepare(
      `SELECT code, category, severity, confidence, title, description
       FROM risk_findings
       WHERE scan_id = ?
       ORDER BY code ASC`,
    ),
    observationBounds: database.prepare(
      'SELECT MIN(first_observed_at) AS earliest, MAX(last_observed_at) AS latest FROM tokens',
    ),
    recentObservations: database.prepare(
      `SELECT o.id, o.run_id, t.mint, o.observed_at, o.dex_screener_url, o.description,
              o.profile_updated_at, o.boost_amount, o.boost_total_amount, o.market_data_status
       FROM discovery_observations o
       JOIN tokens t ON t.id = o.token_id
       ORDER BY o.observed_at DESC, o.id DESC
       LIMIT ?`,
    ),
    observationSources: database.prepare(
      `SELECT source FROM discovery_observation_sources
       WHERE observation_id = ?
       ORDER BY CASE source WHEN 'dexscreener_profile' THEN 0 ELSE 1 END`,
    ),
    sourceResultsForRun: database.prepare(
      `SELECT source, ok, record_count, error
       FROM discovery_source_results
       WHERE run_id = ?
       ORDER BY CASE source WHEN 'dexscreener_profile' THEN 0 ELSE 1 END`,
    ),
    marketHistory: database.prepare(
      `SELECT token_name, token_symbol, dex_id, pair_address, quote_token_mint, quote_token_symbol,
              price_usd, liquidity_usd, volume_5m_usd, volume_1h_usd, volume_24h_usd,
              buys_5m, sells_5m, buys_1h, sells_1h, price_change_5m_pct, price_change_1h_pct,
              price_change_24h_pct, market_cap_usd, fdv_usd, pair_created_at, collected_at
       FROM market_snapshots
       WHERE token_id = ?
       ORDER BY collected_at DESC, id DESC
       LIMIT ?`,
    ),
    previousSnapshot: database.prepare(
      `SELECT token_name, token_symbol, dex_id, pair_address, quote_token_mint, quote_token_symbol,
              price_usd, liquidity_usd, volume_5m_usd, volume_1h_usd, volume_24h_usd,
              buys_5m, sells_5m, buys_1h, sells_1h, price_change_5m_pct, price_change_1h_pct,
              price_change_24h_pct, market_cap_usd, fdv_usd, pair_created_at, collected_at
       FROM market_snapshots
       WHERE token_id = ? AND pair_address = ? AND collected_at < ?
       ORDER BY collected_at DESC, id DESC
       LIMIT 1`,
    ),
    snapshotByIdentity: database.prepare(
      `SELECT token_name, token_symbol, dex_id, pair_address, quote_token_mint, quote_token_symbol,
              price_usd, liquidity_usd, volume_5m_usd, volume_1h_usd, volume_24h_usd,
              buys_5m, sells_5m, buys_1h, sells_1h, price_change_5m_pct, price_change_1h_pct,
              price_change_24h_pct, market_cap_usd, fdv_usd, pair_created_at, collected_at
       FROM market_snapshots
       WHERE token_id = ? AND pair_address = ? AND collected_at = ?
       LIMIT 1`,
    ),
    riskAsOf: database.prepare(
      `SELECT id, scanned_at, token_program, mint_authority, freeze_authority, supply_raw,
              top1_bps, top5_bps, highest_finding_severity
       FROM risk_scans
       WHERE token_id = ? AND scanned_at <= ?
       ORDER BY scanned_at DESC, id DESC
       LIMIT 1`,
    ),
    getRiskByScannedAt: database.prepare(
      `SELECT id, scanned_at, commitment, token_program, program_owner, mint_context_slot,
              supply_context_slot, largest_accounts_context_slot, decimals, supply_raw,
              mint_authority, freeze_authority, top1_bps, top5_bps, top10_bps, top20_bps,
              largest_accounts_count, data_completeness, highest_finding_severity
       FROM risk_scans
       WHERE token_id = ? AND scanned_at = ?`,
    ),
    insertFeatureVector: database.prepare(
      `INSERT INTO feature_vectors (
        token_id, feature_set_version, generated_at, as_of, market_collected_at, market_pair_address,
        previous_market_collected_at, risk_scanned_at, feature_completeness, available_feature_count,
        unavailable_feature_count, source_identity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertFeatureValue: database.prepare(
      `INSERT INTO feature_values (
        vector_id, ordinal, feature_name, kind, status, number_value, integer_value, boolean_value,
        unavailable_reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    getFeatureByIdentity: database.prepare(
      'SELECT id FROM feature_vectors WHERE source_identity = ?',
    ),
    getFeatureById: database.prepare(
      `SELECT id, token_id, feature_set_version, as_of, source_identity
       FROM feature_vectors
       WHERE id = ?`,
    ),
    featureHistory: database.prepare(
      `SELECT id, feature_set_version, generated_at, as_of, market_collected_at, market_pair_address,
              previous_market_collected_at, risk_scanned_at, feature_completeness,
              available_feature_count, unavailable_feature_count, source_identity
       FROM feature_vectors
       WHERE token_id = ?
       ORDER BY as_of DESC, id DESC
       LIMIT ?`,
    ),
    featureValues: database.prepare(
      `SELECT feature_name, kind, status, number_value, integer_value, boolean_value, unavailable_reason
       FROM feature_values
       WHERE vector_id = ?
       ORDER BY ordinal ASC`,
    ),
    countFeatureVectors: database.prepare('SELECT COUNT(*) AS count FROM feature_vectors'),
    countFeatureValues: database.prepare('SELECT COUNT(*) AS count FROM feature_values'),
    getStrategyDefinition: database.prepare(
      `SELECT strategy_version, strategy_name, feature_set_version, definition_fingerprint, first_recorded_at
       FROM strategy_definitions
       WHERE strategy_version = ?`,
    ),
    insertStrategyDefinition: database.prepare(
      `INSERT INTO strategy_definitions (
        strategy_version, strategy_name, feature_set_version, definition_fingerprint, first_recorded_at
      ) VALUES (?, ?, ?, ?, ?)`,
    ),
    getStrategyByIdentity: database.prepare(
      `SELECT e.id, e.feature_vector_id, t.mint AS token_mint, e.strategy_version, d.strategy_name,
              e.strategy_definition_fingerprint, e.feature_set_version, e.evaluated_at, e.as_of,
              e.decision, e.passed_rule_count, e.failed_rule_count, e.unavailable_rule_count,
              e.source_identity, f.source_identity AS feature_source_identity
       FROM strategy_evaluations e
       JOIN strategy_definitions d ON d.strategy_version = e.strategy_version
       JOIN feature_vectors f ON f.id = e.feature_vector_id
       JOIN tokens t ON t.id = e.token_id
       WHERE e.source_identity = ?`,
    ),
    insertStrategyEvaluation: database.prepare(
      `INSERT INTO strategy_evaluations (
        token_id, feature_vector_id, strategy_version, strategy_definition_fingerprint, feature_set_version,
        evaluated_at, as_of, decision, passed_rule_count, failed_rule_count, unavailable_rule_count,
        source_identity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertStrategyRuleResult: database.prepare(
      `INSERT INTO strategy_rule_results (
        evaluation_id, ordinal, rule_code, category, status, description, criterion, observed, reason
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    strategyHistory: database.prepare(
      `SELECT e.id, e.feature_vector_id, t.mint AS token_mint, e.strategy_version, d.strategy_name,
              e.strategy_definition_fingerprint, e.feature_set_version, e.evaluated_at, e.as_of,
              e.decision, e.passed_rule_count, e.failed_rule_count, e.unavailable_rule_count,
              e.source_identity, f.source_identity AS feature_source_identity
       FROM strategy_evaluations e
       JOIN strategy_definitions d ON d.strategy_version = e.strategy_version
       JOIN feature_vectors f ON f.id = e.feature_vector_id
       JOIN tokens t ON t.id = e.token_id
       WHERE e.token_id = ?
       ORDER BY e.as_of DESC, e.id DESC
       LIMIT ?`,
    ),
    strategyRuleResults: database.prepare(
      `SELECT ordinal, rule_code, category, status, description, criterion, observed, reason
       FROM strategy_rule_results
       WHERE evaluation_id = ?
       ORDER BY ordinal ASC`,
    ),
    countStrategyEvaluations: database.prepare('SELECT COUNT(*) AS count FROM strategy_evaluations'),
    countStrategyDefinitions: database.prepare('SELECT COUNT(*) AS count FROM strategy_definitions'),
    countStrategyRuleResults: database.prepare('SELECT COUNT(*) AS count FROM strategy_rule_results'),
  };
}

function uniqueSources(sources: readonly DiscoverySource[]): DiscoverySource[] {
  const seen = new Set<DiscoverySource>();
  const unique: DiscoverySource[] = [];
  for (const source of sources) {
    if (seen.has(source)) {
      continue;
    }
    seen.add(source);
    unique.push(source);
  }
  return unique;
}

function minIso(left: string, right: string): string {
  return left < right ? left : right;
}

function maxIso(left: string, right: string): string {
  return left > right ? left : right;
}

function readStoredFeatureValue(
  kind: FeatureValueKind,
  status: FeatureValueStatus,
  row: Record<string, SQLOutputValue>,
): number | boolean | null {
  if (status === 'unavailable') {
    return null;
  }

  if (kind === 'boolean') {
    return asNumber(row['boolean_value']) === 1;
  }

  if (kind === 'integer') {
    return asNumber(row['integer_value']);
  }

  return asNumber(row['number_value']);
}

function marketSnapshotsEquivalent(left: MarketSnapshot, right: MarketSnapshot): boolean {
  return (
    left.tokenMint === right.tokenMint &&
    left.tokenName === right.tokenName &&
    left.tokenSymbol === right.tokenSymbol &&
    left.dexId === right.dexId &&
    left.pairAddress === right.pairAddress &&
    left.quoteTokenMint === right.quoteTokenMint &&
    left.quoteTokenSymbol === right.quoteTokenSymbol &&
    Object.is(left.priceUsd, right.priceUsd) &&
    Object.is(left.liquidityUsd, right.liquidityUsd) &&
    Object.is(left.volume5mUsd, right.volume5mUsd) &&
    Object.is(left.volume1hUsd, right.volume1hUsd) &&
    Object.is(left.volume24hUsd, right.volume24hUsd) &&
    Object.is(left.buys5m, right.buys5m) &&
    Object.is(left.sells5m, right.sells5m) &&
    Object.is(left.buys1h, right.buys1h) &&
    Object.is(left.sells1h, right.sells1h) &&
    Object.is(left.priceChange5mPct, right.priceChange5mPct) &&
    Object.is(left.priceChange1hPct, right.priceChange1hPct) &&
    Object.is(left.priceChange24hPct, right.priceChange24hPct) &&
    Object.is(left.marketCapUsd, right.marketCapUsd) &&
    Object.is(left.fdvUsd, right.fdvUsd) &&
    left.pairCreatedAt === right.pairCreatedAt &&
    left.collectedAt === right.collectedAt
  );
}

function persistedRiskFactsFromReport(report: TokenRiskReport): PersistedRiskFacts {
  return {
    scannedAt: report.scannedAt,
    commitment: report.commitment,
    tokenProgram: report.tokenProgram,
    programOwner: report.programOwner,
    mintContextSlot: report.mintContextSlot,
    supplyContextSlot: report.supplyContextSlot,
    largestAccountsContextSlot: report.largestAccountsContextSlot,
    decimals: report.decimals,
    supplyRaw: report.supplyRaw,
    mintAuthority: report.mintAuthority,
    freezeAuthority: report.freezeAuthority,
    top1Bps: report.concentration?.top1Bps ?? null,
    top5Bps: report.concentration?.top5Bps ?? null,
    top10Bps: report.concentration?.top10Bps ?? null,
    top20Bps: report.concentration?.top20Bps ?? null,
    largestAccountsCount: report.largestTokenAccounts.length,
    dataCompleteness: report.dataCompleteness,
    highestFindingSeverity: report.highestFindingSeverity,
    checks: canonicalizeRiskChecks(report.checks),
    extensions: canonicalizeRiskExtensions(
      report.extensions.map((extension, ordinal) => ({
        ordinal,
        name: extension.name,
        authority: extension.authority,
        programId: extension.programId,
        state: extension.state,
        transferFeeBasisPoints: extension.transferFeeBasisPoints,
        maximumFeeRaw: extension.maximumFeeRaw,
        parsed: extension.parsed,
      })),
    ),
    accounts: canonicalizeRiskAccounts(report.largestTokenAccounts),
    findings: canonicalizeRiskFindings(report.findings),
  };
}

function persistedRiskFactsFromStored(input: {
  row: Record<string, SQLOutputValue>;
  checks: readonly RiskCheckResult[];
  extensions: readonly PersistedRiskExtensionFact[];
  accounts: readonly PersistedRiskAccountFact[];
  findings: readonly RiskFinding[];
}): PersistedRiskFacts {
  return {
    scannedAt: asString(input.row['scanned_at']),
    commitment: asString(input.row['commitment']),
    tokenProgram: asString(input.row['token_program']),
    programOwner: asString(input.row['program_owner']),
    mintContextSlot: asNumber(input.row['mint_context_slot']),
    supplyContextSlot: asNullableNumber(input.row['supply_context_slot']),
    largestAccountsContextSlot: asNullableNumber(input.row['largest_accounts_context_slot']),
    decimals: asNumber(input.row['decimals']),
    supplyRaw: asNullableString(input.row['supply_raw']),
    mintAuthority: asNullableString(input.row['mint_authority']),
    freezeAuthority: asNullableString(input.row['freeze_authority']),
    top1Bps: asNullableNumber(input.row['top1_bps']),
    top5Bps: asNullableNumber(input.row['top5_bps']),
    top10Bps: asNullableNumber(input.row['top10_bps']),
    top20Bps: asNullableNumber(input.row['top20_bps']),
    largestAccountsCount: asNumber(input.row['largest_accounts_count']),
    dataCompleteness: asString(input.row['data_completeness']),
    highestFindingSeverity: asString(input.row['highest_finding_severity']),
    checks: canonicalizeRiskChecks(input.checks),
    extensions: canonicalizeRiskExtensions(input.extensions),
    accounts: canonicalizeRiskAccounts(input.accounts),
    findings: canonicalizeRiskFindings(input.findings),
  };
}

function canonicalizeRiskChecks(checks: readonly RiskCheckResult[]): PersistedRiskCheckFact[] {
  return [...checks]
    .map((check) => ({
      check: check.check,
      ok: check.ok,
      contextSlot: check.contextSlot,
      error: check.error,
    }))
    .sort((left, right) => compareAscii(left.check, right.check));
}

function canonicalizeRiskExtensions(
  extensions: readonly PersistedRiskExtensionFact[],
): PersistedRiskExtensionFact[] {
  return [...extensions]
    .map((extension) => ({
      ordinal: extension.ordinal,
      name: extension.name,
      authority: extension.authority,
      programId: extension.programId,
      state: extension.state,
      transferFeeBasisPoints: extension.transferFeeBasisPoints,
      maximumFeeRaw: extension.maximumFeeRaw,
      parsed: extension.parsed,
    }))
    .sort((left, right) => left.ordinal - right.ordinal);
}

function canonicalizeRiskAccounts(
  accounts: readonly PersistedRiskAccountFact[],
): PersistedRiskAccountFact[] {
  return [...accounts]
    .map((account) => ({
      rank: account.rank,
      tokenAccount: account.tokenAccount,
      amountRaw: account.amountRaw,
      shareBps: account.shareBps,
    }))
    .sort((left, right) => left.rank - right.rank);
}

function canonicalizeRiskFindings(findings: readonly RiskFinding[]): PersistedRiskFindingFact[] {
  return [...findings]
    .map((finding) => ({
      code: finding.code,
      category: finding.category,
      severity: finding.severity,
      confidence: finding.confidence,
      title: finding.title,
      description: finding.description,
    }))
    .sort((left, right) => {
      const code = compareAscii(left.code, right.code);
      if (code !== 0) {
        return code;
      }
      const title = compareAscii(left.title, right.title);
      if (title !== 0) {
        return title;
      }
      return compareAscii(left.description, right.description);
    });
}

type PersistedRiskFacts = {
  scannedAt: string;
  commitment: string;
  tokenProgram: string;
  programOwner: string;
  mintContextSlot: number;
  supplyContextSlot: number | null;
  largestAccountsContextSlot: number | null;
  decimals: number;
  supplyRaw: string | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  top1Bps: number | null;
  top5Bps: number | null;
  top10Bps: number | null;
  top20Bps: number | null;
  largestAccountsCount: number;
  dataCompleteness: string;
  highestFindingSeverity: string;
  checks: PersistedRiskCheckFact[];
  extensions: PersistedRiskExtensionFact[];
  accounts: PersistedRiskAccountFact[];
  findings: PersistedRiskFindingFact[];
};

type PersistedRiskCheckFact = {
  check: string;
  ok: boolean;
  contextSlot: number | null;
  error: string | null;
};

type PersistedRiskExtensionFact = {
  ordinal: number;
  name: string;
  authority: string | null;
  programId: string | null;
  state: string | null;
  transferFeeBasisPoints: number | null;
  maximumFeeRaw: string | null;
  parsed: boolean;
};

type PersistedRiskAccountFact = {
  rank: number;
  tokenAccount: string;
  amountRaw: string;
  shareBps: number | null;
};

type PersistedRiskFindingFact = {
  code: string;
  category: string;
  severity: string;
  confidence: string;
  title: string;
  description: string;
};

function compareAscii(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}
