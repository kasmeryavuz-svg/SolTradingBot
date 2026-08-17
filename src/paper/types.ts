import type { StrategyDecision } from '../strategy/types.js';

export class PaperError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PaperError';
  }
}

export const PAPER_ACTIONS = ['entry_observation', 'no_action'] as const;
export const PAPER_NO_ACTION_REASONS = ['strategy_no_entry', 'strategy_insufficient_data'] as const;
export const PAPER_EXECUTION_MODELS = ['exact_strategy_market_snapshot_reference_price'] as const;
export const PAPER_NONE_MODELS = ['none'] as const;

export type PaperAction = (typeof PAPER_ACTIONS)[number];
export type PaperNoActionReason = (typeof PAPER_NO_ACTION_REASONS)[number];
export type PaperExecutionModel = (typeof PAPER_EXECUTION_MODELS)[number];
export type PaperNoneModel = (typeof PAPER_NONE_MODELS)[number];

export type PaperEvaluation = {
  chain: 'solana';
  tokenMint: string;
  paperSpecVersion: string;
  paperSpecName: string;
  paperDefinitionFingerprint: string;
  featureSetVersion: string;
  strategyVersion: string;
  strategyDefinitionFingerprint: string;
  featureSourceIdentity: string;
  strategySourceIdentity: string;
  asOf: string;
  evaluatedAt: string;
  marketCollectedAt: string;
  pairAddress: string;
  strategyDecision: StrategyDecision;
  paperAction: PaperAction;
  noActionReason: PaperNoActionReason | null;
  referencePriceUsd: number | null;
  simulatedEntryPriceUsd: number | null;
  executionModel: PaperExecutionModel;
  costModel: PaperNoneModel;
  quantityModel: PaperNoneModel;
  positionModel: PaperNoneModel;
  exitModel: PaperNoneModel;
};
