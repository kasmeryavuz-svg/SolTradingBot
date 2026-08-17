import { getUtf8Encoder } from '@solana/kit';
import {
  WALLET_CHALLENGE_DOMAIN,
  WALLET_CHALLENGE_PURPOSE,
  WALLET_SPEC_VERSION,
} from './constants.js';
import { fingerprintWalletChallenge } from './identity.js';

export type WalletChallenge = {
  readonly text: string;
  readonly bytes: Uint8Array;
  readonly fingerprint: string;
};

/**
 * Domain-separated self-test challenge. This is UTF-8 text, not transaction
 * bytes, and is never taken from stdin or a user-controlled message command.
 */
export function createWalletSelfTestChallenge(signerAddress: string): WalletChallenge {
  const text = [
    WALLET_CHALLENGE_DOMAIN,
    WALLET_SPEC_VERSION,
    WALLET_CHALLENGE_PURPOSE,
    signerAddress,
  ].join('\n');
  const bytes = new Uint8Array(getUtf8Encoder().encode(text));
  return {
    text,
    bytes,
    fingerprint: fingerprintWalletChallenge(bytes),
  };
}
