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
import { PAPER_SPEC_VERSION } from '../../paper/constants.js';
import { PAPER_DEFINITION_FINGERPRINT, paperSourceIdentity } from '../../paper/identity.js';
import type { PaperEvaluation } from '../../paper/types.js';
import {
  POSITION_ENTRY_NOTIONAL_USD,
  POSITION_MAX_OPEN_PER_TOKEN,
  POSITION_QUANTITY_FORMULA,
  POSITION_SPEC_NAME,
  POSITION_SPEC_VERSION,
} from '../../position/constants.js';
import {
  POSITION_DEFINITION_FINGERPRINT,
  positionEntrySourceIdentity,
  positionEvaluationSourceIdentity,
} from '../../position/identity.js';
import {
  derivePaperQuantityTokens,
  openPaperPositionFromEvaluation,
  openPaperPositionsSemanticallyEqual,
  positionEvaluationsSemanticallyEqual,
} from '../../position/invariants.js';
import { evaluatePositionAction } from '../../position/evaluator.js';
import type { PositionEvaluation } from '../../position/types.js';
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
  PaperBundle,
  RecordedPaperBundle,
  PositionBundle,
  RecordedPositionBundle,
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
  TokenPaperHistory,
  StoredPaperEvaluationSummary,
  StoredOpenPaperPosition,
  StoredPositionEvaluationSummary,
  TokenPositionHistory,
} from '../types.js';
import { PersistenceError } from '../types.js';
import {
  assertPersistableCandidate,
  assertPersistableFeatureVector,
  assertPersistableRiskReport,
  assertPersistableSnapshot,
  assertPersistableStrategyEvaluation,
  assertPersistablePaperEvaluation,
  assertPersistablePositionEvaluation,
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
  getPaperDefinition: StatementSync;
  insertPaperDefinition: StatementSync;
  getPaperByIdentity: StatementSync;
  insertPaperEvaluation: StatementSync;
  paperHistory: StatementSync;
  getStrategyById: StatementSync;
  countPaperDefinitions: StatementSync;
  countPaperEvaluations: StatementSync;
  getPositionDefinition: StatementSync;
  insertPositionDefinition: StatementSync;
  getPositionByPaperEvaluationId: StatementSync;
  getPositionByIdentity: StatementSync;
  insertPositionEvaluation: StatementSync;
  positionHistory: StatementSync;
  insertPaperPosition: StatementSync;
  insertOpenPaperPosition: StatementSync;
  getOpenPositionIndex: StatementSync;
  getOpenPaperPosition: StatementSync;
  getPaperPositionById: StatementSync;
  getPaperById: StatementSync;
  countPositionDefinitions: StatementSync;
  countPositionEvaluations: StatementSync;
  countPaperPositions: StatementSync;
  countOpenPaperPositions: StatementSync;
};

type FeaturePersistAbort =
  | 'token'
  | 'market'
  | 'riskParent'
  | 'riskChildren'
  | 'featureVector'
  | 'featureValues';

type StrategyPersistAbort =
  | FeaturePersistAbort
  | 'strategyDefinition'
  | 'strategyEvaluation'
  | 'strategyRules';

type PaperPersistAbort = StrategyPersistAbort | 'paperDefinition' | 'paperEvaluation';

type PositionPersistAbort =
  | PaperPersistAbort
  | 'positionDefinition'
  | 'positionEvaluation'
  | 'paperPosition'
  | 'openPositionState';

const FEATURE_PERSIST_ABORTS = new Set<FeaturePersistAbort>([
  'token',
  'market',
  'riskParent',
  'riskChildren',
  'featureVector',
  'featureValues',
]);

const STRATEGY_PERSIST_ABORTS = new Set<StrategyPersistAbort>([
  'token',
  'market',
  'riskParent',
  'riskChildren',
  'featureVector',
  'featureValues',
  'strategyDefinition',
  'strategyEvaluation',
  'strategyRules',
]);

const PAPER_PERSIST_ABORTS = new Set<PaperPersistAbort>([
  'token',
  'market',
  'riskParent',
  'riskChildren',
  'featureVector',
  'featureValues',
  'strategyDefinition',
  'strategyEvaluation',
  'strategyRules',
  'paperDefinition',
  'paperEvaluation',
]);

function isFeaturePersistAbort(value: string): value is FeaturePersistAbort {
  return FEATURE_PERSIST_ABORTS.has(value as FeaturePersistAbort);
}

function isStrategyPersistAbort(value: string): value is StrategyPersistAbort {
  return STRATEGY_PERSIST_ABORTS.has(value as StrategyPersistAbort);
}

function isPaperPersistAbort(value: string): value is PaperPersistAbort {
  return PAPER_PERSIST_ABORTS.has(value as PaperPersistAbort);
}

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

  recordPaperBundle(bundle: PaperBundle): RecordedPaperBundle {
    return this.transact(() => this.persistPaperBundle(bundle));
  }

  recordPaperBundleAndAbortAfter(bundle: PaperBundle, abortAfter: PaperPersistAbort): void {
    this.transact(() => {
      this.persistPaperBundle(bundle, { abortAfter });
    });
  }

  recordPaperBundleAndViolatePaperConstraint(bundle: PaperBundle): void {
    this.transact(() => {
      const strategyRecorded = this.persistStrategyBundle(bundle);
      this.ensurePaperDefinition(bundle.paperEvaluation);
      const token = this.getToken(bundle.paperEvaluation.tokenMint);
      if (token === null) {
        throw new PersistenceError('Paper evaluation token is missing after strategy persistence.');
      }
      this.requireStatements().insertPaperEvaluation.run(
        token.id,
        strategyRecorded.evaluationId,
        bundle.paperEvaluation.paperSpecVersion,
        bundle.paperEvaluation.paperDefinitionFingerprint,
        bundle.paperEvaluation.strategyDefinitionFingerprint,
        bundle.paperEvaluation.featureSetVersion,
        bundle.paperEvaluation.asOf,
        bundle.paperEvaluation.evaluatedAt,
        bundle.paperEvaluation.marketCollectedAt,
        bundle.paperEvaluation.pairAddress,
        'entry_candidate',
        'no_action',
        'strategy_no_entry',
        null,
        null,
        bundle.paperEvaluation.executionModel,
        bundle.paperEvaluation.costModel,
        bundle.paperEvaluation.quantityModel,
        bundle.paperEvaluation.positionModel,
        bundle.paperEvaluation.exitModel,
        `${bundle.paperEvaluation.asOf}:constraint-failure`,
      );
    });
  }

  recordPositionBundle(bundle: PositionBundle): RecordedPositionBundle {
    return this.transact(() => this.persistPositionBundle(bundle));
  }

  recordPositionBundleAndAbortAfter(bundle: PositionBundle, abortAfter: PositionPersistAbort): void {
    this.transact(() => {
      this.persistPositionBundle(bundle, { abortAfter });
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

  getPaperHistory(tokenMint: string, limit: number): TokenPaperHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const rows = this.requireStatements().paperHistory.all(token.id, clampHistoryLimit(limit));
    return {
      token,
      evaluations: rows.map((row) => this.mapPaperEvaluationSummary(row)),
    };
  }

  getOpenPaperPosition(tokenMint: string): StoredOpenPaperPosition | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    return this.readOpenPaperPosition(token.id, token.mint);
  }

  getPositionHistory(tokenMint: string, limit: number): TokenPositionHistory | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }

    const rows = this.requireStatements().positionHistory.all(token.id, clampHistoryLimit(limit));
    return {
      token,
      evaluations: rows.map((row) => this.mapPositionEvaluationSummary(row)),
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
    paperDefinitions: number;
    paperEvaluations: number;
    positionDefinitions: number;
    positionEvaluations: number;
    paperPositions: number;
    openPaperPositions: number;
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
      paperDefinitions: asNumber(statements.countPaperDefinitions.get()?.['count']),
      paperEvaluations: asNumber(statements.countPaperEvaluations.get()?.['count']),
      positionDefinitions: asNumber(statements.countPositionDefinitions.get()?.['count']),
      positionEvaluations: asNumber(statements.countPositionEvaluations.get()?.['count']),
      paperPositions: asNumber(statements.countPaperPositions.get()?.['count']),
      openPaperPositions: asNumber(statements.countOpenPaperPositions.get()?.['count']),
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
      paperEvaluationCount: asNumber(statements.countPaperEvaluations.get()?.['count']),
      positionEvaluationCount: asNumber(statements.countPositionEvaluations.get()?.['count']),
      paperPositionCount: asNumber(statements.countPaperPositions.get()?.['count']),
      openPaperPositionCount: asNumber(statements.countOpenPaperPositions.get()?.['count']),
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

  private persistRiskReport(
    report: TokenRiskReport,
    options: { abortAfter?: 'riskParent' | 'riskChildren' } = {},
  ): RecordedRiskScan {
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
    if (options.abortAfter === 'riskParent') {
      throw new PersistenceError('Test-forced write failure after risk parent insert.');
    }

    const abortAfterRiskChild = (): void => {
      if (options.abortAfter === 'riskChildren') {
        throw new PersistenceError('Test-forced write failure after risk child insert.');
      }
    };

    for (const check of report.checks) {
      statements.insertRiskCheck.run(
        scanId,
        check.check,
        check.ok ? 1 : 0,
        check.contextSlot,
        check.error,
      );
      abortAfterRiskChild();
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
      abortAfterRiskChild();
    }

    for (const account of report.largestTokenAccounts) {
      statements.insertRiskAccount.run(
        scanId,
        account.rank,
        account.tokenAccount,
        account.amountRaw,
        account.shareBps,
      );
      abortAfterRiskChild();
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
      abortAfterRiskChild();
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
    options: {
      abortAfterFirstValue?: boolean;
      abortAfter?: FeaturePersistAbort;
    } = {},
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
    if (options.abortAfter === 'token') {
      throw new PersistenceError('Test-forced write failure after token update.');
    }
    const marketInserted = this.persistMarketSnapshotIfAbsent(token.id, bundle.marketSnapshot);
    if (options.abortAfter === 'market') {
      throw new PersistenceError('Test-forced write failure after market insert.');
    }
    const riskInserted =
      bundle.riskReport === null
        ? false
        : this.persistRiskReportIfAbsent(
            bundle.riskReport,
            options.abortAfter === 'riskParent' || options.abortAfter === 'riskChildren'
              ? { abortAfter: options.abortAfter }
              : {},
          );

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
    if (options.abortAfter === 'featureVector') {
      throw new PersistenceError('Test-forced write failure after feature vector insert.');
    }

    for (const [ordinal, value] of vector.values.entries()) {
      this.insertFeatureValue(vectorId, ordinal, value);
      if (options.abortAfterFirstValue === true || options.abortAfter === 'featureValues') {
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
    options: {
      abortAfterFirstRule?: boolean;
      abortAfterFirstValue?: boolean;
      abortAfter?: StrategyPersistAbort;
    } = {},
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

    const featureAbort =
      options.abortAfter !== undefined && isFeaturePersistAbort(options.abortAfter)
        ? options.abortAfter
        : undefined;
    const featureRecorded = this.persistFeatureBundle(
      {
        marketSnapshot: bundle.marketSnapshot,
        riskReport: bundle.riskReport,
        featureVector: bundle.featureVector,
      },
      {
        abortAfterFirstValue: options.abortAfterFirstValue === true,
        ...(featureAbort === undefined ? {} : { abortAfter: featureAbort }),
      },
    );
    this.assertExactFeatureVectorLinkage(
      featureRecorded.vectorId,
      evaluation,
      bundle.featureVector,
      expectedFeatureIdentity,
    );

    const definitionInserted = this.ensureStrategyDefinition(evaluation);
    if (options.abortAfter === 'strategyDefinition') {
      throw new PersistenceError('Test-forced write failure after strategy definition insert.');
    }
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
    if (options.abortAfter === 'strategyEvaluation') {
      throw new PersistenceError('Test-forced write failure after strategy evaluation insert.');
    }

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
      if (options.abortAfterFirstRule === true || options.abortAfter === 'strategyRules') {
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

  private persistPaperBundle(
    bundle: PaperBundle,
    options: { abortAfter?: PaperPersistAbort } = {},
  ): RecordedPaperBundle {
    assertPersistablePaperEvaluation(bundle.paperEvaluation, {
      marketSnapshot: bundle.marketSnapshot,
      featureVector: bundle.featureVector,
      strategyEvaluation: bundle.strategyEvaluation,
    });

    const strategyAbort =
      options.abortAfter !== undefined && isStrategyPersistAbort(options.abortAfter)
        ? options.abortAfter
        : undefined;
    const strategyRecorded =
      strategyAbort === undefined
        ? this.persistStrategyBundle(bundle)
        : this.persistStrategyBundle(bundle, { abortAfter: strategyAbort });
    this.assertExactStrategyEvaluationLinkage(
      strategyRecorded.evaluationId,
      strategyRecorded.vectorId,
      bundle,
    );

    const paper = bundle.paperEvaluation;
    const expectedFeatureIdentity = featureSourceIdentity(bundle.featureVector);
    const expectedStrategyIdentity = strategySourceIdentity({
      strategyVersion: STRATEGY_VERSION,
      strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
      featureSourceIdentity: expectedFeatureIdentity,
    });
    const sourceIdentity = paperSourceIdentity({
      paperSpecVersion: PAPER_SPEC_VERSION,
      paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
      strategySourceIdentity: expectedStrategyIdentity,
    });
    const definitionInserted = this.ensurePaperDefinition(paper);
    if (options.abortAfter === 'paperDefinition') {
      throw new PersistenceError('Test-forced write failure after paper definition insert.');
    }

    const existing = this.requireStatements().getPaperByIdentity.get(sourceIdentity);
    if (existing !== undefined) {
      const stored = this.mapPaperEvaluationSummary(existing);
      if (!storedPaperMatchesEvaluation(stored, paper)) {
        throw new PersistenceError(
          'Source identity already exists with a different paper evaluation. This indicates non-determinism or semantic drift.',
        );
      }
      if (asNumber(existing['strategy_evaluation_id']) !== strategyRecorded.evaluationId) {
        throw new PersistenceError(
          'Existing paper evaluation does not reference the exact strategy evaluation used for this observation.',
        );
      }

      return {
        paperEvaluationId: stored.id,
        strategyEvaluationId: strategyRecorded.evaluationId,
        vectorId: strategyRecorded.vectorId,
        tokenMint: paper.tokenMint,
        sourceIdentity,
        inserted: false,
        strategyInserted: strategyRecorded.inserted,
        featureInserted: strategyRecorded.featureInserted,
        marketInserted: strategyRecorded.marketInserted,
        riskInserted: strategyRecorded.riskInserted,
        tokenInserted: strategyRecorded.tokenInserted,
        paperDefinitionInserted: definitionInserted,
      };
    }

    const token = this.getToken(paper.tokenMint);
    if (token === null) {
      throw new PersistenceError('Paper evaluation token is missing after strategy persistence.');
    }

    const inserted = this.requireStatements().insertPaperEvaluation.run(
      token.id,
      strategyRecorded.evaluationId,
      paper.paperSpecVersion,
      paper.paperDefinitionFingerprint,
      paper.strategyDefinitionFingerprint,
      paper.featureSetVersion,
      paper.asOf,
      paper.evaluatedAt,
      paper.marketCollectedAt,
      paper.pairAddress,
      paper.strategyDecision,
      paper.paperAction,
      paper.noActionReason,
      paper.referencePriceUsd,
      paper.simulatedEntryPriceUsd,
      paper.executionModel,
      paper.costModel,
      paper.quantityModel,
      paper.positionModel,
      paper.exitModel,
      sourceIdentity,
    );
    if (options.abortAfter === 'paperEvaluation') {
      throw new PersistenceError('Test-forced write failure after paper evaluation insert.');
    }

    const paperEvaluationId = Number(inserted.lastInsertRowid);
    this.assertExactStrategyEvaluationLinkage(
      strategyRecorded.evaluationId,
      strategyRecorded.vectorId,
      bundle,
    );
    return {
      paperEvaluationId,
      strategyEvaluationId: strategyRecorded.evaluationId,
      vectorId: strategyRecorded.vectorId,
      tokenMint: paper.tokenMint,
      sourceIdentity,
      inserted: true,
      strategyInserted: strategyRecorded.inserted,
      featureInserted: strategyRecorded.featureInserted,
      marketInserted: strategyRecorded.marketInserted,
      riskInserted: strategyRecorded.riskInserted,
      tokenInserted: strategyRecorded.tokenInserted,
      paperDefinitionInserted: definitionInserted,
    };
  }

  private persistPositionBundle(
    bundle: PositionBundle,
    options: { abortAfter?: PositionPersistAbort } = {},
  ): RecordedPositionBundle {
    assertPersistablePositionEvaluation(bundle.positionEvaluation, {
      marketSnapshot: bundle.marketSnapshot,
      featureVector: bundle.featureVector,
      strategyEvaluation: bundle.strategyEvaluation,
      paperEvaluation: bundle.paperEvaluation,
      priorOpenPosition: bundle.priorOpenPosition,
    });

    const paperAbort =
      options.abortAfter !== undefined && isPaperPersistAbort(options.abortAfter)
        ? options.abortAfter
        : undefined;
    const paperRecorded =
      paperAbort === undefined
        ? this.persistPaperBundle(bundle)
        : this.persistPaperBundle(bundle, { abortAfter: paperAbort });

    const expectedPaperIdentity = paperSourceIdentity({
      paperSpecVersion: PAPER_SPEC_VERSION,
      paperDefinitionFingerprint: PAPER_DEFINITION_FINGERPRINT,
      strategySourceIdentity: bundle.paperEvaluation.strategySourceIdentity,
    });
    this.assertExactPaperEvaluationLinkage(paperRecorded.paperEvaluationId, expectedPaperIdentity, bundle);

    if (options.abortAfter !== undefined && isPaperPersistAbort(options.abortAfter)) {
      throw new PersistenceError(`Test-forced write failure after ${options.abortAfter} insert.`);
    }

    const evaluation = evaluatePositionAction({
      paperEvaluation: bundle.paperEvaluation,
      currentOpenPosition: bundle.priorOpenPosition,
    });
    if (!positionEvaluationsSemanticallyEqual(evaluation, bundle.positionEvaluation)) {
      throw new PersistenceError(
        'Position evaluation does not match a fresh pm10_v1 evaluation of the supplied paper bundle.',
      );
    }

    const definitionInserted = this.ensurePositionDefinition(evaluation);
    if (options.abortAfter === 'positionDefinition') {
      throw new PersistenceError('Test-forced write failure after position definition insert.');
    }

    const existing = this.requireStatements().getPositionByPaperEvaluationId.get(paperRecorded.paperEvaluationId);
    if (existing !== undefined) {
      const stored = this.mapPositionEvaluationSummary(existing);
      if (!storedPositionMatchesEvaluation(stored, evaluation)) {
        throw new PersistenceError(
          'This paper evaluation was already position-processed with different position semantics.',
        );
      }
      return {
        positionEvaluationId: stored.id,
        paperEvaluationId: paperRecorded.paperEvaluationId,
        strategyEvaluationId: paperRecorded.strategyEvaluationId,
        vectorId: paperRecorded.vectorId,
        paperPositionId: this.paperPositionIdForEvaluation(stored.id),
        openPositionCreated: false,
        tokenMint: evaluation.tokenMint,
        sourceIdentity: evaluation.sourceIdentity,
        inserted: false,
        paperInserted: paperRecorded.inserted,
        strategyInserted: paperRecorded.strategyInserted,
        featureInserted: paperRecorded.featureInserted,
        marketInserted: paperRecorded.marketInserted,
        riskInserted: paperRecorded.riskInserted,
        tokenInserted: paperRecorded.tokenInserted,
        paperDefinitionInserted: paperRecorded.paperDefinitionInserted,
        positionDefinitionInserted: definitionInserted,
      };
    }

    const dbOpen = this.reloadOpenPaperPosition(evaluation.tokenMint);
    this.assertOpenPositionStateMatchesCaller(bundle.priorOpenPosition, dbOpen);

    const token = this.getToken(evaluation.tokenMint);
    if (token === null) {
      throw new PersistenceError('Position evaluation token is missing after paper persistence.');
    }

    const inserted = this.requireStatements().insertPositionEvaluation.run(
      token.id,
      paperRecorded.paperEvaluationId,
      evaluation.positionSpecVersion,
      evaluation.positionDefinitionFingerprint,
      evaluation.paperDefinitionFingerprint,
      evaluation.asOf,
      evaluation.evaluatedAt,
      evaluation.paperAction,
      evaluation.paperNoActionReason,
      dbOpen?.id ?? null,
      dbOpen?.positionSourceIdentity ?? null,
      evaluation.positionAction,
      evaluation.positionReason,
      evaluation.entryPriceUsd,
      evaluation.entryNotionalUsd,
      evaluation.quantityTokens,
      evaluation.positionSourceIdentity,
      evaluation.sourceIdentity,
    );
    if (options.abortAfter === 'positionEvaluation') {
      throw new PersistenceError('Test-forced write failure after position evaluation insert.');
    }

    const positionEvaluationId = Number(inserted.lastInsertRowid);
    let paperPositionId: number | null = null;
    let openPositionCreated = false;

    if (evaluation.positionAction === 'open_position') {
      if (typeof bundle.paperEvaluation.simulatedEntryPriceUsd !== 'number') {
        throw new PersistenceError('OPEN_POSITION requires the exact p09 simulatedEntryPriceUsd.');
      }
      const entryPriceUsd = bundle.paperEvaluation.simulatedEntryPriceUsd;
      const quantityTokens = derivePaperQuantityTokens(entryPriceUsd);
      if (!Object.is(evaluation.entryPriceUsd, entryPriceUsd) || !Object.is(evaluation.quantityTokens, quantityTokens)) {
        throw new PersistenceError('OPEN_POSITION quantity or price does not match 100 / entryPriceUsd.');
      }
      if (!Object.is(evaluation.entryNotionalUsd, POSITION_ENTRY_NOTIONAL_USD)) {
        throw new PersistenceError('OPEN_POSITION entryNotionalUsd must be 100.');
      }

      const opened = openPaperPositionFromEvaluation(evaluation, bundle.paperEvaluation);
      const positionSourceIdentity = positionEntrySourceIdentity({
        positionSpecVersion: POSITION_SPEC_VERSION,
        positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
        openingPaperSourceIdentity: evaluation.paperSourceIdentity,
      });
      if (opened.positionSourceIdentity !== positionSourceIdentity) {
        throw new PersistenceError('OPEN_POSITION source identity does not match the opening paper identity.');
      }

      const positionInserted = this.requireStatements().insertPaperPosition.run(
        token.id,
        positionEvaluationId,
        paperRecorded.paperEvaluationId,
        POSITION_SPEC_VERSION,
        POSITION_DEFINITION_FINGERPRINT,
        opened.pairAddress,
        opened.openedAt,
        opened.entryMarketCollectedAt,
        entryPriceUsd,
        POSITION_ENTRY_NOTIONAL_USD,
        quantityTokens,
        evaluation.paperSourceIdentity,
        positionSourceIdentity,
      );
      if (options.abortAfter === 'paperPosition') {
        throw new PersistenceError('Test-forced write failure after paper position insert.');
      }

      paperPositionId = Number(positionInserted.lastInsertRowid);
      this.requireStatements().insertOpenPaperPosition.run(token.id, paperPositionId);
      openPositionCreated = true;
      if (options.abortAfter === 'openPositionState') {
        throw new PersistenceError('Test-forced write failure after open position state insert.');
      }
    } else if (options.abortAfter === 'paperPosition' || options.abortAfter === 'openPositionState') {
      throw new PersistenceError(
        options.abortAfter === 'paperPosition'
          ? 'Test-forced write failure after paper position insert.'
          : 'Test-forced write failure after open position state insert.',
      );
    }

    this.assertExactPaperEvaluationLinkage(paperRecorded.paperEvaluationId, expectedPaperIdentity, bundle);
    return {
      positionEvaluationId,
      paperEvaluationId: paperRecorded.paperEvaluationId,
      strategyEvaluationId: paperRecorded.strategyEvaluationId,
      vectorId: paperRecorded.vectorId,
      paperPositionId,
      openPositionCreated,
      tokenMint: evaluation.tokenMint,
      sourceIdentity: evaluation.sourceIdentity,
      inserted: true,
      paperInserted: paperRecorded.inserted,
      strategyInserted: paperRecorded.strategyInserted,
      featureInserted: paperRecorded.featureInserted,
      marketInserted: paperRecorded.marketInserted,
      riskInserted: paperRecorded.riskInserted,
      tokenInserted: paperRecorded.tokenInserted,
      paperDefinitionInserted: paperRecorded.paperDefinitionInserted,
      positionDefinitionInserted: definitionInserted,
    };
  }

  private ensurePaperDefinition(evaluation: PaperEvaluation): boolean {
    const existing = this.requireStatements().getPaperDefinition.get(evaluation.paperSpecVersion);
    if (existing === undefined) {
      this.requireStatements().insertPaperDefinition.run(
        evaluation.paperSpecVersion,
        evaluation.paperSpecName,
        evaluation.featureSetVersion,
        evaluation.strategyVersion,
        evaluation.strategyDefinitionFingerprint,
        evaluation.paperDefinitionFingerprint,
        evaluation.evaluatedAt,
      );
      return true;
    }

    if (
      asString(existing['paper_spec_name']) !== evaluation.paperSpecName ||
      asString(existing['feature_set_version']) !== evaluation.featureSetVersion ||
      asString(existing['strategy_version']) !== evaluation.strategyVersion ||
      asString(existing['strategy_definition_fingerprint']) !== evaluation.strategyDefinitionFingerprint ||
      asString(existing['definition_fingerprint']) !== evaluation.paperDefinitionFingerprint
    ) {
      throw new PersistenceError(
        'Stored paper definition for p09_v1 does not match the current code fingerprint. Create a new paper spec version instead of mutating p09_v1.',
      );
    }

    return false;
  }

  private ensurePositionDefinition(evaluation: PositionEvaluation): boolean {
    const existing = this.requireStatements().getPositionDefinition.get(evaluation.positionSpecVersion);
    if (existing === undefined) {
      this.requireStatements().insertPositionDefinition.run(
        evaluation.positionSpecVersion,
        evaluation.positionSpecName,
        evaluation.paperSpecVersion,
        evaluation.paperDefinitionFingerprint,
        POSITION_ENTRY_NOTIONAL_USD,
        POSITION_QUANTITY_FORMULA,
        POSITION_MAX_OPEN_PER_TOKEN,
        evaluation.positionDefinitionFingerprint,
        evaluation.evaluatedAt,
      );
      return true;
    }

    if (
      asString(existing['position_spec_name']) !== evaluation.positionSpecName ||
      asString(existing['position_spec_name']) !== POSITION_SPEC_NAME ||
      asString(existing['paper_spec_version']) !== evaluation.paperSpecVersion ||
      asString(existing['paper_definition_fingerprint']) !== evaluation.paperDefinitionFingerprint ||
      !Object.is(asNumber(existing['entry_notional_usd']), POSITION_ENTRY_NOTIONAL_USD) ||
      asString(existing['quantity_formula']) !== POSITION_QUANTITY_FORMULA ||
      asNumber(existing['max_open_positions_per_token']) !== POSITION_MAX_OPEN_PER_TOKEN ||
      asString(existing['definition_fingerprint']) !== evaluation.positionDefinitionFingerprint
    ) {
      throw new PersistenceError(
        'Stored position definition for pm10_v1 does not match the current code fingerprint. Create a new position spec version instead of mutating pm10_v1.',
      );
    }

    return false;
  }

  private assertExactPaperEvaluationLinkage(
    paperEvaluationId: number,
    expectedPaperIdentity: string,
    bundle: PositionBundle,
  ): void {
    const byIdentity = this.requireStatements().getPaperByIdentity.get(expectedPaperIdentity);
    if (byIdentity === undefined) {
      throw new PersistenceError('Position evaluation does not reference an exact stored paper evaluation.');
    }
    if (asNumber(byIdentity['id']) !== paperEvaluationId) {
      throw new PersistenceError(
        'Position evaluation paper_evaluation_id does not match the exact paper evaluation source identity.',
      );
    }

    const byId = this.requireStatements().getPaperById.get(paperEvaluationId);
    if (byId === undefined) {
      throw new PersistenceError('Position evaluation paper_evaluation_id does not match a stored paper evaluation.');
    }
    const stored = this.mapPaperEvaluationSummary(byId);
    if (!storedPaperMatchesEvaluation(stored, bundle.paperEvaluation)) {
      throw new PersistenceError('Stored paper evaluation does not match the position bundle paper evaluation.');
    }
  }

  private reloadOpenPaperPosition(tokenMint: string): StoredOpenPaperPosition | null {
    const token = this.getToken(tokenMint);
    if (token === null) {
      return null;
    }
    return this.readOpenPaperPosition(token.id, token.mint);
  }

  private readOpenPaperPosition(tokenId: number, tokenMint: string): StoredOpenPaperPosition | null {
    const index = this.requireStatements().getOpenPositionIndex.get(tokenId);
    if (index === undefined) {
      return null;
    }
    const row = this.requireStatements().getOpenPaperPosition.get(tokenId);
    if (row === undefined) {
      throw new PersistenceError('Current open-position row references a missing paper position entry.');
    }
    if (
      asNumber(index['token_id']) !== tokenId ||
      asNumber(index['position_id']) !== asNumber(row['id']) ||
      asNumber(row['position_token_id']) !== tokenId ||
      asNumber(row['open_token_id']) !== tokenId
    ) {
      throw new PersistenceError('Current open-position row does not belong to the requested token.');
    }
    return this.mapStoredOpenPaperPosition(row, tokenMint);
  }

  private assertOpenPositionStateMatchesCaller(
    caller: StoredOpenPaperPosition | null,
    dbOpen: StoredOpenPaperPosition | null,
  ): void {
    if (caller === null && dbOpen === null) {
      return;
    }
    if (caller === null || dbOpen === null) {
      throw new PersistenceError(
        'Current open-position state changed since evaluation. Retry the command.',
      );
    }
    if (
      caller.id !== dbOpen.id ||
      caller.positionEvaluationId !== dbOpen.positionEvaluationId ||
      caller.openingPaperEvaluationId !== dbOpen.openingPaperEvaluationId ||
      !openPaperPositionsSemanticallyEqual(caller, dbOpen)
    ) {
      throw new PersistenceError(
        'Current open-position state changed since evaluation. Retry the command.',
      );
    }
  }

  private paperPositionIdForEvaluation(positionEvaluationId: number): number | null {
    const row = this.requireStatements().getPaperPositionById.get(positionEvaluationId);
    return row === undefined ? null : asNumber(row['id']);
  }

  private assertExactStrategyEvaluationLinkage(
    evaluationId: number,
    vectorId: number,
    bundle: PaperBundle,
  ): void {
    const row = this.requireStatements().getStrategyById.get(evaluationId);
    if (row === undefined) {
      throw new PersistenceError('Paper evaluation does not reference an exact stored strategy evaluation.');
    }

    const evaluation = bundle.strategyEvaluation;
    const expectedFeatureIdentity = featureSourceIdentity(bundle.featureVector);
    const expectedStrategyIdentity = strategySourceIdentity({
      strategyVersion: STRATEGY_VERSION,
      strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
      featureSourceIdentity: expectedFeatureIdentity,
    });
    if (asNumber(row['id']) !== evaluationId) {
      throw new PersistenceError('Paper evaluation strategy_evaluation_id does not match the exact stored evaluation.');
    }
    if (asNumber(row['feature_vector_id']) !== vectorId) {
      throw new PersistenceError(
        'Stored strategy evaluation feature_vector_id does not match the exact feature vector used for this paper observation.',
      );
    }
    if (asString(row['token_mint']) !== evaluation.tokenMint || asString(row['token_mint']) !== bundle.paperEvaluation.tokenMint) {
      throw new PersistenceError('Stored strategy evaluation token does not match the paper evaluation.');
    }
    if (asString(row['strategy_version']) !== evaluation.strategyVersion) {
      throw new PersistenceError('Stored strategy evaluation version does not match the paper evaluation.');
    }
    if (asString(row['strategy_definition_fingerprint']) !== evaluation.strategyDefinitionFingerprint) {
      throw new PersistenceError('Stored strategy evaluation fingerprint does not match the paper evaluation.');
    }
    if (asString(row['feature_set_version']) !== evaluation.featureSetVersion) {
      throw new PersistenceError('Stored strategy evaluation feature set does not match the paper evaluation.');
    }
    if (asString(row['as_of']) !== evaluation.asOf || asString(row['as_of']) !== bundle.paperEvaluation.asOf) {
      throw new PersistenceError('Stored strategy evaluation asOf does not match the paper evaluation.');
    }
    if (asString(row['decision']) !== evaluation.decision || asString(row['decision']) !== bundle.paperEvaluation.strategyDecision) {
      throw new PersistenceError('Stored strategy evaluation decision does not match the paper evaluation.');
    }
    if (asNumber(row['passed_rule_count']) !== evaluation.passedRuleCount) {
      throw new PersistenceError('Stored strategy evaluation passed_rule_count does not match the paper evaluation.');
    }
    if (asNumber(row['failed_rule_count']) !== evaluation.failedRuleCount) {
      throw new PersistenceError('Stored strategy evaluation failed_rule_count does not match the paper evaluation.');
    }
    if (asNumber(row['unavailable_rule_count']) !== evaluation.unavailableRuleCount) {
      throw new PersistenceError('Stored strategy evaluation unavailable_rule_count does not match the paper evaluation.');
    }
    if (asString(row['source_identity']) !== expectedStrategyIdentity) {
      throw new PersistenceError('Stored strategy evaluation source identity does not match the recomputed identity.');
    }
    if (asString(row['feature_source_identity']) !== expectedFeatureIdentity) {
      throw new PersistenceError('Stored strategy evaluation feature source identity does not match the recomputed identity.');
    }

    const stored = this.mapStrategyEvaluationSummary(row);
    if (!strategyEvaluationsSemanticallyEqual(stored, evaluation)) {
      throw new PersistenceError(
        'Stored strategy evaluation rules and metadata do not match the exact s07_v1 evaluation supplied for this paper observation.',
      );
    }
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

  private persistRiskReportIfAbsent(
    report: TokenRiskReport,
    options: { abortAfter?: 'riskParent' | 'riskChildren' } = {},
  ): boolean {
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

    this.persistRiskReport(report, options);
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

  private mapPaperEvaluationSummary(
    row: Record<string, SQLOutputValue>,
  ): StoredPaperEvaluationSummary {
    return {
      id: asNumber(row['id']),
      strategyEvaluationId: asNumber(row['strategy_evaluation_id']),
      tokenMint: asString(row['token_mint']),
      paperSpecVersion: asString(row['paper_spec_version']),
      paperSpecName: asString(row['paper_spec_name']),
      paperDefinitionFingerprint: asString(row['paper_definition_fingerprint']),
      strategyVersion: asString(row['strategy_version']),
      strategyDefinitionFingerprint: asString(row['strategy_definition_fingerprint']),
      strategyDecision: asString(row['strategy_decision']) as StrategyDecision,
      featureSetVersion: asString(row['feature_set_version']),
      asOf: asString(row['as_of']),
      evaluatedAt: asString(row['evaluated_at']),
      pairAddress: asString(row['pair_address']),
      marketCollectedAt: asString(row['market_collected_at']),
      paperAction: asString(row['paper_action']) as PaperEvaluation['paperAction'],
      noActionReason: asNullableString(row['no_action_reason']) as PaperEvaluation['noActionReason'],
      referencePriceUsd: asNullableNumber(row['reference_price_usd']),
      simulatedEntryPriceUsd: asNullableNumber(row['simulated_entry_price_usd']),
      executionModel: asString(row['execution_model']) as PaperEvaluation['executionModel'],
      costModel: asString(row['cost_model']) as PaperEvaluation['costModel'],
      quantityModel: asString(row['quantity_model']) as PaperEvaluation['quantityModel'],
      positionModel: asString(row['position_model']) as PaperEvaluation['positionModel'],
      exitModel: asString(row['exit_model']) as PaperEvaluation['exitModel'],
      sourceIdentity: asString(row['source_identity']),
    };
  }

  private mapPositionEvaluationSummary(
    row: Record<string, SQLOutputValue>,
  ): StoredPositionEvaluationSummary {
    return {
      id: asNumber(row['id']),
      paperEvaluationId: asNumber(row['paper_evaluation_id']),
      tokenMint: asString(row['token_mint']),
      positionSpecVersion: asString(row['position_spec_version']),
      positionSpecName: asString(row['position_spec_name']),
      positionDefinitionFingerprint: asString(row['position_definition_fingerprint']),
      paperSpecVersion: asString(row['paper_spec_version']),
      paperDefinitionFingerprint: asString(row['paper_definition_fingerprint']),
      paperSourceIdentity: asString(row['paper_source_identity']),
      asOf: asString(row['as_of']),
      evaluatedAt: asString(row['evaluated_at']),
      paperAction: asString(row['paper_action']) as PositionEvaluation['paperAction'],
      paperNoActionReason: asNullableString(row['paper_no_action_reason']) as PositionEvaluation['paperNoActionReason'],
      priorOpenPositionId: asNullableNumber(row['prior_open_position_id']),
      priorOpenPositionSourceIdentity: asNullableString(row['prior_open_position_source_identity']),
      positionAction: asString(row['position_action']) as PositionEvaluation['positionAction'],
      positionReason: asNullableString(row['position_reason']) as PositionEvaluation['positionReason'],
      entryPriceUsd: asNullableNumber(row['entry_price_usd']),
      entryNotionalUsd: asNullableNumber(row['entry_notional_usd']),
      quantityTokens: asNullableNumber(row['quantity_tokens']),
      positionSourceIdentity: asNullableString(row['position_source_identity']),
      sourceIdentity: asString(row['source_identity']),
    };
  }

  private mapStoredOpenPaperPosition(
    row: Record<string, SQLOutputValue>,
    tokenMint: string,
  ): StoredOpenPaperPosition {
    const entryPriceUsd = asNumber(row['entry_price_usd']);
    const entryNotionalUsd = asNumber(row['entry_notional_usd']);
    const quantityTokens = asNumber(row['quantity_tokens']);
    if (!Number.isFinite(entryPriceUsd) || entryPriceUsd <= 0) {
      throw new PersistenceError('Stored open paper position has an invalid entry price.');
    }
    if (!Object.is(entryNotionalUsd, POSITION_ENTRY_NOTIONAL_USD)) {
      throw new PersistenceError('Stored open paper position has an invalid entry notional.');
    }
    const expectedQuantity = derivePaperQuantityTokens(entryPriceUsd);
    if (!Object.is(quantityTokens, expectedQuantity)) {
      throw new PersistenceError('Stored open paper position quantity does not match 100 / entryPriceUsd.');
    }

    const storedMint = asString(row['token_mint']);
    if (storedMint !== tokenMint) {
      throw new PersistenceError('Stored open paper position token mint does not match the open-state index.');
    }
    if (asString(row['position_spec_version']) !== POSITION_SPEC_VERSION) {
      throw new PersistenceError('Stored open paper position must use spec pm10_v1.');
    }
    if (asString(row['position_definition_fingerprint']) !== POSITION_DEFINITION_FINGERPRINT) {
      throw new PersistenceError('Stored open paper position definition fingerprint does not match pm10_v1.');
    }

    const openingPaperSourceIdentity = asString(row['opening_paper_source_identity']);
    const positionSourceIdentity = asString(row['source_identity']);
    const expectedIdentity = positionEntrySourceIdentity({
      positionSpecVersion: POSITION_SPEC_VERSION,
      positionDefinitionFingerprint: POSITION_DEFINITION_FINGERPRINT,
      openingPaperSourceIdentity,
    });
    if (positionSourceIdentity !== expectedIdentity) {
      throw new PersistenceError('Stored open paper position source identity is malformed.');
    }

    return {
      id: asNumber(row['id']),
      positionEvaluationId: asNumber(row['position_evaluation_id']),
      openingPaperEvaluationId: asNumber(row['opening_paper_evaluation_id']),
      chain: 'solana',
      tokenMint: storedMint,
      pairAddress: asString(row['pair_address']),
      positionSpecVersion: asString(row['position_spec_version']),
      positionDefinitionFingerprint: asString(row['position_definition_fingerprint']),
      openedAt: asString(row['opened_at']),
      entryMarketCollectedAt: asString(row['entry_market_collected_at']),
      entryPriceUsd,
      entryNotionalUsd,
      quantityTokens,
      openingPaperSourceIdentity,
      positionSourceIdentity,
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

const PAPER_EVALUATION_SELECT = `SELECT p.id, p.strategy_evaluation_id, t.mint AS token_mint, p.paper_spec_version, d.paper_spec_name,
              p.paper_definition_fingerprint, d.strategy_version, p.strategy_definition_fingerprint,
              p.strategy_decision, p.feature_set_version, p.as_of, p.evaluated_at, p.pair_address,
              p.market_collected_at, p.paper_action, p.no_action_reason, p.reference_price_usd,
              p.simulated_entry_price_usd, p.execution_model, p.cost_model, p.quantity_model,
              p.position_model, p.exit_model, p.source_identity
       FROM paper_evaluations p
       JOIN paper_definitions d ON d.paper_spec_version = p.paper_spec_version
       JOIN tokens t ON t.id = p.token_id`;

const POSITION_EVALUATION_SELECT = `SELECT e.id, e.paper_evaluation_id, t.mint AS token_mint, e.position_spec_version,
              d.position_spec_name, e.position_definition_fingerprint, d.paper_spec_version,
              e.paper_definition_fingerprint, p.source_identity AS paper_source_identity,
              e.as_of, e.evaluated_at, e.paper_action, e.paper_no_action_reason,
              e.prior_open_position_id, e.prior_open_position_source_identity, e.position_action,
              e.position_reason, e.entry_price_usd, e.entry_notional_usd, e.quantity_tokens,
              e.position_source_identity, e.source_identity
       FROM position_evaluations e
       JOIN position_definitions d ON d.position_spec_version = e.position_spec_version
       JOIN tokens t ON t.id = e.token_id
       JOIN paper_evaluations p ON p.id = e.paper_evaluation_id`;

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
    getPaperDefinition: database.prepare(
      `SELECT paper_spec_version, paper_spec_name, feature_set_version, strategy_version,
              strategy_definition_fingerprint, definition_fingerprint, first_recorded_at
       FROM paper_definitions
       WHERE paper_spec_version = ?`,
    ),
    insertPaperDefinition: database.prepare(
      `INSERT INTO paper_definitions (
        paper_spec_version, paper_spec_name, feature_set_version, strategy_version,
        strategy_definition_fingerprint, definition_fingerprint, first_recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ),
    getPaperByIdentity: database.prepare(`${PAPER_EVALUATION_SELECT} WHERE p.source_identity = ?`),
    insertPaperEvaluation: database.prepare(
      `INSERT INTO paper_evaluations (
        token_id, strategy_evaluation_id, paper_spec_version, paper_definition_fingerprint,
        strategy_definition_fingerprint, feature_set_version, as_of, evaluated_at, market_collected_at,
        pair_address, strategy_decision, paper_action, no_action_reason, reference_price_usd,
        simulated_entry_price_usd, execution_model, cost_model, quantity_model, position_model,
        exit_model, source_identity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    paperHistory: database.prepare(
      `${PAPER_EVALUATION_SELECT}
       WHERE p.token_id = ?
       ORDER BY p.as_of DESC, p.id DESC
       LIMIT ?`,
    ),
    getStrategyById: database.prepare(
      `SELECT e.id, e.feature_vector_id, t.mint AS token_mint, e.strategy_version, d.strategy_name,
              e.strategy_definition_fingerprint, e.feature_set_version, e.evaluated_at, e.as_of,
              e.decision, e.passed_rule_count, e.failed_rule_count, e.unavailable_rule_count,
              e.source_identity, f.source_identity AS feature_source_identity
       FROM strategy_evaluations e
       JOIN strategy_definitions d ON d.strategy_version = e.strategy_version
       JOIN feature_vectors f ON f.id = e.feature_vector_id
       JOIN tokens t ON t.id = e.token_id
       WHERE e.id = ?`,
    ),
    countPaperDefinitions: database.prepare('SELECT COUNT(*) AS count FROM paper_definitions'),
    countPaperEvaluations: database.prepare('SELECT COUNT(*) AS count FROM paper_evaluations'),
    getPositionDefinition: database.prepare(
      `SELECT position_spec_version, position_spec_name, paper_spec_version, paper_definition_fingerprint,
              entry_notional_usd, quantity_formula, max_open_positions_per_token, definition_fingerprint,
              first_recorded_at
       FROM position_definitions
       WHERE position_spec_version = ?`,
    ),
    insertPositionDefinition: database.prepare(
      `INSERT INTO position_definitions (
        position_spec_version, position_spec_name, paper_spec_version, paper_definition_fingerprint,
        entry_notional_usd, quantity_formula, max_open_positions_per_token, definition_fingerprint,
        first_recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    getPositionByPaperEvaluationId: database.prepare(
      `${POSITION_EVALUATION_SELECT} WHERE e.paper_evaluation_id = ?`,
    ),
    getPositionByIdentity: database.prepare(`${POSITION_EVALUATION_SELECT} WHERE e.source_identity = ?`),
    insertPositionEvaluation: database.prepare(
      `INSERT INTO position_evaluations (
        token_id, paper_evaluation_id, position_spec_version, position_definition_fingerprint,
        paper_definition_fingerprint, as_of, evaluated_at, paper_action, paper_no_action_reason,
        prior_open_position_id, prior_open_position_source_identity, position_action, position_reason,
        entry_price_usd, entry_notional_usd, quantity_tokens, position_source_identity, source_identity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    positionHistory: database.prepare(
      `${POSITION_EVALUATION_SELECT}
       WHERE e.token_id = ?
       ORDER BY e.as_of DESC, e.id DESC
       LIMIT ?`,
    ),
    insertPaperPosition: database.prepare(
      `INSERT INTO paper_positions (
        token_id, position_evaluation_id, opening_paper_evaluation_id, position_spec_version,
        position_definition_fingerprint, pair_address, opened_at, entry_market_collected_at,
        entry_price_usd, entry_notional_usd, quantity_tokens, opening_paper_source_identity, source_identity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    insertOpenPaperPosition: database.prepare(
      'INSERT INTO paper_open_positions (token_id, position_id) VALUES (?, ?)',
    ),
    getOpenPositionIndex: database.prepare(
      'SELECT token_id, position_id FROM paper_open_positions WHERE token_id = ?',
    ),
    getOpenPaperPosition: database.prepare(
      `SELECT pp.id, pp.position_evaluation_id, pp.opening_paper_evaluation_id, pp.pair_address,
              pp.position_spec_version, pp.position_definition_fingerprint, pp.opened_at,
              pp.entry_market_collected_at, pp.entry_price_usd, pp.entry_notional_usd, pp.quantity_tokens,
              pp.opening_paper_source_identity, pp.source_identity, t.mint AS token_mint,
              pp.token_id AS position_token_id, op.token_id AS open_token_id
       FROM paper_open_positions op
       JOIN paper_positions pp ON pp.id = op.position_id AND pp.token_id = op.token_id
       JOIN tokens t ON t.id = pp.token_id
       WHERE op.token_id = ?`,
    ),
    getPaperPositionById: database.prepare(
      'SELECT id FROM paper_positions WHERE position_evaluation_id = ?',
    ),
    getPaperById: database.prepare(`${PAPER_EVALUATION_SELECT} WHERE p.id = ?`),
    countPositionDefinitions: database.prepare('SELECT COUNT(*) AS count FROM position_definitions'),
    countPositionEvaluations: database.prepare('SELECT COUNT(*) AS count FROM position_evaluations'),
    countPaperPositions: database.prepare('SELECT COUNT(*) AS count FROM paper_positions'),
    countOpenPaperPositions: database.prepare('SELECT COUNT(*) AS count FROM paper_open_positions'),
  };
}

function storedPaperMatchesEvaluation(
  stored: StoredPaperEvaluationSummary,
  paper: PaperEvaluation,
): boolean {
  return (
    stored.tokenMint === paper.tokenMint &&
    stored.paperSpecVersion === paper.paperSpecVersion &&
    stored.paperSpecName === paper.paperSpecName &&
    stored.paperDefinitionFingerprint === paper.paperDefinitionFingerprint &&
    stored.strategyVersion === paper.strategyVersion &&
    stored.strategyDefinitionFingerprint === paper.strategyDefinitionFingerprint &&
    stored.strategyDecision === paper.strategyDecision &&
    stored.featureSetVersion === paper.featureSetVersion &&
    stored.asOf === paper.asOf &&
    stored.evaluatedAt === paper.evaluatedAt &&
    stored.pairAddress === paper.pairAddress &&
    stored.marketCollectedAt === paper.marketCollectedAt &&
    stored.paperAction === paper.paperAction &&
    stored.noActionReason === paper.noActionReason &&
    Object.is(stored.referencePriceUsd, paper.referencePriceUsd) &&
    Object.is(stored.simulatedEntryPriceUsd, paper.simulatedEntryPriceUsd) &&
    (stored.executionModel as string) === (paper.executionModel as string) &&
    (stored.costModel as string) === (paper.costModel as string) &&
    (stored.quantityModel as string) === (paper.quantityModel as string) &&
    (stored.positionModel as string) === (paper.positionModel as string) &&
    (stored.exitModel as string) === (paper.exitModel as string) &&
    stored.sourceIdentity ===
      paperSourceIdentity({
        paperSpecVersion: paper.paperSpecVersion,
        paperDefinitionFingerprint: paper.paperDefinitionFingerprint,
        strategySourceIdentity: paper.strategySourceIdentity,
      })
  );
}

function storedPositionMatchesEvaluation(
  stored: StoredPositionEvaluationSummary,
  evaluation: PositionEvaluation,
): boolean {
  return (
    stored.tokenMint === evaluation.tokenMint &&
    stored.positionSpecVersion === evaluation.positionSpecVersion &&
    stored.positionSpecName === evaluation.positionSpecName &&
    stored.positionDefinitionFingerprint === evaluation.positionDefinitionFingerprint &&
    stored.paperSpecVersion === evaluation.paperSpecVersion &&
    stored.paperDefinitionFingerprint === evaluation.paperDefinitionFingerprint &&
    stored.paperSourceIdentity === evaluation.paperSourceIdentity &&
    stored.asOf === evaluation.asOf &&
    stored.evaluatedAt === evaluation.evaluatedAt &&
    stored.paperAction === evaluation.paperAction &&
    stored.paperNoActionReason === evaluation.paperNoActionReason &&
    stored.priorOpenPositionSourceIdentity === evaluation.priorOpenPositionSourceIdentity &&
    stored.positionAction === evaluation.positionAction &&
    stored.positionReason === evaluation.positionReason &&
    Object.is(stored.entryPriceUsd, evaluation.entryPriceUsd) &&
    Object.is(stored.entryNotionalUsd, evaluation.entryNotionalUsd) &&
    Object.is(stored.quantityTokens, evaluation.quantityTokens) &&
    stored.positionSourceIdentity === evaluation.positionSourceIdentity &&
    stored.sourceIdentity ===
      positionEvaluationSourceIdentity({
        positionSpecVersion: evaluation.positionSpecVersion,
        positionDefinitionFingerprint: evaluation.positionDefinitionFingerprint,
        paperSourceIdentity: evaluation.paperSourceIdentity,
        priorOpenPositionSourceIdentity: evaluation.priorOpenPositionSourceIdentity,
      })
  );
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
