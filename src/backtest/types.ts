import type { RiskFeatureInput } from '../features/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { StrategyDecision } from '../strategy/types.js';

export class BacktestError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'BacktestError';
  }
}

export const BACKTEST_OUTCOME_REASONS = [
  'no_same_pair_snapshot_in_outcome_window',
  'outcome_price_unavailable',
] as const;

export type BacktestOutcomeReason = (typeof BACKTEST_OUTCOME_REASONS)[number];

export type BacktestScope =
  | { kind: 'all' }
  | { kind: 'token'; tokenMint: string };

export type BacktestDataset = {
  marketSnapshots: MarketSnapshot[];
  riskReports: RiskFeatureInput[];
};

export type ResolvedBacktestOutcome = {
  status: 'resolved';
  targetAt: string;
  windowEndAt: string;
  outcomeCollectedAt: string;
  referencePriceUsd: number;
  outcomePriceUsd: number;
  actualHorizonSeconds: number;
  outcomeDelaySeconds: number;
  grossForwardReturnPct: number;
};

export type UnavailableBacktestOutcome = {
  status: 'unavailable';
  targetAt: string;
  windowEndAt: string;
  referencePriceUsd: number;
  reason: BacktestOutcomeReason;
};

export type BacktestOutcome = ResolvedBacktestOutcome | UnavailableBacktestOutcome;

export type BacktestEvent = {
  chain: 'solana';
  tokenMint: string;
  pairAddress: string;
  asOf: string;
  featureSourceIdentity: string;
  strategySourceIdentity: string;
  strategyDecision: StrategyDecision;
  passedRuleCount: number;
  failedRuleCount: number;
  unavailableRuleCount: number;
  outcome: BacktestOutcome | null;
};

export type BacktestSummary = {
  evaluationCount: number;
  entryCandidateCount: number;
  noEntryCount: number;
  insufficientDataCount: number;
  resolvedEntryCandidateCount: number;
  unresolvedEntryCandidateCount: number;
  positiveForwardOutcomeCount: number;
  nonPositiveForwardOutcomeCount: number;
  averageGrossForwardReturnPct: number | null;
};

export type BacktestResult = {
  backtestSpecVersion: string;
  backtestSpecName: string;
  backtestDefinitionFingerprint: string;
  strategyVersion: string;
  strategyDefinitionFingerprint: string;
  featureSetVersion: string;
  scope: BacktestScope;
  marketSnapshotCount: number;
  riskReportCount: number;
  events: BacktestEvent[];
  summary: BacktestSummary;
};

export type StoredStrategyDefinitionSnapshot = {
  strategyVersion: string;
  strategyName: string;
  featureSetVersion: string;
  definitionFingerprint: string;
};
