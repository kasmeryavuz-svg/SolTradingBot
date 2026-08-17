import { config as loadDotenv } from 'dotenv';
import { createSqlitePersistenceRepository } from '../persistence/sqlite/index.js';
import { prepareRiskRecordCommand, requireRiskMintArgument } from './command.js';
import { formatRiskRecordLines } from './format.js';
import { scanTokenRisk } from './service.js';
import { createSolanaRiskDataProvider } from './solana/provider.js';

loadDotenv({ quiet: true });

try {
  const config = prepareRiskRecordCommand(process.env);
  const tokenMint = requireRiskMintArgument(process.argv, 'risk:record');
  const report = await scanTokenRisk({
    tokenMint,
    provider: createSolanaRiskDataProvider({
      rpcUrl: config.solana.rpcUrl,
      timeoutMs: config.risk.timeoutMs,
      commitment: config.risk.commitment,
    }),
    commitment: config.risk.commitment,
  });

  const repository = createSqlitePersistenceRepository(config.database);
  try {
    repository.initialize();
    const recorded = repository.recordRiskReport(report);
    for (const line of formatRiskRecordLines(report, recorded)) {
      console.log(line);
    }
  } finally {
    repository.close();
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
