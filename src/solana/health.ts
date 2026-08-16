import { sanitizeErrorText } from '../utils/sanitize-rpc-url.js';
import {
  SolanaConnectionError,
  type SolanaHealthCheckOptions,
  type SolanaHealthResult,
  type SolanaRpcReader,
} from './types.js';

export async function checkSolanaHealth(
  reader: SolanaRpcReader,
  options: SolanaHealthCheckOptions,
): Promise<SolanaHealthResult> {
  const signal = AbortSignal.timeout(options.timeoutMs);

  try {
    const [slotValue, versionValue, healthValue] = await Promise.all([
      reader.getSlot(signal),
      reader.getVersion(signal),
      reader.getHealth(signal),
    ]);

    return {
      ok: true,
      network: options.network,
      slot: parseSlot(slotValue),
      version: parseVersion(versionValue),
      rpcHealth: parseHealth(healthValue),
      checkedAt: new Date().toISOString(),
    };
  } catch (error: unknown) {
    if (error instanceof SolanaConnectionError) {
      throw error;
    }

    throw new SolanaConnectionError(mapSolanaFailure(error, options.timeoutMs));
  }
}

export function formatSolanaStatusLines(result: SolanaHealthResult): string[] {
  return [
    'Solana:',
    `Network: ${result.network}`,
    'RPC: connected',
    `Slot: ${String(result.slot)}`,
    `Version: ${result.version}`,
    `Health: ${result.rpcHealth}`,
  ];
}

function parseSlot(value: unknown): number {
  if (typeof value === 'bigint') {
    if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new SolanaConnectionError('Solana RPC returned an unexpected slot value.');
    }
    return Number(value);
  }

  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseSlot(Number(value));
  }

  throw new SolanaConnectionError('Solana RPC returned an unexpected slot value.');
}

function parseVersion(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  if (isRecord(value)) {
    const coreVersion = value['solana-core'];
    if (typeof coreVersion === 'string' && coreVersion.trim() !== '') {
      return coreVersion;
    }
  }

  throw new SolanaConnectionError('Solana RPC returned an unexpected version response.');
}

function parseHealth(value: unknown): string {
  if (typeof value === 'string' && value.trim() !== '') {
    return value;
  }

  throw new SolanaConnectionError('Solana RPC returned an unexpected health response.');
}

function mapSolanaFailure(error: unknown, timeoutMs: number): string {
  if (isTimeoutOrAbort(error)) {
    return `Solana RPC request timed out after ${String(timeoutMs)}ms.`;
  }

  const rawMessage = error instanceof Error ? error.message : 'Solana RPC health check failed.';
  const message = sanitizeErrorText(rawMessage);

  if (isUnavailableMessage(message)) {
    return 'Solana RPC is unavailable. Check the RPC URL and your internet connection.';
  }

  if (isUnhealthyMessage(message)) {
    return 'Solana RPC reported that the node is unhealthy.';
  }

  return `Solana RPC health check failed: ${message}`;
}

function isTimeoutOrAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
}

function isUnavailableMessage(message: string): boolean {
  return /fetch failed|econnrefused|enotfound|network|socket|econnreset|undici/i.test(message);
}

function isUnhealthyMessage(message: string): boolean {
  return /unhealthy|behind/i.test(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
