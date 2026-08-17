import { formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type { RecordedExitBundle, StoredOpenPaperPosition, TokenExitHistory } from '../persistence/types.js';
import { formatPaperQuantity } from '../position/format.js';
import { EXIT_SPEC_VERSION } from './constants.js';
import { ExitError, type ExitEvaluation } from './types.js';

export function formatExitStepLines(result: {
  kind: 'no_open_position' | 'evaluated';
  tokenMint: string;
  exitEvaluation?: ExitEvaluation;
  recorded?: RecordedExitBundle;
  currentOpenPosition?: StoredOpenPaperPosition | null;
}): string[] {
  if (result.kind === 'no_open_position' || result.exitEvaluation === undefined) {
    return [
      `No open paper position for mint ${result.tokenMint}`,
      '',
      'No exact-pair market request was made.',
      'No exit evaluation was stored.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const evaluation = result.exitEvaluation;
  const recorded = result.recorded;
  return [
    ...formatExitEvaluationLines(evaluation, result.currentOpenPosition ?? null),
    '',
    recorded === undefined ? 'Persisted exit evaluation id: n/a' : `Persisted exit evaluation id: ${String(recorded.exitEvaluationId)}`,
    recorded === undefined
      ? 'Persisted market snapshot id: n/a'
      : `Persisted market snapshot id: ${String(recorded.marketSnapshotId)}`,
    recorded?.inserted
      ? 'New exit evaluation stored for this position and market source.'
      : 'Exact exit source identity already stored; existing evaluation reused.',
    recorded?.openPositionRemoved
      ? 'Current-open index row was removed after the simulated close.'
      : 'Current-open index was left unchanged.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatExitHistoryLines(tokenMint: string, history: TokenExitHistory | null): string[] {
  if (history === null) {
    return [
      'Token exit history',
      `Mint: ${tokenMint}`,
      '',
      'No exit history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token exit history',
    `Mint: ${history.token.mint}`,
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
  ];

  if (history.evaluations.length === 0) {
    lines.push('No stored exit evaluations for this mint.');
  }

  for (const item of history.evaluations) {
    lines.push(`Exit spec: ${item.exitSpecVersion}`);
    lines.push(`Exit name: ${item.exitSpecName}`);
    lines.push(`Position id: ${String(item.positionId)}`);
    lines.push(`Pair: ${item.pairAddress}`);
    lines.push(`As of: ${item.asOf}`);
    lines.push(`Observed price: ${formatUsd(item.observedPriceUsd)}`);
    lines.push(`Entry price: ${formatUsd(item.entryPriceUsd)}`);
    lines.push(`Stop trigger: ${formatUsd(item.stopTriggerPriceUsd)}`);
    lines.push(`Take-profit trigger: ${formatUsd(item.takeProfitTriggerPriceUsd)}`);
    lines.push(`Holding age ms: ${String(item.holdingAgeMs)}`);
    lines.push(`Exit action: ${item.exitAction.toUpperCase()}`);
    lines.push(`Reason: ${item.exitReason}`);
    if (item.simulatedExitPriceUsd !== null) {
      lines.push(`Simulated exit price: ${formatUsd(item.simulatedExitPriceUsd)}`);
    }
    if (item.closedQuantityTokens !== null) {
      lines.push(`Closed quantity: ${formatPaperQuantity(item.closedQuantityTokens)}`);
    }
    lines.push(`Source identity: ${item.sourceIdentity}`);
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatExitEvaluationLines(
  evaluation: ExitEvaluation,
  currentOpenPosition: StoredOpenPaperPosition | null,
): string[] {
  const header = [
    'Checkpoint 11 — Paper Exit Engine',
    `Exit spec: ${EXIT_SPEC_VERSION}`,
    `Position spec: ${evaluation.positionSpecVersion}`,
    `Mint: ${evaluation.tokenMint}`,
    `Pair: ${evaluation.pairAddress}`,
    `As of: ${evaluation.asOf}`,
    `Observed price: ${formatUsd(evaluation.observedPriceUsd)}`,
    `Entry price: ${formatUsd(evaluation.entryPriceUsd)}`,
    `Stop trigger: ${formatUsd(evaluation.stopTriggerPriceUsd)}`,
    `Take-profit trigger: ${formatUsd(evaluation.takeProfitTriggerPriceUsd)}`,
    `Holding age: ${String(evaluation.holdingAgeMs)} ms`,
  ];

  if (evaluation.exitAction === 'close_position') {
    return [
      ...header,
      'Exit action:',
      'CLOSE_POSITION',
      `Reason: ${evaluation.exitReason}`,
      `Simulated exit price: ${formatUsd(evaluation.simulatedExitPriceUsd)}`,
      `Closed paper quantity: ${formatPaperQuantity(requireClosedQuantity(evaluation.closedQuantityTokens))}`,
      currentOpenPosition === null
        ? 'Current open position: NONE'
        : 'Current open position: still present (unexpected)',
      'Important:',
      'This is a simulated paper close, not a DEX fill or blockchain sell.',
      'x11_v1 is an experimental baseline. It is not optimized, profitable, or financial advice.',
      'No fees, slippage, or PnL are calculated in Checkpoint 11.',
    ];
  }

  return [
    ...header,
    'Exit action:',
    'NO_CHANGE',
    `Reason: ${evaluation.exitReason}`,
    currentOpenPosition === null ? 'Current open position: NONE' : 'Current open position: still open',
    'No paper position was closed.',
    'No blockchain transaction exists.',
    'x11_v1 is an experimental baseline. It is not optimized, profitable, or financial advice.',
  ];
}

function requireClosedQuantity(quantity: number | null): number {
  if (quantity === null) {
    throw new ExitError('CLOSE_POSITION output requires a closed paper quantity.');
  }
  return quantity;
}
