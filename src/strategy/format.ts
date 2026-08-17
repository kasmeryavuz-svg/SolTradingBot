import type { FeatureName } from '../features/definitions.js';
import type { FeatureValue, FeatureVector } from '../features/types.js';
import { formatCapabilityFooter } from '../persistence/format.js';
import type { RecordedStrategyBundle, TokenStrategyHistory } from '../persistence/types.js';
import { STRATEGY_NAME, STRATEGY_VERSION } from './constants.js';
import type { StrategyEvaluation, StrategyRuleResult } from './types.js';

const CONTEXT_FEATURES: readonly { name: FeatureName; label: string }[] = [
  { name: 'market_price_change_1h_pct', label: 'Price change 1h' },
  { name: 'risk_data_complete', label: 'Risk data complete' },
  { name: 'risk_token_2022', label: 'Token-2022' },
  { name: 'risk_top1_token_account_concentration_bps', label: 'Top-1 token-account concentration' },
  { name: 'observed_price_change_from_previous_pct', label: 'Observed price change from previous' },
];

export function formatStrategyCheckLines(
  vector: FeatureVector,
  evaluation: StrategyEvaluation,
  options: { riskUnavailableDetail?: string | null } = {},
): string[] {
  return [
    ...formatStrategyEvaluationLines(vector, evaluation, {
      riskUnavailableDetail: options.riskUnavailableDetail ?? null,
    }),
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatStrategyRecordLines(
  vector: FeatureVector,
  evaluation: StrategyEvaluation,
  recorded: RecordedStrategyBundle,
): string[] {
  return [
    ...formatStrategyEvaluationLines(vector, evaluation, { riskUnavailableDetail: null }),
    '',
    `Persisted strategy evaluation id: ${String(recorded.evaluationId)}`,
    `Persisted feature vector id: ${String(recorded.vectorId)}`,
    recorded.inserted
      ? 'New strategy evaluation stored for this source identity.'
      : 'Exact strategy source identity already stored; existing evaluation reused.',
    recorded.featureInserted
      ? 'New feature vector stored for this source identity.'
      : 'Exact feature source identity already stored; existing vector reused.',
    recorded.definitionInserted
      ? 's07_v1 strategy definition was recorded.'
      : 'Existing s07_v1 strategy definition was reused.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatStrategyHistoryLines(
  tokenMint: string,
  history: TokenStrategyHistory | null,
): string[] {
  if (history === null) {
    return [
      'Token strategy history',
      `Mint: ${tokenMint}`,
      '',
      'No strategy history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token strategy history',
    `Mint: ${history.token.mint}`,
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
  ];

  if (history.evaluations.length === 0) {
    lines.push('No stored strategy evaluations for this mint.');
  }

  for (const evaluation of history.evaluations) {
    lines.push(`Strategy version: ${evaluation.strategyVersion}`);
    lines.push(`As of: ${evaluation.asOf}`);
    lines.push(`Feature source: ${evaluation.featureSourceIdentity}`);
    lines.push(`Decision: ${evaluation.decision.toUpperCase()}`);
    lines.push(`Passed rules: ${String(evaluation.passedRuleCount)}`);
    lines.push(`Failed rules: ${String(evaluation.failedRuleCount)}`);
    lines.push(`Unavailable rules: ${String(evaluation.unavailableRuleCount)}`);
    for (const rule of evaluation.rules) {
      lines.push(`${statusLabel(rule.status)}  ${rule.ruleCode}`);
    }
    lines.push('');
  }

  lines.push('History shows stored classifications only. It does not calculate later returns.');
  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatStrategyEvaluationLines(
  vector: FeatureVector,
  evaluation: StrategyEvaluation,
  options: { riskUnavailableDetail: string | null },
): string[] {
  const lines = [
    `First Strategy — ${STRATEGY_VERSION}`,
    `Name: ${STRATEGY_NAME}`,
    '',
    `Mint: ${evaluation.tokenMint}`,
    `Feature set: ${evaluation.featureSetVersion}`,
    `As of: ${evaluation.asOf}`,
    `Evaluated at: ${evaluation.evaluatedAt}`,
    `Feature completeness: ${vector.featureCompleteness.toUpperCase()}`,
    `Available features: ${String(vector.availableFeatureCount)}`,
    `Unavailable features: ${String(vector.unavailableFeatureCount)}`,
    `Feature source identity: ${evaluation.featureSourceIdentity}`,
    `Strategy definition fingerprint: ${evaluation.strategyDefinitionFingerprint}`,
    ...(options.riskUnavailableDetail !== null
      ? [`Risk source detail: ${options.riskUnavailableDetail}`]
      : []),
    '',
    'Rules',
    '',
  ];

  for (const rule of evaluation.rules) {
    lines.push(...formatRuleLines(rule));
    lines.push('');
  }

  lines.push('Classification:');
  lines.push('');
  lines.push(evaluation.decision.toUpperCase());
  lines.push('');
  lines.push(...formatDecisionExplanation(evaluation));
  lines.push('');
  lines.push('Context — NOT s07_v1 decision rules');
  for (const item of CONTEXT_FEATURES) {
    lines.push(formatContextFeature(vector, item.name, item.label));
  }
  lines.push('');
  lines.push('ENTRY_CANDIDATE is a strategy classification only. No order or trade is created.');
  lines.push('NO_ENTRY is not a sell instruction.');
  lines.push('No order, wallet or transaction exists in Checkpoint 07.');

  return lines;
}

function formatRuleLines(rule: StrategyRuleResult): string[] {
  return [
    `${statusLabel(rule.status)}  ${rule.ruleCode}`,
    `      observed: ${rule.observed}`,
    `      criterion: ${formatCriterion(rule)}`,
    `      reason: ${rule.reason}`,
  ];
}

function formatCriterion(rule: StrategyRuleResult): string {
  if (rule.ruleCode === 'LIQUIDITY_MINIMUM') {
    return '>= $50,000 pair USD liquidity';
  }
  if (rule.ruleCode === 'BUY_SHARE_5M_MINIMUM') {
    return '>= 55.00% of observed 5m trades';
  }
  return rule.criterion;
}

function formatDecisionExplanation(evaluation: StrategyEvaluation): string[] {
  if (evaluation.decision === 'entry_candidate') {
    return [
      'All required s07_v1 rules passed.',
      'This is an experimental strategy classification only.',
      'It is not evidence of profitability and does not create an order.',
    ];
  }

  if (evaluation.decision === 'no_entry') {
    const failed = evaluation.rules.filter((rule) => rule.status === 'fail').map((rule) => rule.ruleCode);
    return [
      'Reason:',
      'At least one required rule failed.',
      `Failed rules: ${failed.join(', ')}`,
      'Important:',
      'NO_ENTRY is not a sell instruction.',
      'ENTRY_CANDIDATE would not create a trade.',
    ];
  }

  const unavailable = evaluation.rules.filter((rule) => rule.status === 'unavailable');
  return [
    'Reason:',
    'No required rule failed, but one or more required rules were unavailable.',
    'Unavailable rules:',
    ...unavailable.map((rule) => `- ${rule.ruleCode}: ${rule.reason}`),
  ];
}

function formatContextFeature(vector: FeatureVector, name: FeatureName, label: string): string {
  const value = vector.values.find((item) => item.name === name);
  if (value === undefined) {
    return `${label}: n/a`;
  }
  return `${label}: ${formatFeatureObserved(value)}`;
}

function formatFeatureObserved(value: FeatureValue): string {
  if (value.status === 'unavailable') {
    return `n/a (${value.unavailableReason ?? 'unavailable'})`;
  }
  if (typeof value.value === 'boolean') {
    return value.value ? 'true' : 'false';
  }
  if (typeof value.value === 'number' && Number.isFinite(value.value)) {
    return String(value.value);
  }
  return 'n/a';
}

function statusLabel(status: StrategyRuleResult['status']): string {
  if (status === 'pass') {
    return 'PASS';
  }
  if (status === 'fail') {
    return 'FAIL';
  }
  return 'UNAVAILABLE';
}
