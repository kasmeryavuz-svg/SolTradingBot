import { getBase58Decoder, getBase64EncodedWireTransaction, type Transaction } from '@solana/kit';
import {
  assertCandidateBindingUnchanged,
  captureCandidateBinding,
  freezePreflightArtifacts,
} from '../wallet/preflight-sign.js';
import { sha256Bytes } from '../wallet/identity.js';
import { withInteractiveSigner, type SecretPrompt } from '../wallet/signer-scope.js';
import { assertCompiledSignerSet, signAndVerifyTransaction } from '../wallet/verify.js';
import { WALLET_DEFINITION_FINGERPRINT, fingerprintSignedTransaction, fingerprintWalletSigner, fingerprintWalletSigningProof } from '../wallet/identity.js';
import { WALLET_SPEC_VERSION } from '../wallet/constants.js';
import type { CompiledUnsignedCandidate } from '../execution/transaction.js';
import type { ExecutionSimulateReport } from '../execution/types.js';
import type { WalletSigningProof } from '../wallet/types.js';
import { zeroizeBytes } from '../wallet/zeroize.js';
import { LiveError } from './errors.js';
import { signedWireSha256FromBase64 } from './identity.js';
import { assertPublicValueHasNoWire } from './sanitize.js';
import type { LiveSignedHandoff } from './types.js';

/**
 * Privileged l16 signing bridge.
 *
 * Only `src/live/**` may import this module. It consumes the exact e14 final
 * compiled transaction, uses the hidden interactive w15 signer, and passes
 * signed bytes only into the scoped callback. The callback return value must
 * be public evidence only.
 */
export async function withExactLiveSignedTransaction<T>(
  input: {
    expectedTaker: string;
    report: ExecutionSimulateReport;
    compiled: CompiledUnsignedCandidate;
    promptSecret: SecretPrompt;
    consume: (handoff: LiveSignedHandoff) => Promise<T>;
  },
): Promise<T> {
  const bound = captureCandidateBinding(input.report, input.expectedTaker);
  const certifiedMessageSha256 = sha256Bytes(Uint8Array.from(input.compiled.compiledTransaction.messageBytes));
  if (
    certifiedMessageSha256 !== bound.compiledMessageSha256 ||
    certifiedMessageSha256 !== input.compiled.candidate.compiledMessageSha256
  ) {
    throw new LiveError('The exact e14 candidate changed before live signing.', { code: 'candidate_changed' });
  }
  freezePreflightArtifacts(input.report, input.compiled);

  return withInteractiveSigner(
    input.expectedTaker,
    async (signer) => {
      if (signer.address !== bound.takerPublicKey || signer.address !== bound.feePayer) {
        throw new LiveError('Signer address does not match EXECUTION_TAKER_PUBKEY. No send.', {
          code: 'signer_mismatch',
        });
      }
      const liveMessageSha256 = sha256Bytes(Uint8Array.from(input.compiled.compiledTransaction.messageBytes));
      if (liveMessageSha256 !== certifiedMessageSha256) {
        throw new LiveError('The exact e14 candidate changed before live signing.', { code: 'candidate_changed' });
      }
      try {
        assertCandidateBindingUnchanged(bound, input.report, liveMessageSha256, signer.address);
      } catch {
        throw new LiveError('The exact e14 candidate changed before live signing.', { code: 'candidate_changed' });
      }
      assertCompiledSignerSet(input.compiled.compiledTransaction, signer.address);

      const signature = await signAndVerifyTransaction({
        signer,
        transaction: input.compiled.compiledTransaction,
        expectedAddress: signer.address,
      });
      let signedWireBytes: Uint8Array | undefined;
      try {
        const signedTransaction = attachSignature(
          input.compiled.compiledTransaction,
          signer.address,
          signature,
        );
        const signedWireBase64 = getBase64EncodedWireTransaction(signedTransaction);
        signedWireBytes = Uint8Array.from(Buffer.from(signedWireBase64, 'base64'));
        const expectedSignature = getBase58Decoder().decode(signature);
        const unsignedProof = {
          walletSpecVersion: WALLET_SPEC_VERSION,
          walletDefinitionFingerprint: WALLET_DEFINITION_FINGERPRINT,
          signerAddress: signer.address,
          walletSignerFingerprint: fingerprintWalletSigner(signer.address),
          purpose: 'exact_e14_final_preflight_candidate' as const,
          executionDefinitionFingerprint: bound.executionDefinitionFingerprint,
          executionIntentFingerprint: bound.executionIntentFingerprint,
          jupiterBuildFingerprint: bound.jupiterBuildFingerprint,
          executionCandidateFingerprint: bound.executionCandidateFingerprint,
          compiledMessageSha256: liveMessageSha256,
          signatureVerified: true as const,
          signedTransactionFingerprint: fingerprintSignedTransaction({
            executionCandidateFingerprint: bound.executionCandidateFingerprint,
            signerAddress: signer.address,
            signatureBytes: signature,
          }),
        };
        const proof: WalletSigningProof = {
          ...unsignedProof,
          walletSigningProofFingerprint: fingerprintWalletSigningProof(unsignedProof),
        };
        const handoff: LiveSignedHandoff = {
          expectedSignature,
          signedWireSha256: signedWireSha256FromBase64(signedWireBase64),
          signedWireBase64,
          signedWireBytes,
          proof,
        };
        const result = await input.consume(handoff);
        assertPublicValueHasNoWire(result);
        return result;
      } finally {
        signature.fill(0);
        if (signedWireBytes !== undefined) {
          zeroizeBytes(signedWireBytes);
        }
      }
    },
    { promptSecret: input.promptSecret },
  );
}

function attachSignature(transaction: Transaction, signerAddress: string, signature: Uint8Array): Transaction {
  const signed: Transaction = Object.freeze({
    ...transaction,
    signatures: Object.freeze({
      ...transaction.signatures,
      [signerAddress]: signature,
    }),
  });
  return signed;
}
