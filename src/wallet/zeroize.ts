/**
 * Best-effort zeroization of mutable buffers we control.
 *
 * JavaScript strings and WebCrypto / Kit signer internals cannot be guaranteed
 * to be overwritten by userland code. This helper only fills arrays and Buffers
 * that this process allocated or was given ownership of.
 */
export function zeroizeBytes(bytes: Uint8Array | Buffer): void {
  bytes.fill(0);
}

export function zeroizeByteArrays(buffers: readonly (Uint8Array | Buffer | null | undefined)[]): void {
  for (const buffer of buffers) {
    if (buffer !== null && buffer !== undefined) {
      zeroizeBytes(buffer);
    }
  }
}
