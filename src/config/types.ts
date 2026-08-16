export const NODE_ENV_VALUES = ['development', 'test', 'production'] as const;
export const LOG_LEVEL_VALUES = ['debug', 'info', 'warn', 'error'] as const;

export type NodeEnv = (typeof NODE_ENV_VALUES)[number];
export type LogLevel = (typeof LOG_LEVEL_VALUES)[number];

export type AppConfig = {
  nodeEnv: NodeEnv;
  logLevel: LogLevel;
  tradingEnabled: boolean;
};

export type EnvSource = Record<string, string | undefined>;
