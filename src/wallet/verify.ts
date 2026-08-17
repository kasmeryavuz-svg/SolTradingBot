import {
  address,
  createSignableMessage,
  getPublicKeyFromAddress,
  signatureBytes,
  verifySignature,
} from '@solana/kit';
import { WalletError } from './errors.js';
import type { CompiledSignableTransaction, WalletSigner } from './types.js';

export async function verifyMessageSignature(input: {
  signerAddress: string;
  messageBytes: Uint8Array;
  signatureBytes: Uint8Array;
}): Promise<true> {
  if (!isUsableSignature(input.signatureBytes)) {
    throw new WalletError('Local signature verification failed.', {
      code: 'signature_verification_failed',
    });
  }
  const publicKey = await getPublicKeyFromAddress(address(input.signerAddress));
  const verified = await verifySignature(
    publicKey,
    signatureBytes(input.signatureBytes),
    input.messageBytes,
  );
  if (!verified) {
    throw new WalletError('Local signature verification failed.', {
      code: 'signature_verification_failed',
    });
  }
  return true;
}

export async function signAndVerifySelfTest(
  signer: WalletSigner,
  messageBytes: Uint8Array,
): Promise<Uint8Array> {
  const [dictionary] = await signer.signMessages([createSignableMessage(messageBytes)]);
  const raw = dictionary?.[signer.address];
  if (raw === undefined) {
    throw new WalletError('Self-test signature was missing.', { code: 'self_test_signature_failed' });
  }
  const signature = Uint8Array.from(raw);
  try {
    await verifyMessageSignature({
      signerAddress: signer.address,
      messageBytes,
      signatureBytes: signature,
    });
  } catch (error: unknown) {
    signature.fill(0);
    if (error instanceof WalletError && error.code === 'signature_verification_failed') {
      throw new WalletError('Self-test signature verification failed.', {
        code: 'self_test_signature_failed',
      });
    }
    throw error;
  }
  return signature;
}

export async function signAndVerifyTransaction(input: {
  signer: WalletSigner;
  transaction: CompiledSignableTransaction;
  expectedAddress: string;
}): Promise<Uint8Array> {
  assertCompiledSignerSet(input.transaction, input.expectedAddress);
  const messageBytes = Uint8Array.from(input.transaction.messageBytes);
  const [dictionary] = await input.signer.signTransactions([input.transaction]);
  const raw = dictionary?.[input.expectedAddress];
  if (raw === undefined) {
    throw new WalletError('Required transaction signature is missing.', {
      code: 'signature_verification_failed',
    });
  }
  const signature = Uint8Array.from(raw);
  try {
    assertPopulatedSignerSet(input.transaction, input.expectedAddress, signature);
    await verifyMessageSignature({
      signerAddress: input.expectedAddress,
      messageBytes,
      signatureBytes: signature,
    });
    return signature;
  } catch (error: unknown) {
    signature.fill(0);
    throw error;
  }
}

export function assertCompiledSignerSet(
  transaction: CompiledSignableTransaction,
  expectedAddress: string,
): void {
  const required = Object.keys(transaction.signatures);
  if (required.length !== 1 || required[0] !== expectedAddress) {
    throw new WalletError(
      'Compiled required-signer set is not exactly the configured taker / signer address.',
      { code: 'compiled_signer_mismatch' },
    );
  }
}

export function assertPopulatedSignerSet(
  transaction: CompiledSignableTransaction,
  expectedAddress: string,
  signature: Uint8Array,
): void {
  assertCompiledSignerSet(transaction, expectedAddress);
  if (!isUsableSignature(signature)) {
    throw new WalletError('Required transaction signature is missing.', {
      code: 'signature_verification_failed',
    });
  }
}

function isUsableSignature(value: Uint8Array): boolean {
  if (value.byteLength !== 64) {
    return false;
  }
  return value.some((byte) => byte !== 0);
}
