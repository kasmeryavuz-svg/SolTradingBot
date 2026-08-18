import { abbreviateFingerprint, abbreviatePublicKey } from '../execution/format.js';
import type {
  WalletPreflightSignReport,
  WalletSelfTestProof,
  WalletStatusReport,
  WalletVerifyReport,
} from './types.js';

export function formatWalletStatusLines(report: WalletStatusReport): string[] {
  return [
    'WALLET SECURITY STATUS',
    'INTERACTIVE MEMORY SIGNER / NO BROADCAST',
    '',
    `Checkpoint: ${report.checkpoint}`,
    `Spec: ${report.specVersion}`,
    `Name: ${report.specName}`,
    `Definition fingerprint: ${report.walletDefinitionFingerprint}`,
    '',
    'Backend: interactive memory',
    'Secret source: hidden TTY only',
    'Secret persisted: NO',
    'Env private key: NOT SUPPORTED',
    'File private key: NOT SUPPORTED',
    'Mnemonic / seed phrase: NOT SUPPORTED',
    `Configured taker public key: ${
      report.configuredTakerPublicKey === null
        ? 'missing'
        : abbreviatePublicKey(report.configuredTakerPublicKey)
    }`,
    'Signing capability: manual/local only',
    'Wallet module broadcast capability: unavailable',
    'Jito send: unavailable',
    'Dashboard signing: unavailable',
    `TRADING_ENABLED: ${report.tradingEnabled ? 'true' : 'false'}`,
    '',
    'Checkpoint 15 signing is security-validation only.',
    'TRADING_ENABLED must remain false.',
    'Live broadcast, when enabled, is owned exclusively by l16',
  ];
}

export function formatWalletVerifyLines(report: WalletVerifyReport): string[] {
  return [
    'WALLET VERIFY',
    'PUBLIC RESULT ONLY / NO NETWORK / NO SIGN',
    '',
    `Spec: ${report.specVersion}`,
    `Signer address: ${report.signerAddress}`,
    'Matches configured taker: YES',
    `Signer fingerprint: ${abbreviateFingerprint(report.walletSignerFingerprint)}`,
    '',
    'The secret was not printed, stored, or used to sign a transaction.',
  ];
}

export function formatWalletSignTestLines(proof: WalletSelfTestProof): string[] {
  return [
    'WALLET SIGN TEST',
    'DOMAIN-SEPARATED SELF-TEST / NO NETWORK / NO BROADCAST',
    '',
    `Spec: ${proof.walletSpecVersion}`,
    `Signer address: ${proof.signerAddress}`,
    `Challenge fingerprint: ${abbreviateFingerprint(proof.challengeFingerprint)}`,
    `Signature fingerprint: ${abbreviateFingerprint(proof.signatureFingerprint)}`,
    'Verification: passed',
    `Proof fingerprint: ${abbreviateFingerprint(proof.walletSigningProofFingerprint)}`,
    '',
    'This signed a domain-separated challenge, not a transaction. Broadcast is unavailable.',
  ];
}

export function formatWalletSignPreflightLines(report: WalletPreflightSignReport): string[] {
  const proof = report.proof;
  return [
    'WALLET SIGN PREFLIGHT',
    'SIGNED IN MEMORY / NOT BROADCAST / NOT RETURNED',
    '',
    `Spec: ${report.specVersion}`,
    `e14 status: ${report.executionStatus}`,
    `Signer address: ${proof.signerAddress}`,
    `Candidate fingerprint: ${abbreviateFingerprint(proof.executionCandidateFingerprint)}`,
    `Compiled message: ${abbreviateFingerprint(proof.compiledMessageSha256)}`,
    `Signed transaction fingerprint: ${abbreviateFingerprint(proof.signedTransactionFingerprint)}`,
    'Signature verification: passed',
    `Proof fingerprint: ${abbreviateFingerprint(proof.walletSigningProofFingerprint)}`,
    '',
    'The signed wire was verified locally and discarded. Checkpoint 16 owns broadcast.',
  ];
}
