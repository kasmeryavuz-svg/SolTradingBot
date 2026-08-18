import { requireUtcTimestamp } from '../features/numbers.js';
import type { FeatureVector } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import { evaluateOptimizationEntry } from '../optimization/entries.js';
import { isObservationInWindow, testWindow } from '../optimization/folds.js';
import { optimizationMarketTimeIdentity } from '../optimization/identity.js';
import { allScenarioMetrics } from '../optimization/metrics.js';
import {
  buildOptimizationIndexes,
  reconstructIndexedPointInTimeVector,
  sortOptimizationMarketEvents,
  type OptimizationIndexes,
} from '../optimization/timeline.js';
import type { FoldBoundaries, SimulationWindow } from '../optimization/types.js';
import { BASELINE_ENTRY_CANDIDATE_ID } from './constants.js';
import { censoringBps } from './censoring.js';
import { outcomeToCompletedTrade } from './economic.js';
import { labeledOutcome, sampleInTestEntryWindow, testBound } from './folds.js';
import { simulateX11Label } from './labels.js';
import type { BaselineFoldStats, MlDataset, MlLabelOutcome } from './types.js';

export type FoldBaselineEvaluation = BaselineFoldStats & {
  openedIdentities: readonly string[];
  completedIdentities: readonly string[];
  censoredIdentities: readonly string[];
};

export function isMl19TestObservation(collectedAtMs: number, fold: FoldBoundaries): boolean {
  return isObservationInWindow(collectedAtMs, testWindow(fold));
}

export function mlAndBaselineShareTestMembership(
  collectedAtMs: number,
  fold: FoldBoundaries,
): { ml: boolean; baseline: boolean } {
  return {
    ml: sampleInTestEntryWindow({ collectedAtMs }, fold),
    baseline: isMl19TestObservation(collectedAtMs, fold),
  };
}

function occupancyEndMs(window: SimulationWindow, outcome: MlLabelOutcome): number {
  if (outcome.completedAtMs !== null) {
    return outcome.completedAtMs;
  }
  if (window.observationEndExclusiveMs === null) {
    return window.observationEndInclusiveMs;
  }
  return window.observationEndExclusiveMs - 1;
}

function tryPointInTimeVector(
  snapshot: MarketSnapshot,
  indexes: OptimizationIndexes,
): FeatureVector | null {
  try {
    return reconstructIndexedPointInTimeVector({ snapshot, indexes });
  } catch {
    return null;
  }
}

export function evaluateFoldBaseline(dataset: MlDataset, fold: FoldBoundaries): FoldBaselineEvaluation {
  const indexes = buildOptimizationIndexes({
    marketSnapshots: dataset.marketSnapshots,
    riskReports: dataset.riskReports,
  });
  const window = testWindow(fold);
  const bound = testBound(fold);
  const occupiedUntilMs = new Map<string, number>();
  const lastLifecycleCollectedAtByToken = new Map<string, string>();
  const opened: {
    identity: string;
    tokenMint: string;
    pairAddress: string;
    collectedAt: string;
    entryPriceUsd: number;
    outcome: MlLabelOutcome;
  }[] = [];

  for (const snapshot of sortOptimizationMarketEvents(dataset.marketSnapshots)) {
    const collectedMs = requireUtcTimestamp(snapshot.collectedAt, 'collectedAt');
    if (!isMl19TestObservation(collectedMs, fold)) {
      continue;
    }
    if (lastLifecycleCollectedAtByToken.get(snapshot.tokenMint) === snapshot.collectedAt) {
      continue;
    }
    lastLifecycleCollectedAtByToken.set(snapshot.tokenMint, snapshot.collectedAt);

    const occupiedUntil = occupiedUntilMs.get(snapshot.tokenMint);
    if (occupiedUntil !== undefined && collectedMs <= occupiedUntil) {
      continue;
    }

    const vector = tryPointInTimeVector(snapshot, indexes);
    if (vector === null) {
      continue;
    }
    const evaluation = evaluateOptimizationEntry(BASELINE_ENTRY_CANDIDATE_ID, vector);
    if (evaluation.decision !== 'entry_candidate') {
      continue;
    }
    const entryPriceUsd = snapshot.priceUsd;
    if (typeof entryPriceUsd !== 'number' || !Number.isFinite(entryPriceUsd) || !(entryPriceUsd > 0)) {
      continue;
    }

    const outcome = simulateX11Label({
      entry: snapshot,
      indexes,
      bound,
    });
    opened.push({
      identity: optimizationMarketTimeIdentity(snapshot),
      tokenMint: snapshot.tokenMint,
      pairAddress: snapshot.pairAddress,
      collectedAt: snapshot.collectedAt,
      entryPriceUsd,
      outcome,
    });
    occupiedUntilMs.set(snapshot.tokenMint, occupancyEndMs(window, outcome));
  }

  const completed = opened.filter((item) => labeledOutcome(item.outcome));
  const censored = opened.filter((item) => !labeledOutcome(item.outcome));
  const trades = completed.map((item) =>
    outcomeToCompletedTrade(
      item.identity,
      item.tokenMint,
      item.pairAddress,
      item.collectedAt,
      item.entryPriceUsd,
      item.outcome,
    ),
  );
  const scenarios = trades.length === 0 ? null : allScenarioMetrics(trades);
  return {
    openedPositions: opened.length,
    completedTrades: completed.length,
    censoredTrades: censored.length,
    censoringBps: censoringBps(censored.length, opened.length),
    netBaseExpectancy: scenarios?.netBase.expectancyUsd ?? null,
    netStressExpectancy: scenarios?.netStress.expectancyUsd ?? null,
    openedIdentities: opened.map((item) => item.identity),
    completedIdentities: completed.map((item) => item.identity),
    censoredIdentities: censored.map((item) => item.identity),
  };
}
