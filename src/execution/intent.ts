import { isAddress } from '@solana/kit';
import { U64_MAX } from './constants.js';
import { ExecutionError } from './errors.js';
import type { ExecutionIntent } from './types.js';

export function isCanonicalSolanaAddress(value: string): boolean {
  return isAddress(value);
}

export function isCanonicalAmountRaw(value: string): boolean {
  if (!/^[1-9]\d*$/.test(value)) {
    return false;
  }
  try {
    const parsed = BigInt(value);
    return parsed > 0n && parsed <= U64_MAX;
  } catch {
    return false;
  }
}

export function validateExecutionIntent(input: {
  inputMint: string;
  outputMint: string;
  amountRaw: string;
  takerPublicKey: string;
}): ExecutionIntent {
  if (!isCanonicalSolanaAddress(input.inputMint)) {
    throw new ExecutionError('Invalid execution input mint. Expected a valid Solana address.', {
      code: 'invalid_intent',
    });
  }
  if (!isCanonicalSolanaAddress(input.outputMint)) {
    throw new ExecutionError('Invalid execution output mint. Expected a valid Solana address.', {
      code: 'invalid_intent',
    });
  }
  if (input.inputMint === input.outputMint) {
    throw new ExecutionError('Execution input mint and output mint must be different.', {
      code: 'invalid_intent',
    });
  }
  if (!isCanonicalAmountRaw(input.amountRaw)) {
    throw new ExecutionError(
      'Invalid execution amountRaw. Expected a canonical positive decimal integer string in native token units.',
      { code: 'invalid_intent' },
    );
  }
  if (!isCanonicalSolanaAddress(input.takerPublicKey)) {
    throw new ExecutionError('Invalid execution taker public key. Expected a valid Solana address.', {
      code: 'invalid_intent',
    });
  }

  return {
    inputMint: input.inputMint,
    outputMint: input.outputMint,
    amountRaw: input.amountRaw,
    takerPublicKey: input.takerPublicKey,
  };
}
