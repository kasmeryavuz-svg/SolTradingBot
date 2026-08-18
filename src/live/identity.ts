import { createHash } from 'node:crypto';
import { LIVE_SPEC_VERSION } from './constants.js';
import { canonicalLiveDefinition, type CanonicalLiveDefinition } from './definition.js';
import type { LiveAttemptStatus } from './types.js';

export function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Json(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function fingerprintLiveDefinition(
  definition: CanonicalLiveDefinition = canonicalLiveDefinition(),
): string {
  return sha256Json(definition);
}

export const LIVE_DEFINITION_FINGERPRINT = fingerprintLiveDefinition();

export function liveAttemptId(executionCandidateFingerprint: string): string {
  return sha256Json({
    liveSpecVersion: LIVE_SPEC_VERSION,
    liveDefinitionFingerprint: LIVE_DEFINITION_FINGERPRINT,
    executionCandidateFingerprint,
  });
}

export function fingerprintLiveAttempt(input: {
  liveDefinitionFingerprint: string;
  executionCandidateFingerprint: string;
  attemptId: string;
}): string {
  return sha256Json({
    liveSpecVersion: LIVE_SPEC_VERSION,
    liveDefinitionFingerprint: input.liveDefinitionFingerprint,
    executionCandidateFingerprint: input.executionCandidateFingerprint,
    attemptId: input.attemptId,
  });
}

export function fingerprintLiveReceipt(input: {
  liveDefinitionFingerprint: string;
  executionCandidateFingerprint: string;
  walletSigningProofFingerprint: string | null;
  expectedSignature: string | null;
  rpcReturnedSignature: string | null;
  signedWireSha256: string | null;
  confirmationStatus: string | null;
  slot: string | null;
  rpcEstimatedTransactionFeeLamports: string | null;
  actualTransactionFeeLamports: string | null;
  actualOutputRaw: string | null;
  status: LiveAttemptStatus;
}): string {
  return sha256Json({
    liveSpecVersion: LIVE_SPEC_VERSION,
    liveDefinitionFingerprint: input.liveDefinitionFingerprint,
    executionCandidateFingerprint: input.executionCandidateFingerprint,
    walletSigningProofFingerprint: input.walletSigningProofFingerprint,
    expectedSignature: input.expectedSignature,
    rpcReturnedSignature: input.rpcReturnedSignature,
    signedWireSha256: input.signedWireSha256,
    confirmationStatus: input.confirmationStatus,
    slot: input.slot,
    rpcEstimatedTransactionFeeLamports: input.rpcEstimatedTransactionFeeLamports,
    actualTransactionFeeLamports: input.actualTransactionFeeLamports,
    actualOutputRaw: input.actualOutputRaw,
    status: input.status,
  });
}

export function signedWireSha256FromBase64(wireTransactionBase64: string): string {
  return sha256Bytes(Buffer.from(wireTransactionBase64, 'base64'));
}
