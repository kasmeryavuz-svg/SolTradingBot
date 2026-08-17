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
  console.log('Checkpoint: 05');
  console.log('Blockchain capability: READ ONLY');
  console.log(`Local persistence: ${config.database.enabled ? 'available' : 'disabled'}`);
  console.log('Token risk scanner: available');
  console.log('Trading capability: disabled');
}
