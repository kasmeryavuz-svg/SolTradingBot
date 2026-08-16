import { config as loadDotenv } from 'dotenv';
import { loadConfig } from '../config/load-config.js';
import { assertTradingDisabled } from '../core/safety.js';
import { checkSolanaHealth, formatSolanaStatusLines } from './health.js';
import { createReadOnlySolanaRpc } from './rpc.js';

loadDotenv({ quiet: true });

try {
  const config = loadConfig(process.env);
  assertTradingDisabled(config);

  const result = await checkSolanaHealth(createReadOnlySolanaRpc(config.solana), {
    network: config.solana.network,
    timeoutMs: config.solana.rpcTimeoutMs,
  });

  console.log('Solana health check');
  for (const line of formatSolanaStatusLines(result)) {
    if (line !== 'Solana:') {
      console.log(line);
    }
  }
  console.log('Checkpoint: 01');
  console.log('Mode: READ ONLY');
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
