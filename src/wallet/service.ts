import type { AppConfig } from '../config/types.js';
import { WALLET_CHECKPOINT, WALLET_SPEC_NAME, WALLET_SPEC_VERSION } from './constants.js';
import { WalletError } from './errors.js';
import { WALLET_DEFINITION_FINGERPRINT, fingerprintWalletSigner } from './identity.js';
import type { WalletStatusReport, WalletVerifyReport } from './types.js';
import type { WalletSigner } from './types.js';

export function buildWalletStatusReport(config: AppConfig): WalletStatusReport {
  return {
    specVersion: WALLET_SPEC_VERSION,
    specName: WALLET_SPEC_NAME,
    walletDefinitionFingerprint: WALLET_DEFINITION_FINGERPRINT,
    checkpoint: WALLET_CHECKPOINT,
    backend: 'interactive_memory',
    secretSource: 'hidden_tty_only',
    secretPersisted: false,
    envPrivateKey: 'not_supported',
    filePrivateKey: 'not_supported',
    mnemonic: 'not_supported',
    configuredTakerPublicKey: config.execution.takerPublicKey,
    signingCapability: 'manual_local_only',
    broadcastCapability: 'unavailable',
    jitoSend: 'unavailable',
    dashboardSigning: 'unavailable',
    tradingEnabled: config.tradingEnabled,
  };
}

export function requireConfiguredTaker(config: AppConfig): string {
  if (config.execution.takerPublicKey === null) {
    throw new WalletError(
      'Checkpoint 15 requires EXECUTION_TAKER_PUBKEY. That value is the public trading address. There is no private-key environment variable.',
      { code: 'wallet_config_missing' },
    );
  }
  return config.execution.takerPublicKey;
}

export function buildWalletVerifyReport(signer: WalletSigner, takerPublicKey: string): WalletVerifyReport {
  return {
    specVersion: WALLET_SPEC_VERSION,
    specName: WALLET_SPEC_NAME,
    walletDefinitionFingerprint: WALLET_DEFINITION_FINGERPRINT,
    signerAddress: signer.address,
    configuredTakerPublicKey: takerPublicKey,
    matchesConfiguredTaker: true,
    walletSignerFingerprint: fingerprintWalletSigner(signer.address),
  };
}
