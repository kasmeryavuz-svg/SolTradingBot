import { getBase58Decoder, getBase58Encoder } from '@solana/kit';
import { sha256Bytes } from './identity.js';

const CANONICAL_BASE58 = /^[1-9A-HJ-NP-Za-km-z]+$/;

export function decodeCanonicalSignatureBytes(value: string): Uint8Array | null {
  if (typeof value !== 'string' || value.length === 0 || /\s/.test(value)) {
    return null;
  }
  if (!CANONICAL_BASE58.test(value)) {
    return null;
  }
  try {
    const bytes = Uint8Array.from(getBase58Encoder().encode(value));
    if (bytes.byteLength !== 64) {
      return null;
    }
    const recoded = getBase58Decoder().decode(bytes);
    if (recoded !== value) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

export function isCanonicalSolanaSignature(value: string): boolean {
  return decodeCanonicalSignatureBytes(value) !== null;
}

export function firstSignatureFromWireBytes(wire: Uint8Array): string | null {
  const parsed = readCompactU16(wire, 0);
  if (parsed === null || parsed.value < 1) {
    return null;
  }
  const start = parsed.offset;
  const end = start + 64;
  if (wire.byteLength < end) {
    return null;
  }
  return getBase58Decoder().decode(wire.subarray(start, end));
}

export function firstSignatureFromWireBase64(wireTransactionBase64: string): string | null {
  try {
    return firstSignatureFromWireBytes(Uint8Array.from(Buffer.from(wireTransactionBase64, 'base64')));
  } catch {
    return null;
  }
}

export function assertSignedWireIdentity(input: {
  signedWireBytes: Uint8Array;
  signedWireSha256: string;
  expectedSignature: string;
}): void {
  if (sha256Bytes(input.signedWireBytes) !== input.signedWireSha256) {
    throw new Error('signed-wire SHA-256 does not match the bytes about to be sent');
  }
  const first = firstSignatureFromWireBytes(input.signedWireBytes);
  if (first === null || first !== input.expectedSignature) {
    throw new Error('expected txid is not the first signature of the signed wire');
  }
}

function readCompactU16(bytes: Uint8Array, offset: number): { value: number; offset: number } | null {
  if (offset >= bytes.byteLength) {
    return null;
  }
  const first = bytes[offset];
  if (first === undefined) {
    return null;
  }
  if (first < 0x80) {
    return { value: first, offset: offset + 1 };
  }
  if (offset + 1 >= bytes.byteLength) {
    return null;
  }
  const second = bytes[offset + 1];
  if (second === undefined) {
    return null;
  }
  if (second < 0x80) {
    return { value: (first & 0x7f) + (second << 7), offset: offset + 2 };
  }
  if (offset + 2 >= bytes.byteLength) {
    return null;
  }
  const third = bytes[offset + 2];
  if (third === undefined || third > 0x03) {
    return null;
  }
  return { value: (first & 0x7f) + ((second & 0x7f) << 7) + (third << 14), offset: offset + 3 };
}
