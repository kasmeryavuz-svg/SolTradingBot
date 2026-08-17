import { decodeBase58KeypairSecret } from './secret-decode.js';
import { createProcessTerminalAdapter, promptHiddenSecret, type TerminalAdapter } from './secret-input.js';
import { toSanitizedWalletError } from './sanitize.js';
import { assertSignerMatchesTaker, createWalletSignerFromSecretBytes } from './signer.js';
import type { WalletSigner } from './types.js';
import { zeroizeBytes } from './zeroize.js';

export type SecretPrompt = () => Promise<string>;

/**
 * Load a signer from caller-owned 64-byte secret material, run one scoped
 * operation, then best-effort zeroize those bytes and drop the signer.
 *
 * The signer is not cached. There is no global wallet singleton.
 */
export async function withDecodedSecretSigner<T>(
  expectedAddress: string,
  secretBytes: Uint8Array,
  callback: (signer: WalletSigner) => Promise<T>,
): Promise<T> {
  try {
    const signer = await createWalletSignerFromSecretBytes(secretBytes);
    zeroizeBytes(secretBytes);
    assertSignerMatchesTaker(signer, expectedAddress);
    return await callback(signer);
  } finally {
    zeroizeBytes(secretBytes);
  }
}

/**
 * Hidden TTY (or injected prompt) → decode → scoped signer → drop.
 *
 * Terminal raw mode is restored by the prompt before decode / callback work.
 * The secret string is released as soon as decoding completes. JavaScript
 * strings cannot be reliably overwritten.
 */
export async function withInteractiveSigner<T>(
  expectedAddress: string,
  callback: (signer: WalletSigner) => Promise<T>,
  options: {
    promptSecret?: SecretPrompt;
    terminal?: TerminalAdapter;
  } = {},
): Promise<T> {
  const secret = await readSecret(options);
  try {
    const secretBytes = decodeBase58KeypairSecret(secret);
    return await withDecodedSecretSigner(expectedAddress, secretBytes, callback);
  } catch (error: unknown) {
    throw toSanitizedWalletError(error, [secret]);
  }
}

async function readSecret(options: {
  promptSecret?: SecretPrompt;
  terminal?: TerminalAdapter;
}): Promise<string> {
  if (options.promptSecret !== undefined) {
    return options.promptSecret();
  }
  return promptHiddenSecret(options.terminal ?? createProcessTerminalAdapter());
}
