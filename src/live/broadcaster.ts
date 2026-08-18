import { LIVE_SEND_TIMEOUT_MS } from './constants.js';
import { LiveError } from './errors.js';
import { signedWireSha256FromBase64 } from './identity.js';
import { firstSignatureFromWireBase64, isCanonicalSolanaSignature } from './signature.js';
import { withLiveRequestTimeout } from './timeout.js';
import type { LiveBroadcastRpc } from './types.js';

export type BroadcastOnceResult =
  | { readonly kind: 'submitted'; readonly returnedSignature: string }
  | { readonly kind: 'mismatch'; readonly returnedSignature: string }
  | { readonly kind: 'malformed'; readonly returnedSignature: string | null }
  | { readonly kind: 'rejected'; readonly message: string }
  | { readonly kind: 'unknown'; readonly message: string };

/**
 * Application-level send gate: exactly one `sendTransaction` call.
 * Callers must never invoke this twice for the same attempt.
 */
export async function broadcastSignedTransactionOnce(input: {
  rpc: LiveBroadcastRpc;
  wireTransactionBase64: string;
  expectedSignature: string;
  signedWireSha256: string;
  signal?: AbortSignal;
  sendTimeoutMs?: number;
  onSend?: () => void;
}): Promise<BroadcastOnceResult> {
  const actualHash = signedWireSha256FromBase64(input.wireTransactionBase64);
  if (actualHash !== input.signedWireSha256) {
    throw new LiveError('Signed wire bytes changed after txid/hash derivation. Refusing send.', {
      code: 'candidate_changed',
    });
  }
  const first = firstSignatureFromWireBase64(input.wireTransactionBase64);
  if (first !== input.expectedSignature) {
    throw new LiveError('Expected txid is not the first signature of the exact signed wire. Refusing send.', {
      code: 'candidate_changed',
    });
  }

  const sendState = { invoked: 0 };
  const sendOnce = async (): Promise<string> => {
    if (sendState.invoked !== 0) {
      throw new LiveError('l16_v1 refuses a second sendTransaction call.', { code: 'live_operation_failed' });
    }
    sendState.invoked = 1;
    input.onSend?.();
    return input.rpc.sendTransaction(input.wireTransactionBase64, input.signal);
  };

  try {
    const returnedSignature = await withLiveRequestTimeout(
      sendOnce(),
      input.sendTimeoutMs ?? LIVE_SEND_TIMEOUT_MS,
      'sendTransaction',
      'broadcast_outcome_unknown',
    );
    if (!isCanonicalSolanaSignature(returnedSignature)) {
      return { kind: 'malformed', returnedSignature };
    }
    if (returnedSignature !== input.expectedSignature) {
      return { kind: 'mismatch', returnedSignature };
    }
    return { kind: 'submitted', returnedSignature };
  } catch (error: unknown) {
    if (sendState.invoked === 0) {
      if (error instanceof LiveError && error.code === 'broadcast_rejected') {
        return { kind: 'rejected', message: error.message };
      }
      throw error;
    }
    if (error instanceof LiveError && error.code === 'broadcast_rejected') {
      return { kind: 'rejected', message: error.message };
    }
    const message = error instanceof Error ? error.message : 'sendTransaction ended ambiguously.';
    return { kind: 'unknown', message };
  }
}
