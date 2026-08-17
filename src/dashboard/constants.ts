import { BACKTEST_DEFINITION_FINGERPRINT } from '../backtest/identity.js';
import { EXIT_DEFINITION_FINGERPRINT } from '../exit/identity.js';
import { PAPER_DEFINITION_FINGERPRINT } from '../paper/identity.js';
import { PERFORMANCE_DEFINITION_FINGERPRINT } from '../performance/identity.js';
import { POSITION_DEFINITION_FINGERPRINT } from '../position/identity.js';
import { RESEARCH_DEFINITION_FINGERPRINT } from '../research/identity.js';
import { STRATEGY_DEFINITION_FINGERPRINT } from '../strategy/identity.js';
import { DashboardError } from './errors.js';

export const DASHBOARD_SPEC_VERSION = 'd13_v1';
export const DASHBOARD_SPEC_NAME = 'local_read_only_observability_dashboard';
export const DASHBOARD_CHECKPOINT = '13';

export const DASHBOARD_BIND_HOST = '127.0.0.1' as const;
export const DASHBOARD_MARKET_LIMIT = 25;
export const DASHBOARD_RUNTIME_CLOSED_TRADE_LIMIT = 20;
export const DASHBOARD_AUTO_REFRESH_MS = 15_000;

export const REQUIRED_SCHEMA_VERSION = 7;

export const FROZEN_S07_V1_DEFINITION_FINGERPRINT =
  'b4560629e6a58331e9046f13bad78b73b3bdc1bb7349fc6173ba158b4db067cd';
export const FROZEN_B08_V1_DEFINITION_FINGERPRINT =
  '87bca6f2ea8e57b7613d3627b5a5adf37864142b3c62de97849440189ff07fcf';
export const FROZEN_P09_V1_DEFINITION_FINGERPRINT =
  '4951807199956eb0425193fbdb3296289090b6bbffd92f7353718cad0f68a0e0';
export const FROZEN_PM10_V1_DEFINITION_FINGERPRINT =
  '8c89f5a95f7aadb02d0cd7736b73d563266b2df1f3b16da5d24788eced75aa4f';
export const FROZEN_X11_V1_DEFINITION_FINGERPRINT =
  '4678a49e73cab2f0076e376506910761f4afcabdcdee4fe3c9830c2395c2e6e6';
export const FROZEN_A12_V1_DEFINITION_FINGERPRINT =
  '9fe2b033c19d5470b972714cc37d32333ac4662ad8d30cdd97b668891454e53c';
export const FROZEN_R125_V1_DEFINITION_FINGERPRINT =
  '61f5a9d091ce9214e440dddf029f81bb881a907f4cd9193e04ecd3238c20a83a';

export const DASHBOARD_API_ROUTES = [
  '/api/v1/dashboard',
  '/api/v1/performance',
  '/api/v1/research',
  '/api/v1/market',
  '/api/v1/runtime-paper',
  '/api/v1/database-health',
] as const;

export const DASHBOARD_STATIC_ROUTES = ['/', '/app.js', '/styles.css'] as const;

export const DASHBOARD_ALLOWED_METHODS = ['GET', 'HEAD'] as const;

export const REQUIRED_DASHBOARD_TABLES = [
  'tokens',
  'market_snapshots',
  'risk_scans',
  'feature_vectors',
  'strategy_evaluations',
  'paper_evaluations',
  'position_evaluations',
  'paper_positions',
  'paper_open_positions',
  'exit_evaluations',
  'paper_position_exits',
  'schema_migrations',
] as const;

export const REQUIRED_DASHBOARD_COLUMNS: Record<(typeof REQUIRED_DASHBOARD_TABLES)[number], readonly string[]> = {
  tokens: ['id', 'mint'],
  market_snapshots: [
    'id',
    'token_id',
    'token_name',
    'token_symbol',
    'dex_id',
    'pair_address',
    'price_usd',
    'liquidity_usd',
    'volume_5m_usd',
    'buys_5m',
    'sells_5m',
    'price_change_5m_pct',
    'price_change_1h_pct',
    'price_change_24h_pct',
    'collected_at',
  ],
  risk_scans: ['id', 'token_id', 'scanned_at'],
  feature_vectors: ['id'],
  strategy_evaluations: ['id', 'evaluated_at'],
  paper_evaluations: ['id', 'evaluated_at'],
  position_evaluations: ['id'],
  paper_positions: [
    'id',
    'token_id',
    'pair_address',
    'opened_at',
    'entry_price_usd',
    'entry_notional_usd',
    'quantity_tokens',
    'source_identity',
  ],
  paper_open_positions: ['token_id', 'position_id'],
  exit_evaluations: ['id', 'evaluated_at', 'market_snapshot_id'],
  paper_position_exits: ['id'],
  schema_migrations: ['version'],
};

if (STRATEGY_DEFINITION_FINGERPRINT !== FROZEN_S07_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen s07_v1 strategy definition fingerprint.');
}
if (BACKTEST_DEFINITION_FINGERPRINT !== FROZEN_B08_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen b08_v1 backtest definition fingerprint.');
}
if (PAPER_DEFINITION_FINGERPRINT !== FROZEN_P09_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen p09_v1 paper definition fingerprint.');
}
if (POSITION_DEFINITION_FINGERPRINT !== FROZEN_PM10_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen pm10_v1 position definition fingerprint.');
}
if (EXIT_DEFINITION_FINGERPRINT !== FROZEN_X11_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen x11_v1 exit definition fingerprint.');
}
if (PERFORMANCE_DEFINITION_FINGERPRINT !== FROZEN_A12_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen a12_v1 performance definition fingerprint.');
}
if (RESEARCH_DEFINITION_FINGERPRINT !== FROZEN_R125_V1_DEFINITION_FINGERPRINT) {
  throw new DashboardError('Phase 13 requires the frozen r125_v1 research definition fingerprint.');
}
