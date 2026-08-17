import { isBlockhashExpired } from '../execution/fee.js';
import { buildJupiterRequest } from '../execution/jupiter-request.js';
import { validateJupiterBuild } from '../execution/jupiter-validate.js';
import { simulateNormalizedBuildWithFinalCompiled } from '../execution/simulator.js';
import type { CompiledUnsignedCandidate } from '../execution/transaction.js';
import type { ExecutionIntent, ExecutionRpc, ExecutionSimulateReport, JupiterClient } from '../execution/types.js';
import { WALLET_SPEC_NAME, WALLET_SPEC_VERSION } from './constants.js';
import { WalletError } from './errors.js';
import {
  WALLET_DEFINITION_FINGERPRINT,
  fingerprintSignedTransaction,
  fingerprintWalletSigner,
  fingerprintWalletSigningProof,
  sha256Bytes,
} from './identity.js';
import { assertPublicValueHasNoBinaryArtifact } from './sanitize.js';
import { withInteractiveSigner, type SecretPrompt } from './signer-scope.js';
import type { CandidateBinding, WalletPreflightSignReport, WalletSigningProof } from './types.js';
import { assertCompiledSignerSet, signAndVerifyTransaction } from './verify.js';
import { zeroizeBytes } from './zeroize.js';

export type SignPreflightHooks = {
  afterFinalPreflight?: (compiled: CompiledUnsignedCandidate) => void;
  afterSignBeforeProof?: () => void;
  onFinalSimulatedMessageSha256?: (hash: string) => void;
  onSignedMessageSha256?: (hash: string) => void;
  onSignTransactions?: () => void;
};

export function captureCandidateBinding(
  report: ExecutionSimulateReport,
  requiredSignerAddress: string,
): CandidateBinding {
  if (report.status !== 'simulation_passed' || report.finalComputeUnitLimit === null) {
    throw new WalletError('Checkpoint 15 will not sign unless e14 status is simulation_passed.', {
      code: 'preflight_not_passed',
    });
  }
  return {
    executionDefinitionFingerprint: report.executionDefinitionFingerprint,
    executionIntentFingerprint: report.executionIntentFingerprint,
    jupiterBuildFingerprint: report.jupiterBuildFingerprint,
    executionCandidateFingerprint: report.executionCandidateFingerprint,
    compiledMessageSha256: report.candidate.compiledMessageSha256,
    finalComputeUnitLimit: report.finalComputeUnitLimit,
    blockhashBase58: report.candidate.blockhashBase58,
    lastValidBlockHeight: report.candidate.lastValidBlockHeight.toString(),
    feePayer: report.candidate.feePayer,
    takerPublicKey: report.intent.takerPublicKey,
    requiredSignerCount: 1,
    requiredSignerAddress,
  };
}

export function freezePreflightArtifacts(
  report: ExecutionSimulateReport,
  compiled: CompiledUnsignedCandidate,
): void {
  deepFreeze(report);
  deepFreeze(report.candidate);
  deepFreeze(compiled);
  deepFreeze(compiled.candidate);
  deepFreeze(compiled.compiledTransaction);
}

export function assertCandidateBindingUnchanged(
  bound: CandidateBinding,
  report: ExecutionSimulateReport,
  compiledMessageSha256: string,
  requiredSignerAddress: string,
): void {
  const current = captureCandidateBinding(report, requiredSignerAddress);
  if (
    JSON.stringify(bound) !== JSON.stringify(current) ||
    bound.compiledMessageSha256 !== compiledMessageSha256
  ) {
    throw new WalletError(
      'The exact e14 preflight candidate changed after simulation. Signing was refused.',
      { code: 'candidate_changed_after_preflight' },
    );
  }
}

export async function executeWalletSignPreflight(input: {
  intent: ExecutionIntent;
  jupiter: JupiterClient;
  rpc: ExecutionRpc;
  promptSecret: SecretPrompt;
  signal?: AbortSignal;
  hooks?: SignPreflightHooks;
}): Promise<WalletPreflightSignReport> {
  const payload = await input.jupiter.build(buildJupiterRequest(input.intent));
  const build = validateJupiterBuild(payload, input.intent);
  const artifacts = await simulateNormalizedBuildWithFinalCompiled({
    intent: input.intent,
    build,
    rpc: input.rpc,
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  });
  const report = artifacts.report;
  const finalCompiled = artifacts.finalCompiled;

  if (report.status !== 'simulation_passed' || report.finalComputeUnitLimit === null) {
    throw new WalletError(
      `Checkpoint 15 will not request a wallet secret unless e14 status is simulation_passed. Observed: ${report.status}.`,
      { code: 'preflight_not_passed' },
    );
  }

  const bound = captureCandidateBinding(report, input.intent.takerPublicKey);
  const certifiedMessageSha256 = sha256Bytes(Uint8Array.from(finalCompiled.compiledTransaction.messageBytes));
  input.hooks?.onFinalSimulatedMessageSha256?.(certifiedMessageSha256);
  if (
    certifiedMessageSha256 !== bound.compiledMessageSha256 ||
    certifiedMessageSha256 !== finalCompiled.candidate.compiledMessageSha256
  ) {
    throw new WalletError(
      'The exact e14 preflight candidate changed after simulation. Signing was refused.',
      { code: 'candidate_changed_after_preflight' },
    );
  }

  input.hooks?.afterFinalPreflight?.(finalCompiled);
  freezePreflightArtifacts(report, finalCompiled);
  await assertBlockhashStillValid(input.rpc, report.candidate.lastValidBlockHeight, input.signal);

  return withInteractiveSigner(
    input.intent.takerPublicKey,
    async (signer) => {
      await assertBlockhashStillValid(input.rpc, report.candidate.lastValidBlockHeight, input.signal);
      if (signer.address !== bound.takerPublicKey || signer.address !== bound.feePayer) {
        throw new WalletError(
          'Signer address does not match EXECUTION_TAKER_PUBKEY. The secret was not used to sign.',
          { code: 'signer_address_mismatch' },
        );
      }

      const liveMessageSha256 = sha256Bytes(Uint8Array.from(finalCompiled.compiledTransaction.messageBytes));
      input.hooks?.onSignedMessageSha256?.(liveMessageSha256);
      if (liveMessageSha256 !== certifiedMessageSha256) {
        throw new WalletError(
          'The exact e14 preflight candidate changed after simulation. Signing was refused.',
          { code: 'candidate_changed_after_preflight' },
        );
      }
      assertCandidateBindingUnchanged(bound, report, liveMessageSha256, signer.address);
      assertCompiledSignerSet(finalCompiled.compiledTransaction, signer.address);
      if (finalCompiled.candidate.feePayer !== signer.address) {
        throw new WalletError(
          'Compiled required-signer set is not exactly the configured taker / signer address.',
          { code: 'compiled_signer_mismatch' },
        );
      }

      input.hooks?.onSignTransactions?.();
      const signature = await signAndVerifyTransaction({
        signer,
        transaction: finalCompiled.compiledTransaction,
        expectedAddress: signer.address,
      });
      try {
        input.hooks?.afterSignBeforeProof?.();
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
        const result: WalletPreflightSignReport = {
          specVersion: WALLET_SPEC_VERSION,
          specName: WALLET_SPEC_NAME,
          walletDefinitionFingerprint: WALLET_DEFINITION_FINGERPRINT,
          executionStatus: 'simulation_passed',
          proof,
        };
        assertPublicValueHasNoBinaryArtifact(result);
        return result;
      } finally {
        zeroizeBytes(signature);
      }
    },
    { promptSecret: input.promptSecret },
  );
}

async function assertBlockhashStillValid(
  rpc: Pick<ExecutionRpc, 'getBlockHeight'>,
  lastValidBlockHeight: bigint,
  signal?: AbortSignal,
): Promise<void> {
  let currentHeight: bigint;
  try {
    currentHeight = await rpc.getBlockHeight(signal);
  } catch {
    throw new WalletError('The e14 blockhash could not be rechecked before signing.', {
      code: 'blockhash_expired_before_signing',
    });
  }
  if (typeof currentHeight !== 'bigint') {
    throw new WalletError('The e14 blockhash could not be rechecked before signing.', {
      code: 'blockhash_expired_before_signing',
    });
  }
  if (isBlockhashExpired(currentHeight, lastValidBlockHeight)) {
    throw new WalletError(
      'The e14 blockhash expired before signing. Re-run the command. The signer was not kept unlocked for a rebuild.',
      { code: 'blockhash_expired_before_signing' },
    );
  }
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== 'object' || ArrayBuffer.isView(value)) {
    return value;
  }
  Object.freeze(value);
  if (Array.isArray(value)) {
    for (const item of value) {
      deepFreeze(item);
    }
    return value;
  }
  for (const item of Object.values(value)) {
    deepFreeze(item);
  }
  return value;
}
