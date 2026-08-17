import type { PersistenceIntegrity } from '../persistence/types.js';
import type { BacktestDataset, StoredStrategyDefinitionSnapshot } from './types.js';

export type BacktestHistoricalDataSource = {
  loadDataset(tokenMint?: string): BacktestDataset;
  getStoredStrategyDefinition(strategyVersion: string): StoredStrategyDefinitionSnapshot | null;
  verifyCompatibleSchema(): void;
  verifyIntegrity(): PersistenceIntegrity;
  close(): void;
};

