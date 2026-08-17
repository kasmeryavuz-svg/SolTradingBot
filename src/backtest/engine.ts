import { generateFeatureVector } from '../features/engine.js';
import { FeatureEngineError, type RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { evaluateStrategy } from '../strategy/evaluator.js';
import { STRATEGY_DEFINITION_FINGERPRINT, strategySourceIdentityFromVector } from '../strategy/identity.js';
import { StrategyError } from '../strategy/types.js';
import {
  BACKTEST_SPEC_NAME,
  BACKTEST_SPEC_VERSION,
  FROZEN_S07_V1_DEFINITION_FINGERPRINT,
  REQUIRED_BACKTEST_FEATURE_SET_VERSION,
  REQUIRED_BACKTEST_STRATEGY_VERSION,
} from './constants.js';
import { BACKTEST_DEFINITION_FINGERPRINT } from './identity.js';
import { assertBacktestDataset, assertBacktestResult } from './invariants.js';
import { resolveCandidateOutcome } from './outcomes.js';
import { summarizeBacktestEvents } from './summary.js';
import { selectLatestRisk, selectPreviousMarket, sortMarketSnapshots, sortRiskReports } from './timeline.js';
import {
  BacktestError,
  type BacktestDataset,
  type BacktestEvent,
  type BacktestResult,
  type BacktestScope,
} from './types.js';

export function runBacktest(dataset: BacktestDataset, options: { scope: BacktestScope }): BacktestResult {
  assertBacktestDataset(dataset);
  assertScope(dataset, options.scope);

  if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
    throw new BacktestError('Frozen s07_v1 fingerprint does not match Checkpoint 07.');
  }

  const marketSnapshots = sortMarketSnapshots(dataset.marketSnapshots);
  const riskReports = sortRiskReports(dataset.riskReports);
  const classified = reconstructDecisions(marketSnapshots, riskReports);
  const events = attachOutcomes(classified, marketSnapshots);
  const result: BacktestResult = {
    backtestSpecVersion: BACKTEST_SPEC_VERSION,
    backtestSpecName: BACKTEST_SPEC_NAME,
    backtestDefinitionFingerprint: BACKTEST_DEFINITION_FINGERPRINT,
    strategyVersion: REQUIRED_BACKTEST_STRATEGY_VERSION,
    strategyDefinitionFingerprint: STRATEGY_DEFINITION_FINGERPRINT,
    featureSetVersion: REQUIRED_BACKTEST_FEATURE_SET_VERSION,
    scope: options.scope,
    marketSnapshotCount: marketSnapshots.length,
    riskReportCount: riskReports.length,
    events,
    summary: summarizeBacktestEvents(events),
  };

  assertBacktestResult(result, { marketSnapshots, riskReports });
  return result;
}

type ClassifiedSnapshot = {
  snapshot: MarketSnapshot;
  event: Omit<BacktestEvent, 'outcome'>;
};

function reconstructDecisions(
  marketSnapshots: readonly MarketSnapshot[],
  riskReports: readonly RiskFeatureInput[],
): ClassifiedSnapshot[] {
  return marketSnapshots.map((snapshot) => classifySnapshot(snapshot, marketSnapshots, riskReports));
}

function classifySnapshot(
  snapshot: MarketSnapshot,
  marketSnapshots: readonly MarketSnapshot[],
  riskReports: readonly RiskFeatureInput[],
): ClassifiedSnapshot {
  const asOf = snapshot.collectedAt;
  try {
    const vector = generateFeatureVector(
      {
        market: snapshot,
        previousMarket: selectPreviousMarket(snapshot, marketSnapshots),
        risk: selectLatestRisk(snapshot.tokenMint, asOf, riskReports),
        riskUnavailableReason: null,
        asOf,
      },
      { generatedAt: asOf },
    );
    const evaluation = evaluateStrategy(vector, { evaluatedAt: asOf });
    return {
      snapshot,
      event: {
        chain: 'solana',
        tokenMint: snapshot.tokenMint,
        pairAddress: snapshot.pairAddress,
        asOf,
        featureSourceIdentity: evaluation.featureSourceIdentity,
        strategySourceIdentity: strategySourceIdentityFromVector(vector),
        strategyDecision: evaluation.decision,
        passedRuleCount: evaluation.passedRuleCount,
        failedRuleCount: evaluation.failedRuleCount,
        unavailableRuleCount: evaluation.unavailableRuleCount,
      },
    };
  } catch (error: unknown) {
    wrapDomainError(error);
  }
}

function attachOutcomes(
  classified: readonly ClassifiedSnapshot[],
  marketSnapshots: readonly MarketSnapshot[],
): BacktestEvent[] {
  return classified.map(({ snapshot, event }) => {
    if (event.strategyDecision !== 'entry_candidate') {
      return { ...event, outcome: null };
    }

    return {
      ...event,
      outcome: resolveCandidateOutcome(event, snapshot.priceUsd ?? Number.NaN, marketSnapshots),
    };
  });
}

function assertScope(dataset: BacktestDataset, scope: BacktestScope): void {
  if (scope.kind !== 'token') {
    return;
  }

  for (const snapshot of dataset.marketSnapshots) {
    if (snapshot.tokenMint !== scope.tokenMint) {
      throw new BacktestError('One-token backtest dataset contains a different mint.');
    }
  }
  for (const report of dataset.riskReports) {
    if (report.tokenMint !== scope.tokenMint) {
      throw new BacktestError('One-token backtest dataset contains a risk report for a different mint.');
    }
  }
}

function wrapDomainError(error: unknown): never {
  if (error instanceof FeatureEngineError || error instanceof StrategyError || error instanceof BacktestError) {
    throw new BacktestError(error.message, { cause: error });
  }
  throw error;
}
