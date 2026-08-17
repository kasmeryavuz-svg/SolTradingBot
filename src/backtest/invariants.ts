import { requireUtcTimestamp } from '../features/numbers.js';
import { isPlausibleSolanaMint } from '../utils/solana-mint.js';
import {
  BACKTEST_SPEC_NAME,
  BACKTEST_SPEC_VERSION,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  REQUIRED_BACKTEST_STRATEGY_VERSION,
} from './constants.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from './identity.js';
import { assertResolvedOutcomeInvariants } from './outcomes.js';
import { summarizeBacktestEvents } from './summary.js';
import { BacktestError, type BacktestDataset, type BacktestEvent, type BacktestResult } from './types.js';

export function assertBacktestDataset(dataset: BacktestDataset): void {
  const marketIdentities = new Set<string>();
  for (const snapshot of dataset.marketSnapshots) {
    if ((snapshot.chain as string) !== 'solana') {
      throw new BacktestError('Backtest market snapshots must describe Solana.');
    }
    if (!isPlausibleSolanaMint(snapshot.tokenMint)) {
      throw new BacktestError('Backtest market snapshot has an invalid token mint.');
    }
    requireUtcTimestamp(snapshot.collectedAt, 'market.collectedAt');
    const identity = `${snapshot.tokenMint}\0${snapshot.pairAddress}\0${snapshot.collectedAt}`;
    if (marketIdentities.has(identity)) {
      throw new BacktestError('Duplicate historical market identity in the backtest dataset.');
    }
    marketIdentities.add(identity);
  }

  const riskIdentities = new Set<string>();
  for (const report of dataset.riskReports) {
    if (!isPlausibleSolanaMint(report.tokenMint)) {
      throw new BacktestError('Backtest risk report has an invalid token mint.');
    }
    requireUtcTimestamp(report.scannedAt, 'risk.scannedAt');
    const identity = `${report.tokenMint}\0${report.scannedAt}`;
    if (riskIdentities.has(identity)) {
      throw new BacktestError('Duplicate historical risk identity in the backtest dataset.');
    }
    riskIdentities.add(identity);
  }
}

export function assertBacktestResult(result: BacktestResult, dataset: BacktestDataset): void {
  if (result.backtestSpecVersion !== BACKTEST_SPEC_VERSION) {
    throw new BacktestError('Backtest spec version is not b08_v1.');
  }
  if (result.backtestSpecName !== BACKTEST_SPEC_NAME) {
    throw new BacktestError('Backtest spec name does not match fixed_horizon_gross_price_outcome.');
  }
  if (result.backtestDefinitionFingerprint !== BACKTEST_DEFINITION_FINGERPRINT) {
    throw new BacktestError('Backtest definition fingerprint does not match b08_v1.');
  }
  if (result.strategyVersion !== REQUIRED_BACKTEST_STRATEGY_VERSION) {
    throw new BacktestError('Backtest strategy version is not s07_v1.');
  }
  if (result.strategyDefinitionFingerprint !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
    throw new BacktestError('Backtest s07_v1 fingerprint does not match the frozen Checkpoint 07 definition.');
  }
  if (result.featureSetVersion !== 'c06_v1') {
    throw new BacktestError('Backtest feature set is not c06_v1.');
  }
  if (result.marketSnapshotCount !== dataset.marketSnapshots.length) {
    throw new BacktestError('Backtest market snapshot count does not match the dataset.');
  }
  if (result.riskReportCount !== dataset.riskReports.length) {
    throw new BacktestError('Backtest risk report count does not match the dataset.');
  }
  if (result.events.length !== dataset.marketSnapshots.length) {
    throw new BacktestError('Backtest must emit one event per historical market snapshot.');
  }

  const expected = summarizeBacktestEvents(result.events);
  if (
    result.summary.evaluationCount !== expected.evaluationCount ||
    result.summary.entryCandidateCount !== expected.entryCandidateCount ||
    result.summary.noEntryCount !== expected.noEntryCount ||
    result.summary.insufficientDataCount !== expected.insufficientDataCount ||
    result.summary.resolvedEntryCandidateCount !== expected.resolvedEntryCandidateCount ||
    result.summary.unresolvedEntryCandidateCount !== expected.unresolvedEntryCandidateCount ||
    result.summary.positiveForwardOutcomeCount !== expected.positiveForwardOutcomeCount ||
    result.summary.nonPositiveForwardOutcomeCount !== expected.nonPositiveForwardOutcomeCount ||
    !Object.is(result.summary.averageGrossForwardReturnPct, expected.averageGrossForwardReturnPct)
  ) {
    throw new BacktestError('Backtest summary does not match the stored events.');
  }

  for (const event of result.events) {
    assertBacktestEvent(event, dataset);
  }
}

function assertBacktestEvent(event: BacktestEvent, dataset: BacktestDataset): void {
  if ((event.chain as string) !== 'solana') {
    throw new BacktestError('Backtest events must describe Solana.');
  }
  requireUtcTimestamp(event.asOf, 'event.asOf');

  if (event.strategyDecision === 'entry_candidate') {
    if (event.outcome === null) {
      throw new BacktestError('ENTRY_CANDIDATE events must include an outcome object.');
    }
    if (event.outcome.status === 'resolved') {
      const outcome = event.outcome;
      assertResolvedOutcomeInvariants(event, outcome);
      const matching = dataset.marketSnapshots.find(
        (snapshot) =>
          snapshot.tokenMint === event.tokenMint &&
          snapshot.pairAddress === event.pairAddress &&
          snapshot.collectedAt === outcome.outcomeCollectedAt,
      );
      if (matching === undefined) {
        throw new BacktestError('Resolved outcome does not match a same-pair historical snapshot.');
      }
      if (matching.pairAddress !== event.pairAddress) {
        throw new BacktestError('Resolved outcome pair does not match the strategy event pair.');
      }
      if (matching.collectedAt < outcome.targetAt || matching.collectedAt > outcome.windowEndAt) {
        throw new BacktestError('Resolved outcome collectedAt is outside the allowed window.');
      }
    }
    return;
  }

  if (event.outcome !== null) {
    throw new BacktestError('NO_ENTRY and INSUFFICIENT_DATA events must not carry an outcome.');
  }
}
