export const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
export const LOG_LEVEL_VALUES = ['debug', 'info', 'warn', 'error'] as const;
export const SOLANA_NETWORK_VALUES = ['mainnet-beta', 'devnet', 'testnet'] as const;

export type NodeEnv = (typeof NODE_ENV_VALUES)[number];
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];
export type SolanaNetwork = (typeof SOLANA_NETWORK_VALUES)[number];

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

export type AppConfig = {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  tradingEnabled: boolean;
  solana: SolanaConfig;
  marketData: MarketDataConfig;
};

export type EnvSource = Record<string, string | undefined>;
