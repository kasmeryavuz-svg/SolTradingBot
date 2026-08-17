import { formatCapabilityFooter } from '../persistence/format.js';
import type { RecordedFeatureBundle, TokenFeatureHistory } from '../persistence/types.js';
import { FEATURE_DEFINITIONS } from './definitions.js';
import type { FeatureName } from './definitions.js';
import {
  CONCENTRATION_UNAVAILABLE_REASON,
  RISK_REPORT_UNAVAILABLE_REASON,
} from './risk-features.js';
import type { FeatureValue, FeatureVector } from './types.js';

export function formatFeatureCheckLines(
  vector: FeatureVector,
  options: { riskUnavailableDetail?: string | null } = {},
): string[] {
  return formatFeatureVectorLines(vector, {
    explainMissingPrevious: true,
    riskUnavailableDetail: options.riskUnavailableDetail ?? null,
  });
}

function formatFeatureVectorLines(
  vector: FeatureVector,
  options: { explainMissingPrevious: boolean; riskUnavailableDetail?: string | null },
): string[] {
  return [
    'Feature Engine — FACTUAL INPUT FEATURES',
    `Mint: ${vector.tokenMint}`,
    `Feature set: ${vector.featureSetVersion}`,
    `As of: ${vector.asOf}`,
    `Generated at: ${vector.generatedAt}`,
    `Market collected: ${vector.marketCollectedAt}`,
    `Market pair: ${vector.marketPairAddress}`,
    `Previous market collected: ${vector.previousMarketCollectedAt ?? 'n/a'}`,
    `Risk scanned: ${vector.riskScannedAt ?? 'n/a'}`,
    ...(vector.riskScannedAt === null && options.riskUnavailableDetail
      ? [`Risk source detail: ${options.riskUnavailableDetail}`]
      : []),
    `Completeness: ${vector.featureCompleteness.toUpperCase()}`,
    `Available features: ${String(vector.availableFeatureCount)}`,
    `Unavailable features: ${String(vector.unavailableFeatureCount)}`,
    '',
    'Market',
    formatNamed(vector, 'market_price_usd', 'Price USD'),
    formatNamed(vector, 'market_liquidity_usd', 'Liquidity USD'),
    formatNamed(vector, 'market_volume_5m_usd', 'Volume 5m'),
    formatNamed(vector, 'market_volume_1h_usd', 'Volume 1h'),
    formatNamed(vector, 'market_volume_24h_usd', 'Volume 24h'),
    formatNamed(vector, 'market_price_change_5m_pct', 'Price change 5m'),
    formatNamed(vector, 'market_cap_usd', 'Market cap'),
    formatNamed(vector, 'market_fdv_usd', 'FDV'),
    formatNamed(vector, 'pair_age_seconds', 'Pair age seconds'),
    formatNamed(vector, 'market_age_seconds', 'Market age seconds'),
    '',
    'Flow',
    formatNamed(vector, 'trades_5m', 'Trades 5m'),
    formatNamed(vector, 'trades_1h', 'Trades 1h'),
    formatNamed(vector, 'net_buys_5m', 'Net buys 5m'),
    formatNamed(vector, 'net_buys_1h', 'Net buys 1h'),
    formatNamed(vector, 'buy_share_5m_bps', 'Buy share 5m'),
    formatNamed(vector, 'buy_share_1h_bps', 'Buy share 1h'),
    formatNamed(vector, 'volume_to_liquidity_5m_ratio', 'Volume/liquidity 5m'),
    formatNamed(vector, 'liquidity_to_market_cap_ratio', 'Liquidity/market cap'),
    '',
    'Historical observation',
    `Previous snapshot: ${vector.previousMarketCollectedAt ?? 'n/a'}`,
    formatNamed(vector, 'seconds_since_previous_snapshot', 'Seconds since previous'),
    formatNamed(vector, 'observed_price_change_from_previous_pct', 'Observed price change'),
    formatNamed(vector, 'observed_liquidity_change_from_previous_pct', 'Observed liquidity change'),
    ...(options.explainMissingPrevious && vector.previousMarketCollectedAt === null
      ? ['feature:check does not query database history, so previous-snapshot features stay unavailable here.']
      : []),
    '',
    'Risk-derived features',
    formatNamed(vector, 'risk_data_complete', 'Risk data complete'),
    formatNamed(vector, 'risk_token_2022', 'Token-2022'),
    formatNamed(vector, 'risk_finding_mint_authority_active', 'Mint-authority finding present'),
    formatNamed(vector, 'risk_finding_freeze_authority_active', 'Freeze-authority finding present'),
    formatNamed(vector, 'risk_top1_token_account_concentration_bps', 'Top-1 token-account concentration'),
    formatNamed(vector, 'risk_finding_count', 'Finding count'),
    formatNamed(vector, 'risk_critical_finding_count', 'Critical findings'),
    formatNamed(vector, 'risk_high_finding_count', 'High findings'),
    formatNamed(vector, 'risk_age_seconds', 'Risk age seconds'),
    '',
    'Features are factual/derived inputs.',
    'They are not BUY/SELL signals or investment recommendations.',
    'JavaScript finite numbers are used for derived ratios and percentages; they are not exact financial decimals.',
    '',
    ...formatCapabilityFooter(),
  ];
}

export function formatFeatureRecordLines(
  vector: FeatureVector,
  recorded: RecordedFeatureBundle,
): string[] {
  return [
    ...formatFeatureVectorLines(vector, { explainMissingPrevious: false }),
    '',
    `Persisted feature vector id: ${String(recorded.vectorId)}`,
    recorded.inserted
      ? 'New feature vector stored for this source identity.'
      : 'Exact source identity already stored; existing vector reused.',
    recorded.marketInserted
      ? 'Current market snapshot was inserted.'
      : 'Current market snapshot was already stored or not newly inserted.',
    recorded.riskInserted
      ? 'Current risk report was inserted.'
      : 'No new risk report was inserted.',
  ];
}

export function formatFeatureHistoryLines(tokenMint: string, history: TokenFeatureHistory | null): string[] {
  if (history === null) {
    return [
      'Token feature history',
      `Mint: ${tokenMint}`,
      '',
      'No feature history found for this mint.',
      '',
      ...formatCapabilityFooter(),
    ];
  }

  const lines = [
    'Token feature history',
    `Mint: ${history.token.mint}`,
    `First observed by bot: ${history.token.firstObservedAt}`,
    `Last observed by bot: ${history.token.lastObservedAt}`,
    'These are database observation times, not token creation or launch time.',
    '',
  ];

  if (history.vectors.length === 0) {
    lines.push('No stored feature vectors for this mint.');
  }

  for (const vector of history.vectors) {
    lines.push(`Feature set version: ${vector.featureSetVersion}`);
    lines.push(`As of: ${vector.asOf}`);
    lines.push(`Market collected at: ${vector.marketCollectedAt}`);
    lines.push(`Previous market collected at: ${vector.previousMarketCollectedAt ?? 'n/a'}`);
    lines.push(`Risk scanned at: ${vector.riskScannedAt ?? 'n/a'}`);
    lines.push(`Completeness: ${vector.featureCompleteness.toUpperCase()}`);
    lines.push(
      `Available / unavailable: ${String(vector.availableFeatureCount)} / ${String(vector.unavailableFeatureCount)}`,
    );
    lines.push(formatNamedValue('Price USD', requireValue(vector.values, 'market_price_usd')));
    lines.push(formatNamedValue('Trades 5m', requireValue(vector.values, 'trades_5m')));
    lines.push(
      formatNamedValue(
        'Seconds since previous',
        requireValue(vector.values, 'seconds_since_previous_snapshot'),
      ),
    );
    lines.push(
      formatNamedValue(
        'Mint-authority finding present',
        requireValue(vector.values, 'risk_finding_mint_authority_active'),
      ),
    );
    lines.push('');
  }

  lines.push(...formatCapabilityFooter());
  return lines;
}

function formatNamed(vector: FeatureVector, name: FeatureName, label: string): string {
  return formatNamedValue(label, requireValue(vector.values, name));
}

function requireValue(values: readonly FeatureValue[], name: FeatureName): FeatureValue {
  const value = values.find((item) => item.name === name);
  if (value === undefined) {
    const definition = FEATURE_DEFINITIONS.find((item) => item.name === name);
    return {
      name,
      kind: definition?.kind ?? 'number',
      status: 'unavailable',
      value: null,
      unavailableReason: 'missing from vector',
    };
  }

  return value;
}

function formatNamedValue(label: string, value: FeatureValue): string {
  if (value.status === 'unavailable') {
    return `${label}: n/a (${formatUnavailableReason(value.unavailableReason)})`;
  }

  if (typeof value.value === 'boolean') {
    return `${label}: ${value.value ? 'true' : 'false'}`;
  }

  if (typeof value.value !== 'number' || !Number.isFinite(value.value)) {
    return `${label}: n/a (non-finite)`;
  }

  return `${label}: ${formatFinite(value.value)}`;
}

function formatFinite(value: number): string {
  return String(value);
}

function formatUnavailableReason(reason: string | null): string {
  if (reason === RISK_REPORT_UNAVAILABLE_REASON) {
    return 'risk report unavailable';
  }
  if (reason === CONCENTRATION_UNAVAILABLE_REASON) {
    return 'token-account concentration is unavailable';
  }
  return reason ?? 'unavailable';
}
