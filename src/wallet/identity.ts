import { createHash } from 'node:crypto';
import { WALLET_BACKEND, WALLET_SPEC_VERSION } from './constants.js';
import { canonicalWalletDefinition, type CanonicalWalletDefinition } from './definition.js';
import type { WalletSelfTestProof, WalletSigningProof } from './types.js';

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function fingerprintWalletDefinition(
  definition: CanonicalWalletDefinition = canonicalWalletDefinition(),
): string {
  return sha256Json(definition);
}

export const WALLET_DEFINITION_FINGERPRINT = fingerprintWalletDefinition();

export function fingerprintWalletSigner(signerAddress: string): string {
  return sha256Json({
    walletSpecVersion: WALLET_SPEC_VERSION,
    backend: WALLET_BACKEND,
    signerAddress,
  });
}

export function fingerprintWalletChallenge(challengeBytes: Uint8Array): string {
  return sha256Bytes(challengeBytes);
}

export function fingerprintSignature(signatureBytes: Uint8Array): string {
  return sha256Bytes(signatureBytes);
}

export function fingerprintSignedTransaction(input: {
  executionCandidateFingerprint: string;
  signerAddress: string;
  signatureBytes: Uint8Array;
}): string {
  return sha256Json({
    executionCandidateFingerprint: input.executionCandidateFingerprint,
    signerAddress: input.signerAddress,
    signatureSha256: fingerprintSignature(input.signatureBytes),
  });
}

export function fingerprintWalletSigningProof(
  proof:
    | Omit<WalletSigningProof, 'walletSigningProofFingerprint'>
    | Omit<WalletSelfTestProof, 'walletSigningProofFingerprint'>,
): string {
  return sha256Json(proof);
}
