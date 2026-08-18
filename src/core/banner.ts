import type { AppConfig } from '../config/types.js';
import { formatSolanaStatusLines } from '../solana/health.js';
import type { SolanaHealthResult } from '../solana/types.js';

export function printStartupBanner(config: AppConfig, solana: SolanaHealthResult): void {
  console.log('Meme Trading Bot');
  console.log(`Mode: ${config.nodeEnv}`);
  console.log('Trading capability: MANUAL / HARD-CAPPED ONLY');
  console.log('');
  for (const line of formatSolanaStatusLines(solana)) {
    console.log(line);
  }
  console.log('');
  console.log('Checkpoint: 16');
  console.log('Blockchain capability: READ ONLY by default');
  console.log(`Local persistence: ${config.database.enabled ? 'available' : 'disabled'}`);
  console.log('Token risk scanner: available');
  console.log('Feature engine: available');
  console.log('Strategy evaluator: available');
  console.log('Backtester: available');
  console.log('Paper trading: available');
  console.log('Position management: available');
  console.log('Exit engine: available');
  console.log('Performance analytics: available');
  console.log('Strategy benchmark lab: available');
  console.log('Dashboard: available');
  console.log('Execution preflight: available');
  console.log('Wallet security: available');
  console.log('Manual tiny-live broadcaster: available');
  console.log('Automatic live trading: unavailable');
  console.log('Jito: unavailable');
  console.log('Dashboard live controls: unavailable');
  console.log('Signing: manual/local only');
  console.log('Trading capability: MANUAL / HARD-CAPPED ONLY');
}
