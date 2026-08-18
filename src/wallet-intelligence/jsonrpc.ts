import { isRecord } from './numbers.js';
import { WalletIntelligenceError } from './errors.js';

export function isRecordValue(value: unknown): value is Record<string, unknown> {
  return isRecord(value);
}

export function parseJsonRpcResult(payload: unknown, method: string): unknown {
  if (!isRecord(payload)) {
    throw new WalletIntelligenceError(`Provider ${method} returned a non-object JSON body.`, {
      code: 'provider_invalid_response',
    });
  }
  if (payload['error'] !== undefined && payload['error'] !== null) {
    const detail = isRecord(payload['error']) && typeof payload['error']['message'] === 'string'
      ? payload['error']['message']
      : 'JSON-RPC error';
    throw new WalletIntelligenceError(`Provider ${method} returned a JSON-RPC error: ${detail}`, {
      code: 'provider_invalid_response',
    });
  }
  if (!('result' in payload)) {
    throw new WalletIntelligenceError(`Provider ${method} omitted result.`, {
      code: 'provider_invalid_response',
    });
  }
  return payload['result'];
}
