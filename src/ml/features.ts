import {
  FEATURE_DEFINITIONS,
  FEATURE_NAMES,
  FEATURE_SET_VERSION,
  requireFeatureDefinition,
} from '../features/definitions.js';
import type { FeatureValueKind } from '../features/types.js';
import { MlError } from './errors.js';

export const FORBIDDEN_ML_IDENTITY_FEATURES = [
  'tokenMint',
  'token_mint',
  'pairAddress',
  'pair_address',
  'symbol',
  'tokenSymbol',
  'token_symbol',
  'tokenName',
  'token_name',
  'rowId',
  'row_id',
  'id',
  'snapshotId',
  'snapshot_id',
  'marketSnapshotId',
  'market_snapshot_id',
  'featureRowId',
  'feature_row_id',
  'collectedAt',
  'generatedAt',
  'asOf',
  'label',
  'pnl',
  'netPnlUsd',
  'baseNetPnlUsd',
  'exitReason',
  'foldId',
  'fold_id',
  'walletAddress',
  'wallet_address',
  'testMembership',
  'futureTimestamp',
] as const;

export const ML19_MODEL_FEATURE_NAMES = [
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

export type Ml19FeatureName = (typeof ML19_MODEL_FEATURE_NAMES)[number];

export type MlFeatureRole = 'continuous' | 'boolean';

export type MlFeatureSpec = {
  name: Ml19FeatureName;
  kind: FeatureValueKind;
  role: MlFeatureRole;
  nullable: boolean;
  missingIndicatorName: string | null;
  exclusionReason: null;
};

const ALWAYS_AVAILABLE_FEATURES = new Set<Ml19FeatureName>(['market_age_seconds']);

function roleFor(kind: FeatureValueKind): MlFeatureRole {
  return kind === 'boolean' ? 'boolean' : 'continuous';
}

export const ML19_MODEL_FEATURES: readonly MlFeatureSpec[] = ML19_MODEL_FEATURE_NAMES.map((name) => {
  const definition = requireFeatureDefinition(name);
  const nullable = !ALWAYS_AVAILABLE_FEATURES.has(name);
  return {
    name,
    kind: definition.kind,
    role: roleFor(definition.kind),
    nullable,
    missingIndicatorName: nullable ? `${name}__missing` : null,
    exclusionReason: null,
  };
});

export const ML19_TRANSFORMED_COLUMN_NAMES: readonly string[] = ML19_MODEL_FEATURES.flatMap((feature) =>
  feature.missingIndicatorName === null
    ? [feature.name]
    : [feature.name, feature.missingIndicatorName],
);

export const ML19_RAW_FEATURE_COUNT = ML19_MODEL_FEATURES.length;
export const ML19_NULLABLE_FEATURE_COUNT = ML19_MODEL_FEATURES.filter((feature) => feature.nullable).length;
export const ML19_TRANSFORMED_DIMENSION = ML19_TRANSFORMED_COLUMN_NAMES.length;
export const ML19_CONTINUOUS_FEATURE_COUNT = ML19_MODEL_FEATURES.filter(
  (feature) => feature.role === 'continuous',
).length;
export const ML19_BOOLEAN_FEATURE_COUNT = ML19_MODEL_FEATURES.filter((feature) => feature.role === 'boolean').length;

export const EXCLUDED_CATEGORICAL_TEXT_FEATURES: readonly {
  name: string;
  reason: string;
}[] = [
  {
    name: 'c06_v1 has no non-numeric categorical text fields',
    reason:
      'Every frozen c06_v1 feature is number, integer, or boolean. Token names, symbols, mints, and pair addresses are identity fields and are forbidden model inputs.',
  },
];

export function assertMl19FeatureBinding(): void {
  const featureSet: string = FEATURE_SET_VERSION;
  if (featureSet !== 'c06_v1') {
    throw new MlError('ml19_v1 requires frozen feature set c06_v1.');
  }
  const registryCount: number = FEATURE_NAMES.length;
  const frozenCount: number = ML19_MODEL_FEATURE_NAMES.length;
  if (registryCount !== frozenCount) {
    throw new MlError(
      `Unknown or missing c06 feature. Frozen ml19 list has ${String(frozenCount)} names; c06 registry has ${String(registryCount)}. Fail closed rather than silently append.`,
    );
  }
  for (let index = 0; index < FEATURE_NAMES.length; index += 1) {
    const registryName = FEATURE_NAMES[index];
    const frozenName = ML19_MODEL_FEATURE_NAMES[index];
    if (registryName !== frozenName) {
      throw new MlError(
        `c06 feature order/identity mismatch at index ${String(index)}: registry=${String(registryName)} frozen=${String(frozenName)}.`,
      );
    }
  }
  if (FEATURE_DEFINITIONS.length !== ML19_MODEL_FEATURES.length) {
    throw new MlError('c06 feature definition count does not match the frozen ml19 feature list.');
  }
  for (const name of FORBIDDEN_ML_IDENTITY_FEATURES) {
    if ((ML19_MODEL_FEATURE_NAMES as readonly string[]).includes(name)) {
      throw new MlError(`Forbidden identity/leakage feature ${name} must not appear in ML19_MODEL_FEATURES.`);
    }
  }
  if (ML19_TRANSFORMED_DIMENSION !== ML19_RAW_FEATURE_COUNT + ML19_NULLABLE_FEATURE_COUNT) {
    throw new MlError('Transformed dimension must equal raw features plus nullable missing indicators.');
  }
}

assertMl19FeatureBinding();

export function requireMl19Feature(name: string): MlFeatureSpec {
  const found = ML19_MODEL_FEATURES.find((feature) => feature.name === name);
  if (found === undefined) {
    throw new MlError(`Unknown ml19 feature: ${name}`);
  }
  return found;
}

export function isForbiddenIdentityFeature(name: string): boolean {
  return (FORBIDDEN_ML_IDENTITY_FEATURES as readonly string[]).includes(name);
}
