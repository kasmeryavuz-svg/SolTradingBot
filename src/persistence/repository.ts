import type { DiscoveryRunResult } from '../discovery/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type {
  PersistenceIntegrity,
  PersistenceStats,
  RecordedRun,
  StoredObservation,
  StoredSourceResult,
  StoredToken,
  TokenHistory,
} from './types.js';

export type PersistenceRepository = {
  initialize(): void;
  recordDiscoveryRun(result: DiscoveryRunResult): RecordedRun;
  recordMarketSnapshots(snapshots: readonly MarketSnapshot[]): number;
  getStats(): PersistenceStats;
  getToken(tokenMint: string): StoredToken | null;
  getRecentDiscoveryObservations(limit: number): StoredObservation[];
  getSourceResultsForRun(runId: number): StoredSourceResult[];
  getMarketHistory(tokenMint: string, limit: number): TokenHistory | null;
  verifyIntegrity(): PersistenceIntegrity;
  close(): void;
};
