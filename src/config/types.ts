export type { EnvSource } from './env-source.js';
export {
  LOG_LEVEL_VALUES,
  NODE_ENV_VALUES,
  RISK_COMMITMENT_VALUES,
  SOLANA_NETWORK_VALUES,
  type CoreAppConfig,
  type DashboardConfig,
  type DatabaseConfig,
  type DiscoveryConfig,
  type ExitConfig,
  type FeatureConfig,
  type LogLevel,
  type MarketDataConfig,
  type NodeEnv,
  type PaperConfig,
  type PerformanceConfig,
  type PositionConfig,
  type ResearchConfig,
  type RiskCommitment,
  type RiskConfig,
  type SolanaConfig,
  type SolanaNetwork,
  type StrategyConfig,
} from './core-types.js';

export type ExecutionConfig = {
  takerPublicKey: string | null;
  inputMint: string | null;
  outputMint: string | null;
  amountRaw: string | null;
  providerTimeoutMs: number;
  jupiterApiKeyConfigured: boolean;
};

export type WalletIntelligenceConfig = {
  heliusApiKey: string | null;
};

export type AppConfig = import('./core-types.js').CoreAppConfig & {
  execution: ExecutionConfig;
  walletIntelligence: WalletIntelligenceConfig;
};
