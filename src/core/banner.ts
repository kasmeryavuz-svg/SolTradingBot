import type { AppConfig } from '../config/types.js';
import { formatSolanaStatusLines } from '../solana/health.js';
import type { SolanaHealthResult } from '../solana/types.js';

export function printStartupBanner(config: AppConfig, solana: SolanaHealthResult): void {
  console.log('Meme Trading Bot');
  console.log(`Mode: ${config.nodeEnv}`);
  console.log('Trading capability: disabled');
  console.log('');
  for (const line of formatSolanaStatusLines(solana)) {
    console.log(line);
  }
  console.log('');
  console.log('Checkpoint: 12.5');
  console.log('Blockchain capability: READ ONLY');
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
  console.log('Dashboard: unavailable');
  console.log('Trading capability: disabled');
}
