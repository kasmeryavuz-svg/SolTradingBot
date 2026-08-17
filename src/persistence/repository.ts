import type { DiscoveryRunResult } from '../discovery/types.js';
import type { MarketSnapshot } from '../market-data/types.js';
import type { TokenRiskReport } from '../risk/types.js';
import type {
  FeatureBundle,
  PersistenceIntegrity,
  PersistenceStats,
  RecordedFeatureBundle,
  RecordedRiskScan,
  RecordedRun,
  RecordedStrategyBundle,
  RecordedPaperBundle,
  PaperBundle,
  PositionBundle,
  RecordedPositionBundle,
  ExitBundle,
  RecordedExitBundle,
  StoredObservation,
  StoredRiskScanSummary,
  StoredSourceResult,
  StoredToken,
  StrategyBundle,
  TokenFeatureHistory,
  TokenHistory,
  TokenRiskHistory,
  TokenStrategyHistory,
  TokenPaperHistory,
  TokenPositionHistory,
  TokenExitHistory,
  StoredOpenPaperPosition,
} from './types.js';

export type PersistenceRepository = {
  initialize(): void;
  recordDiscoveryRun(result: DiscoveryRunResult): RecordedRun;
  recordMarketSnapshots(snapshots: readonly MarketSnapshot[]): number;
  recordRiskReport(report: TokenRiskReport): RecordedRiskScan;
  recordFeatureBundle(bundle: FeatureBundle): RecordedFeatureBundle;
  recordStrategyBundle(bundle: StrategyBundle): RecordedStrategyBundle;
  recordPaperBundle(bundle: PaperBundle): RecordedPaperBundle;
  recordPositionBundle(bundle: PositionBundle): RecordedPositionBundle;
  recordExitBundle(bundle: ExitBundle): RecordedExitBundle;
  getPreviousMarketSnapshot(
    tokenMint: string,
    pairAddress: string,
    beforeCollectedAt: string,
  ): MarketSnapshot | null;
  getLatestRiskScanAsOf(tokenMint: string, asOf: string): StoredRiskScanSummary | null;
  getFeatureHistory(tokenMint: string, limit: number): TokenFeatureHistory | null;
  getStrategyHistory(tokenMint: string, limit: number): TokenStrategyHistory | null;
  getPaperHistory(tokenMint: string, limit: number): TokenPaperHistory | null;
  getOpenPaperPosition(tokenMint: string): StoredOpenPaperPosition | null;
  getPositionHistory(tokenMint: string, limit: number): TokenPositionHistory | null;
  getExitHistory(tokenMint: string, limit: number): TokenExitHistory | null;
  getStats(): PersistenceStats;
  getToken(tokenMint: string): StoredToken | null;
  getRecentDiscoveryObservations(limit: number): StoredObservation[];
  getSourceResultsForRun(runId: number): StoredSourceResult[];
  getMarketHistory(tokenMint: string, limit: number): TokenHistory | null;
  getRiskHistory(tokenMint: string, limit: number): TokenRiskHistory | null;
  verifyIntegrity(): PersistenceIntegrity;
  close(): void;
};
