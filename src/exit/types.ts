export class ExitError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ExitError';
  }
}

export const EXIT_ACTIONS = ['close_position', 'no_change'] as const;
export const EXIT_REASONS = [
  'stop_loss_threshold',
  'take_profit_threshold',
  'max_holding_time',
  'market_price_unavailable',
  'exit_conditions_not_met',
] as const;

export type ExitAction = (typeof EXIT_ACTIONS)[number];
export type ExitReason = (typeof EXIT_REASONS)[number];

export type ExitEvaluation = {
  chain: 'solana';
  tokenMint: string;
  exitSpecVersion: string;
  exitSpecName: string;
  exitDefinitionFingerprint: string;
  positionSpecVersion: string;
  positionDefinitionFingerprint: string;
  positionSourceIdentity: string;
  pairAddress: string;
  asOf: string;
  evaluatedAt: string;
  marketCollectedAt: string;
  observedPriceUsd: number | null;
  entryPriceUsd: number;
  stopTriggerPriceUsd: number;
  takeProfitTriggerPriceUsd: number;
  holdingAgeMs: number;
  maxHoldingMs: number;
  exitAction: ExitAction;
  exitReason: ExitReason;
  simulatedExitPriceUsd: number | null;
  closedQuantityTokens: number | null;
  sourceIdentity: string;
};
