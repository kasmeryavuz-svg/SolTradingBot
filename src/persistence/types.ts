import type { DiscoverySource, MarketDataStatus } from '../discovery/types.js';
import type { MarketSnapshot } from '../market-data/types.js';

export class PersistenceError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PersistenceError';
  }
}

export type RecordedRun = {
  runId: number;
  observedAt: string;
  recordedAt: string;
  candidateCount: number;
  tokensInserted: number;
  tokensUpdated: number;
  observationsWritten: number;
  snapshotsWritten: number;
};

export type PersistenceIntegrity = {
  ok: boolean;
  detail: string;
};

export type PersistenceStats = {
  schemaVersion: number;
  foreignKeysEnabled: boolean;
  journalMode: string;
  integrity: PersistenceIntegrity;
  tokenCount: number;
  discoveryRunCount: number;
  discoveryObservationCount: number;
  marketSnapshotCount: number;
  earliestObservationAt: string | null;
  latestObservationAt: string | null;
};

export type StoredToken = {
  id: number;
  chain: 'solana';
  mint: string;
  firstObservedAt: string;
  lastObservedAt: string;
  createdAt: string;
};

export type StoredSourceResult = {
  source: DiscoverySource;
  ok: boolean;
  recordCount: number;
  error: string | null;
};

export type StoredObservation = {
  id: number;
  runId: number;
  tokenMint: string;
  observedAt: string;
  sources: DiscoverySource[];
  dexScreenerUrl: string | null;
  description: string | null;
  profileUpdatedAt: string | null;
  boostAmount: number | null;
  boostTotalAmount: number | null;
  marketDataStatus: MarketDataStatus;
};

export type TokenHistory = {
  token: StoredToken;
  snapshots: MarketSnapshot[];
};

export type HistoryLimit = {
  requested: number;
  applied: number;
};
