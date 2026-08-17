import { formatUsd } from '../market-data/format.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type { RecordedPaperBundle, TokenPaperHistory } from '../persistence/types.js';
import { PAPER_SPEC_NAME, PAPER_SPEC_VERSION } from './constants.js';
import type { PaperEvaluation } from './types.js';

export function formatPaperStepLines(
  evaluation: PaperEvaluation,
  recorded: RecordedPaperBundle,
): string[] {
  return [
    ...formatPaperEvaluationLines(evaluation),
    '',
    `Persisted paper evaluation id: ${String(recorded.paperEvaluationId)}`,
    `Persisted strategy evaluation id: ${String(recorded.strategyEvaluationId)}`,
    `Persisted feature vector id: ${String(recorded.vectorId)}`,
    recorded.inserted
      ? 'New paper evaluation stored for this source identity.'
      : 'Exact paper source identity already stored; existing evaluation reused.',
    recorded.strategyInserted
      ? 'New strategy evaluation stored for this source identity.'
      : 'Exact strategy source identity already stored; existing evaluation reused.',
    recorded.paperDefinitionInserted
      ? 'p09_v1 paper definition was recorded.'
      : 'Existing p09_v1 paper definition was reused.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatPaperHistoryLines(tokenMint: string, history: TokenPaperHistory | null): string[] {
  if (history === null) {
    return [
      'Token paper history',
      `Mint: ${tokenMint}`,
      '',
      'No paper history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token paper history',
    `Mint: ${history.token.mint}`,
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
  ];

  if (history.evaluations.length === 0) {
    lines.push('No stored paper evaluations for this mint.');
  }

  for (const item of history.evaluations) {
    lines.push(`Paper spec: ${item.paperSpecVersion}`);
    lines.push(`Strategy: ${item.strategyVersion}`);
    lines.push(`As of: ${item.asOf}`);
    lines.push(`Strategy classification: ${item.strategyDecision.toUpperCase()}`);
    lines.push(`Paper action: ${item.paperAction.toUpperCase()}`);
    if (item.noActionReason !== null) {
      lines.push(`Reason: ${item.noActionReason}`);
    }
    if (item.referencePriceUsd !== null) {
      lines.push(`Reference price: ${formatUsd(item.referencePriceUsd)}`);
    }
    lines.push(`Source identity: ${item.sourceIdentity}`);
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

export function formatPaperEvaluationLines(evaluation: PaperEvaluation): string[] {
  if (evaluation.paperAction === 'no_action') {
    return [
      'Checkpoint 09 — Paper Trading',
      `Paper spec: ${PAPER_SPEC_VERSION}`,
      `Strategy: ${evaluation.strategyVersion}`,
      `Feature set: ${evaluation.featureSetVersion}`,
      `Mint: ${evaluation.tokenMint}`,
      `Pair: ${evaluation.pairAddress}`,
      `As of: ${evaluation.asOf}`,
      'Strategy classification:',
      evaluation.strategyDecision.toUpperCase(),
      'Paper action:',
      'NO_ACTION',
      'Reason:',
      evaluation.noActionReason ?? 'unknown',
      'No order was created.',
      'No position exists.',
      'No blockchain transaction exists.',
    ];
  }

  return [
    'Checkpoint 09 — Paper Trading',
    `Paper spec: ${PAPER_SPEC_VERSION}`,
    `Strategy: ${evaluation.strategyVersion}`,
    'Strategy classification:',
    'ENTRY_CANDIDATE',
    'Paper action:',
    'ENTRY_OBSERVATION',
    `Pair: ${evaluation.pairAddress}`,
    `Market observed at: ${evaluation.marketCollectedAt}`,
    `Reference price: ${formatUsd(evaluation.referencePriceUsd)}`,
    `Simulated entry reference price: ${formatUsd(evaluation.simulatedEntryPriceUsd)}`,
    'Execution model:',
    evaluation.executionModel,
    'Costs modeled:',
    'NONE',
    'Quantity:',
    'NOT MODELED',
    'Important:',
    'This is a paper observation, not an executable blockchain quote or trade.',
    'No wallet, order, position or transaction was created.',
    `Paper spec name: ${PAPER_SPEC_NAME}`,
  ];
}
