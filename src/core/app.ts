import { loadConfig } from '../config/load-config.js';
import type { AppConfig, EnvSource } from '../config/types.js';
import { checkSolanaHealth, createReadOnlySolanaRpc } from '../solana/index.js';
import type { SolanaRpcReader } from '../solana/types.js';
import { printStartupBanner } from './banner.js';
import { assertTradingDisabled } from './safety.js';

export type StartAppDependencies = {
  solanaRpc?: SolanaRpcReader;
};

export async function startApp(
  source: EnvSource,
  dependencies: StartAppDependencies = {},
): Promise<AppConfig> {
  const config = loadConfig(source);
  assertTradingDisabled(config);

  const rpc = dependencies.solanaRpc ?? createReadOnlySolanaRpc(config.solana);
  const solana = await checkSolanaHealth(rpc, {
    network: config.solana.network,
    timeoutMs: config.solana.rpcTimeoutMs,
  });

  printStartupBanner(config, solana);
  return config;
}
