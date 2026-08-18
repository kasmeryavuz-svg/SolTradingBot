import type { AppConfig, EnvSource } from '../config/types.js';
import { isCanonicalAmountRaw } from '../execution/intent.js';
import type { ExecutionIntent } from '../execution/types.js';
import {
  FORBIDDEN_LIVE_CONFIRM_ENV,
  FORBIDDEN_LIVE_CONFIRM_FLAGS,
  LIVE_BROADCAST_DISABLED_REFUSAL,
  LIVE_INPUT_MINT,
  LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT,
  LIVE_OUTPUT_MINT,
  LIVE_TRADING_DISABLED_REFUSAL,
  LIVE_UNSUPPORTED_PAIR_MESSAGE,
} from './constants.js';
import { LiveError } from './errors.js';

export function assertNoExtraLiveArguments(argv: readonly string[], command: string): void {
  const extras = argv.slice(2).filter((value) => value.trim() !== '');
  if (extras.length > 0) {
    throw new LiveError(`Unexpected extra arguments. Usage: npm run ${command}`, {
      code: 'unexpected_arguments',
    });
  }
  assertNoConfirmationBypassArgs(argv);
}

export function assertNoConfirmationBypassArgs(argv: readonly string[]): void {
  const extras = argv.slice(2).map((value) => value.trim());
  for (const flag of FORBIDDEN_LIVE_CONFIRM_FLAGS) {
    if (extras.includes(flag)) {
      throw new LiveError(
        'l16_v1 refuses confirmation bypass flags. Interactive TTY confirmation is required.',
        { code: 'confirmation_bypass_refused' },
      );
    }
  }
}

export function assertNoConfirmationBypassEnv(source: EnvSource): void {
  for (const name of FORBIDDEN_LIVE_CONFIRM_ENV) {
    const raw = source[name];
    if (raw !== undefined && raw.trim() !== '') {
      throw new LiveError(
        'l16_v1 refuses environment confirmation bypass. Interactive TTY confirmation is required.',
        { code: 'confirmation_bypass_refused' },
      );
    }
  }
}

export function assertLiveExecuteGates(config: AppConfig): void {
  if (!config.tradingEnabled) {
    throw new LiveError(LIVE_TRADING_DISABLED_REFUSAL, { code: 'trading_disabled' });
  }
  if (!config.liveBroadcastEnabled) {
    throw new LiveError(LIVE_BROADCAST_DISABLED_REFUSAL, { code: 'live_broadcast_disabled' });
  }
}

export function assertMainnetLiveNetwork(config: AppConfig): void {
  if (config.solana.network !== 'mainnet-beta') {
    throw new LiveError('l16_v1 refuses non-mainnet-beta SOLANA_NETWORK.', {
      code: 'unsupported_network',
    });
  }
}

export function assertLivePair(intent: Pick<ExecutionIntent, 'inputMint' | 'outputMint'>): void {
  if (intent.inputMint !== LIVE_INPUT_MINT || intent.outputMint !== LIVE_OUTPUT_MINT) {
    throw new LiveError(LIVE_UNSUPPORTED_PAIR_MESSAGE, { code: 'unsupported_live_pair' });
  }
}

export function parseLiveAmountLamports(amountRaw: string): bigint {
  if (!isCanonicalAmountRaw(amountRaw)) {
    throw new LiveError('l16_v1 amountRaw must be a canonical positive integer string.', {
      code: 'amount_over_cap',
    });
  }
  return BigInt(amountRaw);
}

export function assertLiveAmount(amountRaw: string): bigint {
  const amount = parseLiveAmountLamports(amountRaw);
  if (amount > LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT) {
    throw new LiveError(
      `l16_v1 refuses amountRaw above ${LIVE_MAX_INPUT_LAMPORTS_PER_ATTEMPT.toString()} lamports.`,
      { code: 'amount_over_cap' },
    );
  }
  return amount;
}

export function assertLiveIntent(intent: ExecutionIntent): bigint {
  assertLivePair(intent);
  return assertLiveAmount(intent.amountRaw);
}
