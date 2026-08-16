import type { AppConfig } from '../config/types.js';

export function printStartupBanner(config: AppConfig): void {
  console.log('Meme Trading Bot');
  console.log(`Mode: ${config.nodeEnv}`);
  console.log('Trading capability: disabled');
}
