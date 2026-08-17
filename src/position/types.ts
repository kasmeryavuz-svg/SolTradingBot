import type { PaperAction, PaperNoActionReason } from '../paper/types.js';

export class PositionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PositionError';
  }
}

export const POSITION_ACTIONS = ['open_position', 'no_change'] as const;
export const POSITION_NO_CHANGE_REASONS = [
  'paper_strategy_no_entry',
  'paper_strategy_insufficient_data',
  'position_already_open',
] as const;

export type PositionAction = (typeof POSITION_ACTIONS)[number];
export type PositionNoChangeReason = (typeof POSITION_NO_CHANGE_REASONS)[number];

export type OpenPaperPosition = {
  chain: 'solana';
  tokenMint: string;
  pairAddress: string;
  positionSpecVersion: string;
  positionDefinitionFingerprint: string;
  openedAt: string;
  entryMarketCollectedAt: string;
  entryPriceUsd: number;
  entryNotionalUsd: number;
  quantityTokens: number;
  openingPaperSourceIdentity: string;
  positionSourceIdentity: string;
};

export type PositionEvaluation = {
  chain: 'solana';
  tokenMint: string;
  positionSpecVersion: string;
  positionSpecName: string;
  positionDefinitionFingerprint: string;
  paperSpecVersion: string;
  paperDefinitionFingerprint: string;
  paperSourceIdentity: string;
  asOf: string;
  evaluatedAt: string;
  paperAction: PaperAction;
  paperNoActionReason: PaperNoActionReason | null;
  priorOpenPositionSourceIdentity: string | null;
  positionAction: PositionAction;
  positionReason: PositionNoChangeReason | null;
  entryPriceUsd: number | null;
  entryNotionalUsd: number | null;
  quantityTokens: number | null;
  positionSourceIdentity: string | null;
  sourceIdentity: string;
};
