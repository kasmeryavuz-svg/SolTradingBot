import { USDC_MINT, WRAPPED_SOL_MINT } from '../config/defaults.js';
import { SOLANA_MAINNET_GENESIS_HASH } from '../execution/constants.js';

export const LIVE_SPEC_VERSION = 'l16_v1';
export const LIVE_SPEC_NAME = 'manual_single_shot_tiny_mainnet_rpc_broadcast';
export const LIVE_CHECKPOINT = '16';

export const LIVE_INPUT_MINT = WRAPPED_SOL_MINT;
export const LIVE_OUTPUT_MINT = USDC_MINT;
export const LIVE_PAIR_LABEL = 'WSOL → USDC ONLY';

export const LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT = 1_000_000n;
export const LIVE_MAX_BROADCAST_INPUT_LAMPORTS_PER_UTC_DAY = 2_000_000n;
export const LIVE_MAX_BROADCAST_ATTEMPTS_PER_UTC_DAY = 2;
export const LIVE_MAX_RPC_TRANSACTION_FEE_LAMPORTS = 100_000n;
export const LIVE_MAX_PRIORITY_COMPONENT_LAMPORTS = 50_000n;
export const LIVE_MIN_SOL_BALANCE_BEFORE_LAMPORTS = 10_000_000n;

export const LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_CONFIRM = 25n;
export const LIVE_MIN_BLOCKHEIGHT_HEADROOM_BEFORE_SEND = 10n;

export const LIVE_SEND_ENCODING = 'base64' as const;
export const LIVE_SKIP_PREFLIGHT = false;
export const LIVE_PREFLIGHT_COMMITMENT = 'confirmed' as const;
export const LIVE_MAX_RETRIES = 0;
export const LIVE_BALANCE_COMMITMENT = 'confirmed' as const;
export const LIVE_BLOCK_HEIGHT_COMMITMENT = 'confirmed' as const;
export const LIVE_MIN_CONTEXT_SLOT_POLICY = 'omitted_e14_has_no_public_simulation_context_slot' as const;

export const LIVE_SEND_TIMEOUT_MS = 10_000;
export const LIVE_RPC_REQUEST_TIMEOUT_MS = 10_000;

export const LIVE_CONFIRMATION_POLL_INTERVAL_MS = 750;
export const LIVE_CONFIRMATION_TIMEOUT_MS = 30_000;
export const LIVE_TRACKER_SEARCH_TRANSACTION_HISTORY = false;
export const LIVE_RECONCILE_SEARCH_TRANSACTION_HISTORY = true;
export const LIVE_GET_TRANSACTION_MAX_SUPPORTED_VERSION = 0;
export const LIVE_GET_TRANSACTION_ENCODING = 'base64' as const;
export const LIVE_GET_TRANSACTION_COMMITMENT = 'confirmed' as const;

export const LIVE_REQUIRED_MAINNET_GENESIS_HASH = SOLANA_MAINNET_GENESIS_HASH;
export const LIVE_BROADCASTER = 'standard_solana_rpc' as const;

export const LIVE_CONFIRMATION_PREFIX = 'LIVE SEND';
export const LIVE_CANDIDATE_SHORT_ID_CHARS = 8;
export const LIVE_CONFIRMATION_MAX_CHARS = 128;

export const LIVE_HISTORY_LIMIT = 20;
export const LIVE_RECONCILE_MAX_ROWS_PER_INVOCATION = 1;
export const LIVE_RECONCILE_ORDER = 'oldest_first' as const;

export const LIVE_TRADING_DISABLED_REFUSAL =
  'Checkpoint 16 live:execute requires TRADING_ENABLED=true and LIVE_BROADCAST_ENABLED=true. Preview, status, history, and reconcile cannot send.';
export const LIVE_BROADCAST_DISABLED_REFUSAL =
  'Checkpoint 16 live:execute requires LIVE_BROADCAST_ENABLED=true. This flag is not a size override and does not skip TTY confirmation.';
export const LIVE_UNSUPPORTED_PAIR_MESSAGE =
  'l16_v1 supports only Wrapped SOL → mainnet USDC. Other pairs are unsupported_live_pair.';
export const LIVE_DATABASE_DISABLED_MESSAGE =
  'Live broadcast accounting requires DATABASE_ENABLED=true. There is no in-memory live reservation.';

export const FORBIDDEN_LIVE_CONFIRM_FLAGS = ['--yes', '-y', '--confirm', '--auto', '--signature', '--txid', '--candidate'] as const;
export const FORBIDDEN_LIVE_CONFIRM_ENV = [
  'AUTO_CONFIRM',
  'LIVE_AUTO_CONFIRM',
  'LIVE_CONFIRM',
  'YES',
  'CI',
  'CONFIRM',
] as const;

export const LIVE_BROADCAST_RISK_STATUSES = [
  'broadcast_submitting',
  'broadcast_submitted',
  'broadcast_outcome_unknown',
  'broadcast_rejected',
  'broadcast_pending',
  'rpc_signature_mismatch',
  'confirmed',
  'finalized',
  'failed_on_chain',
  'expired_unconfirmed',
  'expired_after_submission',
  'confirmation_integrity_error',
  'receipt_integrity_error',
  'confirmed_receipt_pending',
  'receipt_fee_anomaly',
] as const;

export const LIVE_UNRESOLVED_STATUSES = [
  'broadcast_submitting',
  'broadcast_submitted',
  'broadcast_outcome_unknown',
  'broadcast_pending',
  'rpc_signature_mismatch',
  'confirmed_receipt_pending',
] as const;

export const LIVE_MAY_HAVE_SENT_STATUSES = LIVE_BROADCAST_RISK_STATUSES;

export const LIVE_COUNT_TOWARD_DAILY_STATUSES = LIVE_BROADCAST_RISK_STATUSES;
