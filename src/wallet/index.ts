/**
 * Public Checkpoint 15 wallet surface.
 *
 * Low-level signer, decode, TTY, and verification helpers are internal modules.
 * They remain importable by relative path for tests, but they are not a supported
 * application API. Unrelated business code must not obtain a generic signer.
 */
export {
  assertNoExtraWalletArguments,
  executeWalletSignTest,
  executeWalletStatus,
  executeWalletVerify,
  runWalletSignPreflight,
} from './command.js';
export {
  WALLET_BACKEND,
  WALLET_CHECKPOINT,
  WALLET_SIGNING_PURPOSES,
  WALLET_SPEC_NAME,
  WALLET_SPEC_VERSION,
  WALLET_TRADING_ENABLED_REFUSAL,
} from './constants.js';
export {
  canonicalWalletDefinition,
  mutateCanonicalWalletDefinition,
  type CanonicalWalletDefinition,
} from './definition.js';
export { WalletError, WALLET_ERROR_CODES, type WalletErrorCode } from './errors.js';
export {
  formatWalletSignPreflightLines,
  formatWalletSignTestLines,
  formatWalletStatusLines,
  formatWalletVerifyLines,
} from './format.js';
export {
  WALLET_DEFINITION_FINGERPRINT,
  fingerprintWalletChallenge,
  fingerprintWalletDefinition,
  fingerprintWalletSigner,
  fingerprintWalletSigningProof,
} from './identity.js';
export { executeWalletSignPreflight } from './preflight-sign.js';
export { formatWalletError } from './sanitize.js';
export type {
  WalletPreflightSignReport,
  WalletSelfTestProof,
  WalletSigningProof,
  WalletStatusReport,
  WalletVerifyReport,
} from './types.js';
