export type ProductionWorkMode = 'DATA_ONLY' | 'PAPER_ONLY' | 'DATA_AND_PAPER' | 'NONE';

export type ProductionRuntimeConfig = {
  enabled: boolean;
  intervalMs: number;
  collectorEnabled: boolean;
  paperEnabled: boolean;
  paperMints: readonly string[];
  healthPort: number;
  healthHost: '127.0.0.1';
  tradingEnabled: boolean;
  liveBroadcastEnabled: boolean;
  databaseEnabled: boolean;
  databasePath: string;
  discoveryEnabled: boolean;
  workMode: ProductionWorkMode;
};

export type ProductionLockRecord = {
  specVersion: string;
  specFingerprint: string;
  pid: number;
  processStartedAtMs: number;
  runtimeStartedAt: string;
};

export type ProductionProcessIdentity = {
  pid: number;
  processStartedAtMs: number;
};

export type ProductionLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type ProductionLogEvent = {
  timestamp: string;
  level: ProductionLogLevel;
  event: string;
  specVersion: string;
  cycleNumber?: number;
  component?: string;
  mint?: string;
  result?: string;
  durationMs?: number;
  consecutiveFailedCycles?: number;
  message?: string;
};

export type ProductionClock = {
  nowMs: () => number;
  nowIso: () => string;
  sleep: (ms: number, signal: AbortSignal) => Promise<void>;
};

export type ProcessLiveness = {
  isAlive: (pid: number) => boolean;
};

export type ProductionLogger = {
  write: (event: ProductionLogEvent) => void;
};

export type OpenPositionLookup = {
  hasOpenPaperPosition: (tokenMint: string) => boolean | Promise<boolean>;
};

export type ProductionMintOperation = 'POSITION' | 'EXIT';

export type ProductionMintResult = {
  tokenMint: string;
  operation: ProductionMintOperation;
  ok: boolean;
};

export type ProductionCycleResult = {
  cycleNumber: number;
  ok: boolean;
  collectorOk: boolean | null;
  mintResults: readonly ProductionMintResult[];
  durationMs: number;
  consecutiveFailedCycles: number;
};

export type ProductionHealthSnapshot = {
  alive: boolean;
  ready: boolean;
  shuttingDown: boolean;
  consecutiveFailedCycles: number;
  completedSuccessfulCycle: boolean;
  startupPassed: boolean;
  lockHeld: boolean;
  uptimeMs: number;
  specVersion: string;
  specFingerprint: string;
};

export type ProductionReadyReason =
  | 'startup'
  | 'failed_cycle'
  | 'shutting_down'
  | 'circuit_open'
  | 'ready';

export type ProductionHealthListenAddress = {
  address: string;
  port: number;
};

export type ProductionHealthRuntime = {
  listen: () => Promise<ProductionHealthListenAddress>;
  close: () => Promise<void>;
  setRuntimeErrorHandler?: (handler: (error: Error) => void) => void;
};
