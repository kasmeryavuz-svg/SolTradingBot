import type { EnvSource } from '../config/env-source.js';
import {
  createDexScreenerExactPairProvider,
  type ExactPairMarketDataProvider,
} from '../market-data/index.js';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import type { RecordedExitBundle, StoredOpenPaperPosition } from '../persistence/types.js';
import { prepareExitStepCommand, requireExitMintArgument } from './command.js';
import { evaluateExitAction } from './evaluator.js';
import type { ExitEvaluation } from './types.js';

export type ExitStepDependencies = {
  createExactPairProvider?: (options: { timeoutMs: number }) => ExactPairMarketDataProvider;
  createRepository?: typeof createSqlitePersistenceRepository;
};

export type ExitStepResult =
  | {
      kind: 'no_open_position';
      tokenMint: string;
    }
  | {
      kind: 'evaluated';
      tokenMint: string;
      exitEvaluation: ExitEvaluation;
      recorded: RecordedExitBundle;
      currentOpenPosition: StoredOpenPaperPosition | null;
    };

export async function executeExitStep(
  source: EnvSource,
  argv: readonly string[],
  dependencies: ExitStepDependencies = {},
): Promise<ExitStepResult> {
  const config = prepareExitStepCommand(source);
  const tokenMint = requireExitMintArgument(argv, 'exit:step');
  const createRepository = dependencies.createRepository ?? createSqlitePersistenceRepository;
  const repository = createRepository(config.database);

  try {
    repository.initialize();
    const openPosition = repository.getOpenPaperPosition(tokenMint);
    if (openPosition === null) {
      return { kind: 'no_open_position', tokenMint };
    }

    const createExactPairProvider =
      dependencies.createExactPairProvider ??
      ((options: { timeoutMs: number }) => createDexScreenerExactPairProvider(options));
    const provider = createExactPairProvider({ timeoutMs: config.marketData.timeoutMs });
    const marketSnapshot = await provider.getSnapshotForPair(tokenMint, openPosition.pairAddress);
    const exitEvaluation = evaluateExitAction({ openPosition, marketSnapshot });
    const recorded = repository.recordExitBundle({
      openPosition,
      marketSnapshot,
      exitEvaluation,
    });
    const currentOpenPosition = repository.getOpenPaperPosition(tokenMint);

    return {
      kind: 'evaluated',
      tokenMint,
      exitEvaluation,
      recorded,
      currentOpenPosition,
    };
  } finally {
    repository.close();
  }
}
