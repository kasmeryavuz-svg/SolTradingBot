import type { DiscoveryRunResult } from '../discovery/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { TokenRiskReport } from '../risk/types.js';
import type {
  PersistenceIntegrity,
  PersistenceStats,
  RecordedRiskScan,
  RecordedRun,
  StoredObservation,
  StoredSourceResult,
  StoredToken,
  TokenHistory,
  TokenRiskHistory,
} from './types.js';

export type PersistenceRepository = {
  initialize(): void;
  recordDiscoveryRun(result: DiscoveryRunResult): RecordedRun;
  recordMarketSnapshots(snapshots: readonly MarketSnapshot[]): number;
  recordRiskReport(report: TokenRiskReport): RecordedRiskScan;
  getStats(): PersistenceStats;
  getToken(tokenMint: string): StoredToken | null;
  getRecentDiscoveryObservations(limit: number): StoredObservation[];
  getSourceResultsForRun(runId: number): StoredSourceResult[];
  getMarketHistory(tokenMint: string, limit: number): TokenHistory | null;
  getRiskHistory(tokenMint: string, limit: number): TokenRiskHistory | null;
  verifyIntegrity(): PersistenceIntegrity;
  close(): void;
};
