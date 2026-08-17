import { formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type {
  RecordedPositionBundle,
  StoredOpenPaperPosition,
  TokenPositionHistory,
} from '../persistence/types.js';
import { PAPER_SPEC_VERSION } from '../paper/constants.js';
import { POSITION_ENTRY_NOTIONAL_USD, POSITION_SPEC_VERSION } from './constants.js';
import type { OpenPaperPosition, PositionEvaluation } from './types.js';

export function formatPositionStepLines(
  evaluation: PositionEvaluation,
  recorded: RecordedPositionBundle,
  currentOpenPosition: StoredOpenPaperPosition | null,
): string[] {
  return [
    ...formatPositionEvaluationLines(evaluation, currentOpenPosition),
    '',
    `Persisted position evaluation id: ${String(recorded.positionEvaluationId)}`,
    `Persisted paper evaluation id: ${String(recorded.paperEvaluationId)}`,
    `Persisted strategy evaluation id: ${String(recorded.strategyEvaluationId)}`,
    `Persisted feature vector id: ${String(recorded.vectorId)}`,
    recorded.inserted
      ? 'New position evaluation stored for this paper evaluation.'
      : 'Exact paper evaluation already position-processed; existing evaluation reused.',
    recorded.openPositionCreated
      ? 'A simulated paper position was opened.'
      : 'No paper position row was created.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatPositionStatusLines(
  tokenMint: string,
  position: StoredOpenPaperPosition | null,
): string[] {
  if (position === null) {
    return [
      `No open paper position for mint ${tokenMint}`,
      '',
      ...formatCapabilityFooter(),
    ];
  }

  return [
    'Open paper position',
    `Mint: ${position.tokenMint}`,
    `Pair: ${position.pairAddress}`,
    `Opened at: ${position.openedAt}`,
    `Entry market observed at: ${position.entryMarketCollectedAt}`,
    `Entry reference price: ${formatUsd(position.entryPriceUsd)}`,
    `Reference notional: ${formatUsd(position.entryNotionalUsd)}`,
    `Paper quantity: ${formatPaperQuantity(position.quantityTokens)}`,
    `Position source: ${position.positionSourceIdentity}`,
    `Opening paper source: ${position.openingPaperSourceIdentity}`,
    '',
    'Important:',
    'No current price or PnL is calculated in Checkpoint 10.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatPositionHistoryLines(
  tokenMint: string,
  history: TokenPositionHistory | null,
): string[] {
  if (history === null) {
    return [
      'Token position history',
      `Mint: ${tokenMint}`,
      '',
      'No position history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token position history',
    `Mint: ${history.token.mint}`,
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
  ];

  if (history.evaluations.length === 0) {
    lines.push('No stored position evaluations for this mint.');
  }

  for (const item of history.evaluations) {
    lines.push(`Position spec: ${item.positionSpecVersion}`);
    lines.push(`Paper spec: ${item.paperSpecVersion}`);
    lines.push(`As of: ${item.asOf}`);
    lines.push(`Paper action: ${item.paperAction.toUpperCase()}`);
    lines.push(`Position action: ${item.positionAction.toUpperCase()}`);
    if (item.positionReason !== null) {
      lines.push(`Reason: ${item.positionReason}`);
    }
    lines.push(`Source identity: ${item.sourceIdentity}`);
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatPositionEvaluationLines(
  evaluation: PositionEvaluation,
  currentOpenPosition: OpenPaperPosition | null,
): string[] {
  const header = [
    'Checkpoint 10 — Position Management',
    `Position spec: ${POSITION_SPEC_VERSION}`,
    `Paper spec: ${PAPER_SPEC_VERSION}`,
    `Strategy: ${evaluation.paperSpecVersion === PAPER_SPEC_VERSION ? 's07_v1' : evaluation.paperSpecVersion}`,
    `Mint: ${evaluation.tokenMint}`,
    `As of: ${evaluation.asOf}`,
  ];

  if (evaluation.positionAction === 'open_position') {
    return [
      ...header,
      'Paper:',
      'ENTRY_OBSERVATION',
      'Position action:',
      'OPEN_POSITION',
      `Mint: ${evaluation.tokenMint}`,
      `Pair: ${currentOpenPosition?.pairAddress ?? 'n/a'}`,
      'Entry reference price:',
      formatUsd(evaluation.entryPriceUsd),
      'Paper reference notional:',
      formatUsd(evaluation.entryNotionalUsd ?? POSITION_ENTRY_NOTIONAL_USD),
      'Paper quantity:',
      formatPaperQuantity(evaluation.quantityTokens ?? 0),
      'Opened at:',
      evaluation.evaluatedAt,
      'Important:',
      'This is a simulated paper position.',
      '$100 is a fixed modeling reference, not real funds or a recommendation.',
      'No order or blockchain transaction was created.',
    ];
  }

  if (evaluation.positionReason === 'position_already_open') {
    return [
      ...header,
      'Paper:',
      'ENTRY_OBSERVATION',
      'Position action:',
      'NO_CHANGE',
      'Reason:',
      'position_already_open',
      'Existing open position:',
      formatExistingOpenPosition(currentOpenPosition),
      'No additional quantity was added.',
      'No averaging occurred.',
      'No second position was opened.',
    ];
  }

  const strategyLabel =
    evaluation.positionReason === 'paper_strategy_insufficient_data' ? 'INSUFFICIENT_DATA' : 'NO_ENTRY';
  const paperReason =
    evaluation.paperNoActionReason === 'strategy_insufficient_data'
      ? 'strategy_insufficient_data'
      : 'strategy_no_entry';

  return [
    ...header,
    'Strategy:',
    strategyLabel,
    'Paper:',
    'NO_ACTION',
    `Reason: ${paperReason}`,
    'Position action:',
    'NO_CHANGE',
    'Reason:',
    evaluation.positionReason ?? 'unknown',
    'Current open position:',
    currentOpenPosition === null ? 'NONE' : formatExistingOpenPosition(currentOpenPosition),
    'No position was opened.',
    'No blockchain transaction exists.',
  ];
}

function formatExistingOpenPosition(position: OpenPaperPosition | null): string {
  if (position === null) {
    return 'NONE';
  }
  return [
    position.tokenMint,
    position.pairAddress,
    position.openedAt,
    formatUsd(position.entryPriceUsd),
    formatPaperQuantity(position.quantityTokens),
  ].join(' / ');
}

export function formatPaperQuantity(quantity: number): string {
  return `${String(quantity)} tokens`;
}
