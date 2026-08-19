import type { EnvSource } from '../config/env-source.js';
import { loadCoreConfig } from '../config/load-core-config.js';
import { runCollectorCycle } from '../collector/service.js';
import {
  createDefaultDiscoveryFeeds,
  createDefaultDiscoveryMarketProvider,
} from '../discovery/service.js';
import { executeExitStep } from '../exit/execute.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { executePositionStep } from '../position/execute.js';

export function createProductionCollectorRunner(source: EnvSource): () => Promise<void> {
  return async () => {
    const config = loadCoreConfig(source);
    const repository = createSqlitePersistenceRepository(config.database);
    try {
      repository.initialize();
      await runCollectorCycle({
        config: config.discovery,
        feeds: createDefaultDiscoveryFeeds(config.discovery),
        repository,
        ...(config.discovery.enrichMarketData
          ? { marketData: createDefaultDiscoveryMarketProvider(config.marketData.timeoutMs) }
          : {}),
      });
    } finally {
      repository.close();
    }
  };
}

export function createOpenPositionLookup(source: EnvSource): (tokenMint: string) => boolean {
  return (tokenMint: string): boolean => {
    const config = loadCoreConfig(source);
    const repository = createSqlitePersistenceRepository(config.database);
    try {
      repository.initialize();
      return repository.getOpenPaperPosition(tokenMint) !== null;
    } finally {
      repository.close();
    }
  };
}

export function createPositionStepRunner(source: EnvSource): (tokenMint: string) => Promise<void> {
  return async (tokenMint: string) => {
    await executePositionStep(source, [process.execPath, 'position:step', tokenMint]);
  };
}

export function createExitStepRunner(source: EnvSource): (tokenMint: string) => Promise<void> {
  return async (tokenMint: string) => {
    await executeExitStep(source, [process.execPath, 'exit:step', tokenMint]);
  };
}
