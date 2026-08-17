import type { Address, Transaction } from '@solana/kit';
import type { WalletErrorCode } from './errors.js';

export type WalletSigningPurpose =
  | 'w15_self_test_challenge'
  | 'exact_e14_final_preflight_candidate';

export type SignatureDictionary = Readonly<Record<string, Uint8Array>>;

export type SignableMessage = Readonly<{
  content: Uint8Array;
  signatures: SignatureDictionary;
}>;

export type CompiledSignableTransaction = Transaction;

/**
 * Narrow signer capability. Business code may know the public address and ask
 * for a signature. It must not see key storage, secret bytes, or a raw keypair.
 *
 * A future KMS / HSM / Keychain backend can satisfy this same boundary.
 */
export type WalletSigner = {
  readonly address: Address;
  signMessages(messages: readonly SignableMessage[]): Promise<readonly SignatureDictionary[]>;
  signTransactions(
    transactions: readonly CompiledSignableTransaction[],
  ): Promise<readonly SignatureDictionary[]>;
};

export type WalletStatusReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly walletDefinitionFingerprint: string;
  readonly checkpoint: string;
  readonly backend: 'interactive_memory';
  readonly secretSource: 'hidden_tty_only';
  readonly secretPersisted: false;
  readonly envPrivateKey: 'not_supported';
  readonly filePrivateKey: 'not_supported';
  readonly mnemonic: 'not_supported';
  readonly configuredTakerPublicKey: string | null;
  readonly signingCapability: 'manual_local_only';
  readonly broadcastCapability: 'unavailable';
  readonly jitoSend: 'unavailable';
  readonly dashboardSigning: 'unavailable';
  readonly tradingEnabled: boolean;
};

export type WalletVerifyReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly walletDefinitionFingerprint: string;
  readonly signerAddress: string;
  readonly configuredTakerPublicKey: string;
  readonly matchesConfiguredTaker: true;
  readonly walletSignerFingerprint: string;
};

export type WalletSelfTestProof = {
  readonly walletSpecVersion: string;
  readonly walletDefinitionFingerprint: string;
  readonly signerAddress: string;
  readonly walletSignerFingerprint: string;
  readonly purpose: 'w15_self_test_challenge';
  readonly challengeFingerprint: string;
  readonly signatureFingerprint: string;
  readonly signatureVerified: true;
  readonly walletSigningProofFingerprint: string;
};

export type WalletSigningProof = {
  readonly walletSpecVersion: string;
  readonly walletDefinitionFingerprint: string;
  readonly signerAddress: string;
  readonly walletSignerFingerprint: string;
  readonly purpose: 'exact_e14_final_preflight_candidate';
  readonly executionDefinitionFingerprint: string;
  readonly executionIntentFingerprint: string;
  readonly jupiterBuildFingerprint: string;
  readonly executionCandidateFingerprint: string;
  readonly compiledMessageSha256: string;
  readonly signatureVerified: true;
  readonly signedTransactionFingerprint: string;
  readonly walletSigningProofFingerprint: string;
};

export type WalletPreflightSignReport = {
  readonly specVersion: string;
  readonly specName: string;
  readonly walletDefinitionFingerprint: string;
  readonly executionStatus: 'simulation_passed';
  readonly proof: WalletSigningProof;
};

export type CandidateBinding = {
  readonly executionDefinitionFingerprint: string;
  readonly executionIntentFingerprint: string;
  readonly jupiterBuildFingerprint: string;
  readonly executionCandidateFingerprint: string;
  readonly compiledMessageSha256: string;
  readonly finalComputeUnitLimit: number;
  readonly blockhashBase58: string;
  readonly lastValidBlockHeight: string;
  readonly feePayer: string;
  readonly takerPublicKey: string;
  readonly requiredSignerCount: 1;
  readonly requiredSignerAddress: string;
};

export type WalletCommandFailure = {
  readonly code: WalletErrorCode;
  readonly message: string;
};
