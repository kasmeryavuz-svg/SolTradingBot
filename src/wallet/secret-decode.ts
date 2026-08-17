import { getBase58Decoder, getBase58Encoder } from '@solana/kit';
import { WALLET_BASE58_ALPHABET, WALLET_SECRET_DECODED_BYTES, WALLET_SECRET_MAX_CHARS } from './constants.js';
import { WalletError } from './errors.js';

const BASE58_CHAR = new Set(WALLET_BASE58_ALPHABET.split(''));

export function isBase58SecretSyntax(value: string): boolean {
  if (value.length === 0 || value.length > WALLET_SECRET_MAX_CHARS) {
    return false;
  }
  for (const character of value) {
    if (!BASE58_CHAR.has(character)) {
      return false;
    }
  }
  return true;
}

/**
 * Decode the frozen w15_v1 secret format: a base58-encoded 64-byte Solana keypair.
 *
 * Official current Kit API: `getBase58Encoder().encode(base58String)` converts the
 * typed secret string into bytes. The matching decoder converts bytes back to base58.
 * Malformed input is not normalized (no trim, no hex/base64/JSON fallback).
 * Accepted input must equal the canonical re-encode of the decoded bytes.
 *
 * The returned Uint8Array is caller-owned and must be zeroized after use.
 */
export function decodeBase58KeypairSecret(secret: string): Uint8Array {
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new WalletError('Secret encoding is not the frozen w15_v1 base58 keypair format.', {
      code: 'invalid_secret_encoding',
    });
  }
  if (secret.length > WALLET_SECRET_MAX_CHARS) {
    throw new WalletError('Secret input exceeds the w15_v1 maximum length.', {
      code: 'secret_input_too_long',
    });
  }
  if (!isBase58SecretSyntax(secret)) {
    throw new WalletError('Secret encoding is not the frozen w15_v1 base58 keypair format.', {
      code: 'invalid_secret_encoding',
    });
  }

  let decoded: Uint8Array;
  try {
    decoded = new Uint8Array(getBase58Encoder().encode(secret));
  } catch {
    throw new WalletError('Secret encoding is not the frozen w15_v1 base58 keypair format.', {
      code: 'invalid_secret_encoding',
    });
  }

  if (decoded.byteLength !== WALLET_SECRET_DECODED_BYTES) {
    zeroizeLocal(decoded);
    throw new WalletError('Decoded secret length is not a 64-byte Solana keypair.', {
      code: 'invalid_secret_length',
    });
  }

  const canonical = getBase58Decoder().decode(decoded);
  if (canonical !== secret) {
    zeroizeLocal(decoded);
    throw new WalletError('Secret encoding is not the frozen w15_v1 canonical base58 keypair format.', {
      code: 'invalid_secret_encoding',
    });
  }

  return decoded;
}

function zeroizeLocal(bytes: Uint8Array): void {
  bytes.fill(0);
}
