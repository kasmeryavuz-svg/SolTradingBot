import type { FeatureCategory, FeatureValueKind } from './types.js';

export const FEATURE_SET_VERSION = 'c06_v1';

export const FEATURE_NAMES = [
  'market_price_usd',
  'market_liquidity_usd',
  'market_volume_5m_usd',
  'market_volume_1h_usd',
  'market_volume_24h_usd',
  'market_buys_5m',
  'market_sells_5m',
  'market_buys_1h',
  'market_sells_1h',
  'market_price_change_5m_pct',
  'market_price_change_1h_pct',
  'market_price_change_24h_pct',
  'market_cap_usd',
  'market_fdv_usd',
  'pair_age_seconds',
  'market_age_seconds',
  'trades_5m',
  'trades_1h',
  'net_buys_5m',
  'net_buys_1h',
  'buy_share_5m_bps',
  'buy_share_1h_bps',
  'volume_to_liquidity_5m_ratio',
  'volume_to_liquidity_1h_ratio',
  'volume_to_liquidity_24h_ratio',
  'liquidity_to_market_cap_ratio',
  'seconds_since_previous_snapshot',
  'observed_price_change_from_previous_pct',
  'observed_liquidity_change_from_previous_pct',
  'risk_data_complete',
  'risk_token_2022',
  'risk_finding_mint_authority_active',
  'risk_finding_freeze_authority_active',
  'risk_finding_permanent_delegate_active',
  'risk_finding_non_transferable',
  'risk_finding_transfer_hook_active',
  'risk_finding_default_account_state_frozen',
  'risk_finding_transfer_fee_configured',
  'risk_top1_token_account_concentration_bps',
  'risk_top5_token_account_concentration_bps',
  'risk_top10_token_account_concentration_bps',
  'risk_top20_token_account_concentration_bps',
  'risk_finding_count',
  'risk_critical_finding_count',
  'risk_high_finding_count',
  'risk_medium_finding_count',
  'risk_info_finding_count',
  'risk_age_seconds',
] as const;

export type FeatureName = (typeof FEATURE_NAMES)[number];

export type FeatureDefinition = {
  name: FeatureName;
  kind: FeatureValueKind;
  category: FeatureCategory;
  description: string;
};

export const FEATURE_DEFINITIONS: readonly FeatureDefinition[] = [
  {
    name: 'market_price_usd',
    kind: 'number',
    category: 'market',
    description: 'USD price of the requested token from the current market snapshot.',
  },
  {
    name: 'market_liquidity_usd',
    kind: 'number',
    category: 'market',
    description: 'Pair-level USD liquidity from the current market snapshot.',
  },
  {
    name: 'market_volume_5m_usd',
    kind: 'number',
    category: 'market',
    description: 'Pair-level USD volume over the provider 5-minute window.',
  },
  {
    name: 'market_volume_1h_usd',
    kind: 'number',
    category: 'market',
    description: 'Pair-level USD volume over the provider 1-hour window.',
  },
  {
    name: 'market_volume_24h_usd',
    kind: 'number',
    category: 'market',
    description: 'Pair-level USD volume over the provider 24-hour window.',
  },
  {
    name: 'market_buys_5m',
    kind: 'integer',
    category: 'market',
    description: 'Pair-level buy count over the provider 5-minute window.',
  },
  {
    name: 'market_sells_5m',
    kind: 'integer',
    category: 'market',
    description: 'Pair-level sell count over the provider 5-minute window.',
  },
  {
    name: 'market_buys_1h',
    kind: 'integer',
    category: 'market',
    description: 'Pair-level buy count over the provider 1-hour window.',
  },
  {
    name: 'market_sells_1h',
    kind: 'integer',
    category: 'market',
    description: 'Pair-level sell count over the provider 1-hour window.',
  },
  {
    name: 'market_price_change_5m_pct',
    kind: 'number',
    category: 'market',
    description: 'Provider 5-minute price-change percentage for the requested token.',
  },
  {
    name: 'market_price_change_1h_pct',
    kind: 'number',
    category: 'market',
    description: 'Provider 1-hour price-change percentage for the requested token.',
  },
  {
    name: 'market_price_change_24h_pct',
    kind: 'number',
    category: 'market',
    description: 'Provider 24-hour price-change percentage for the requested token.',
  },
  {
    name: 'market_cap_usd',
    kind: 'number',
    category: 'market',
    description: 'Reported market cap of the requested token. Never copied from FDV.',
  },
  {
    name: 'market_fdv_usd',
    kind: 'number',
    category: 'market',
    description: 'Reported fully diluted valuation of the requested token. Never used as market cap.',
  },
  {
    name: 'pair_age_seconds',
    kind: 'integer',
    category: 'market',
    description:
      'Whole seconds from DEX pairCreatedAt to market.collectedAt, floored from milliseconds. Not token or mint creation time.',
  },
  {
    name: 'market_age_seconds',
    kind: 'integer',
    category: 'data_quality',
    description:
      'Whole seconds from market.collectedAt to asOf, floored from milliseconds. Source freshness, not token age.',
  },
  {
    name: 'trades_5m',
    kind: 'integer',
    category: 'flow',
    description: 'buys5m + sells5m when both counts are valid non-negative safe integers.',
  },
  {
    name: 'trades_1h',
    kind: 'integer',
    category: 'flow',
    description: 'buys1h + sells1h when both counts are valid non-negative safe integers.',
  },
  {
    name: 'net_buys_5m',
    kind: 'integer',
    category: 'flow',
    description: 'buys5m - sells5m. A negative value is a count difference, not a sell signal.',
  },
  {
    name: 'net_buys_1h',
    kind: 'integer',
    category: 'flow',
    description: 'buys1h - sells1h. A negative value is a count difference, not a sell signal.',
  },
  {
    name: 'buy_share_5m_bps',
    kind: 'integer',
    category: 'flow',
    description: 'Floor of buys5m * 10000 / (buys5m + sells5m). Unavailable when no trades were observed.',
  },
  {
    name: 'buy_share_1h_bps',
    kind: 'integer',
    category: 'flow',
    description: 'Floor of buys1h * 10000 / (buys1h + sells1h). Unavailable when no trades were observed.',
  },
  {
    name: 'volume_to_liquidity_5m_ratio',
    kind: 'number',
    category: 'flow',
    description: 'volume5mUsd / liquidityUsd. May exceed 1.0. Uses JavaScript finite numbers, not exact decimals.',
  },
  {
    name: 'volume_to_liquidity_1h_ratio',
    kind: 'number',
    category: 'flow',
    description: 'volume1hUsd / liquidityUsd. May exceed 1.0. Uses JavaScript finite numbers, not exact decimals.',
  },
  {
    name: 'volume_to_liquidity_24h_ratio',
    kind: 'number',
    category: 'flow',
    description: 'volume24hUsd / liquidityUsd. May exceed 1.0. Uses JavaScript finite numbers, not exact decimals.',
  },
  {
    name: 'liquidity_to_market_cap_ratio',
    kind: 'number',
    category: 'flow',
    description: 'liquidityUsd / marketCapUsd. Does not substitute FDV when market cap is missing.',
  },
  {
    name: 'seconds_since_previous_snapshot',
    kind: 'integer',
    category: 'historical',
    description: 'Seconds between our previous same-pair snapshot and the current snapshot. Not a fixed window.',
  },
  {
    name: 'observed_price_change_from_previous_pct',
    kind: 'number',
    category: 'historical',
    description: 'Percent change between our previous and current same-pair prices. Not a 1m/5m/hourly return.',
  },
  {
    name: 'observed_liquidity_change_from_previous_pct',
    kind: 'number',
    category: 'historical',
    description: 'Percent change between our previous and current same-pair liquidity. Not a trading signal.',
  },
  {
    name: 'risk_data_complete',
    kind: 'boolean',
    category: 'risk',
    description: 'True when a Checkpoint 05 risk report exists and dataCompleteness is complete.',
  },
  {
    name: 'risk_token_2022',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 report tokenProgram is token_2022.',
  },
  {
    name: 'risk_finding_mint_authority_active',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 MINT_AUTHORITY_ACTIVE finding is present.',
  },
  {
    name: 'risk_finding_freeze_authority_active',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 FREEZE_AUTHORITY_ACTIVE finding is present.',
  },
  {
    name: 'risk_finding_permanent_delegate_active',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 PERMANENT_DELEGATE_ACTIVE finding is present.',
  },
  {
    name: 'risk_finding_non_transferable',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 NON_TRANSFERABLE_TOKEN finding is present.',
  },
  {
    name: 'risk_finding_transfer_hook_active',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 TRANSFER_HOOK_ACTIVE finding is present.',
  },
  {
    name: 'risk_finding_default_account_state_frozen',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 DEFAULT_ACCOUNT_STATE_FROZEN finding is present.',
  },
  {
    name: 'risk_finding_transfer_fee_configured',
    kind: 'boolean',
    category: 'risk',
    description: 'True when the Checkpoint 05 TRANSFER_FEE_CONFIGURED finding is present.',
  },
  {
    name: 'risk_top1_token_account_concentration_bps',
    kind: 'integer',
    category: 'risk',
    description: 'Checkpoint 05 top-1 token-account concentration in basis points. Not beneficial-owner share.',
  },
  {
    name: 'risk_top5_token_account_concentration_bps',
    kind: 'integer',
    category: 'risk',
    description: 'Checkpoint 05 top-5 token-account concentration in basis points. Not beneficial-owner share.',
  },
  {
    name: 'risk_top10_token_account_concentration_bps',
    kind: 'integer',
    category: 'risk',
    description: 'Checkpoint 05 top-10 token-account concentration in basis points. Not beneficial-owner share.',
  },
  {
    name: 'risk_top20_token_account_concentration_bps',
    kind: 'integer',
    category: 'risk',
    description: 'Checkpoint 05 top-20 token-account concentration in basis points. Not beneficial-owner share.',
  },
  {
    name: 'risk_finding_count',
    kind: 'integer',
    category: 'risk',
    description: 'Count of Checkpoint 05 findings. Not a risk score.',
  },
  {
    name: 'risk_critical_finding_count',
    kind: 'integer',
    category: 'risk',
    description: 'Count of Checkpoint 05 findings with severity critical. Not a weighted score.',
  },
  {
    name: 'risk_high_finding_count',
    kind: 'integer',
    category: 'risk',
    description: 'Count of Checkpoint 05 findings with severity high. Not a weighted score.',
  },
  {
    name: 'risk_medium_finding_count',
    kind: 'integer',
    category: 'risk',
    description: 'Count of Checkpoint 05 findings with severity medium. Not a weighted score.',
  },
  {
    name: 'risk_info_finding_count',
    kind: 'integer',
    category: 'risk',
    description: 'Count of Checkpoint 05 findings with severity info. Not a weighted score.',
  },
  {
    name: 'risk_age_seconds',
    kind: 'integer',
    category: 'data_quality',
    description:
      'Whole seconds from risk.scannedAt to asOf, floored from milliseconds. Source freshness, not token age.',
  },
];

const FEATURE_DEFINITION_BY_NAME = new Map(
  FEATURE_DEFINITIONS.map((definition) => [definition.name, definition]),
);

export function requireFeatureDefinition(name: FeatureName): FeatureDefinition {
  const definition = FEATURE_DEFINITION_BY_NAME.get(name);
  if (definition === undefined) {
    throw new Error(`Unknown feature name: ${name}`);
  }

  return definition;
}

export function featureRegistrySize(): number {
  return FEATURE_DEFINITIONS.length;
}
