import { createSolanaRpc } from '@solana/kit';
import type { SolanaConfig } from '../config/types.js';
import type { SolanaRpcReader } from './types.js';

export function createReadOnlySolanaRpc(config: SolanaConfig): SolanaRpcReader {
  const rpc = createSolanaRpc(config.rpcUrl);

  return {
    getHealth: (signal) => rpc.getHealth().send({ abortSignal: signal }),
    getSlot: (signal) => rpc.getSlot().send({ abortSignal: signal }),
    getVersion: (signal) => rpc.getVersion().send({ abortSignal: signal }),
  };
}
