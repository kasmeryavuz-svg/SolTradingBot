import { SOLANA_MAINNET_GENESIS_HASH } from '../execution/constants.js';

export const WALLET_SPEC_VERSION = 'w15_v1';
export const WALLET_SPEC_NAME = 'interactive_in_memory_signer_security_boundary';
export const WALLET_CHECKPOINT = '15';

export const WALLET_BACKEND = 'interactive_memory' as const;
export const WALLET_SECRET_SOURCE = 'hidden_tty' as const;
export const WALLET_SECRET_ENCODING = 'base58' as const;
export const WALLET_SECRET_DECODED_BYTES = 64;
export const WALLET_SECRET_MAX_CHARS = 88;

export const WALLET_BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export const WALLET_SIGNING_PURPOSES = [
  'w15_self_test_challenge',
  'exact_e14_final_preflight_candidate',
] as const;

export const WALLET_CHALLENGE_DOMAIN = 'SolTradingBot';
export const WALLET_CHALLENGE_PURPOSE = 'signer-self-test';

export const WALLET_REQUIRED_MAINNET_GENESIS_HASH = SOLANA_MAINNET_GENESIS_HASH;

export const WALLET_TRADING_ENABLED_REFUSAL =
  'Checkpoint 15 signing is security-validation only. TRADING_ENABLED must remain false. Broadcast is unavailable until Checkpoint 16.';

export const WALLET_MISSING_TAKER_MESSAGE =
  'Checkpoint 15 requires EXECUTION_TAKER_PUBKEY. That value is the public trading address. There is no private-key environment variable.';

export const FORBIDDEN_ENV_SECRET_NAMES = [
  'WALLET_PRIVATE_KEY',
  'PRIVATE_KEY',
  'SECRET_KEY',
  'WALLET_SECRET',
  'WALLET_JSON',
  'SEED',
  'SEED_PHRASE',
  'MNEMONIC',
] as const;

export const FORBIDDEN_SECRET_FILE_NAMES = [
  'id.json',
  'wallet.json',
  'secret.json',
  '.env.wallet',
] as const;
