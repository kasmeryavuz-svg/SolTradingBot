import { config as loadDotenv } from 'dotenv';
import { prepareRiskCheckCommand, requireRiskMintArgument } from './command.js';
import { formatRiskCheckLines } from './format.js';
import { scanTokenRisk } from './service.js';
import { createSolanaRiskDataProvider } from './solana/provider.js';

loadDotenv({ quiet: true });

try {
  const config = prepareRiskCheckCommand(process.env);
  const tokenMint = requireRiskMintArgument(process.argv, 'risk:check');
  const report = await scanTokenRisk({
    tokenMint,
    provider: createSolanaRiskDataProvider({
      rpcUrl: config.solana.rpcUrl,
      timeoutMs: config.risk.timeoutMs,
      commitment: config.risk.commitment,
    }),
    commitment: config.risk.commitment,
  });

  for (const line of formatRiskCheckLines(report)) {
    console.log(line);
  }
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
