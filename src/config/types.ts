export const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
export const LOG_LEVEL_VALUES = ['debug', 'info', 'warn', 'error'] as const;
export const SOLANA_NETWORK_VALUES = ['mainnet-beta', 'devnet', 'testnet'] as const;
export const RISK_COMMITMENT_VALUES = ['confirmed', 'finalized'] as const;

export type NodeEnv = (typeof NODE_ENV_VALUES)[number];
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];
export type SolanaNetwork = (typeof SOLANA_NETWORK_VALUES)[number];
export type RiskCommitment = (typeof RISK_COMMITMENT_VALUES)[number];

export type SolanaConfig = {
  network: SolanaNetwork;
  rpcTimeoutMs: number;
  rpcUrl: string;
};

export type MarketDataConfig = {
  tokenMints: string[];
  timeoutMs: number;
  pollIntervalMs: number;
};

export type DiscoveryConfig = {
  enabled: boolean;
  includeProfiles: boolean;
  includeBoosts: boolean;
  timeoutMs: number;
  pollIntervalMs: number;
  maxCandidates: number;
  enrichMarketData: boolean;
};

export type DatabaseConfig = {
  enabled: boolean;
  path: string;
  busyTimeoutMs: number;
};

export type RiskConfig = {
  timeoutMs: number;
  commitment: RiskCommitment;
  historyLimit: number;
};

export type FeatureConfig = {
  historyLimit: number;
};

export type StrategyConfig = {
  historyLimit: number;
};

export type PaperConfig = {
  historyLimit: number;
};

export type PositionConfig = {
  historyLimit: number;
};

export type ExitConfig = {
  historyLimit: number;
};

export type PerformanceConfig = {
  tradeLimit: number;
};

export type ResearchConfig = {
  tradeLimit: number;
};

export type DashboardConfig = {
  port: number;
};

export type AppConfig = {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  tradingEnabled: boolean;
  solana: SolanaConfig;
  marketData: MarketDataConfig;
  discovery: DiscoveryConfig;
  database: DatabaseConfig;
  risk: RiskConfig;
  features: FeatureConfig;
  strategy: StrategyConfig;
  paper: PaperConfig;
  position: PositionConfig;
  exit: ExitConfig;
  performance: PerformanceConfig;
  research: ResearchConfig;
  dashboard: DashboardConfig;
};

export type EnvSource = Record<string, string | undefined>;
