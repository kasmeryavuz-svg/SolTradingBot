import type { SolanaNetwork } from '../config/types.js';

export class SolanaConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SolanaConnectionError';
  }
}

export type SolanaRpcReader = {
  getHealth(signal: AbortSignal): Promise<unknown>;
  getSlot(signal: AbortSignal): Promise<unknown>;
  getVersion(signal: AbortSignal): Promise<unknown>;
};

export type SolanaHealthCheckOptions = {
  network: SolanaNetwork;
  timeoutMs: number;
};

export type SolanaHealthResult = {
  ok: true;
  network: SolanaNetwork;
  slot: number;
  version: string;
  rpcHealth: string;
  checkedAt: string;
};
