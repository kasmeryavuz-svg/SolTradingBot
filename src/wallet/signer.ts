import { timingSafeEqual } from 'node:crypto';
import {
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  getAddressEncoder,
  type Address,
  type Transaction,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
} from '@solana/kit';
import { WalletError } from './errors.js';
import type { CompiledSignableTransaction, SignableMessage, WalletSigner } from './types.js';

/**
 * Official current Kit API for restoring an in-memory signer from 64 keypair bytes:
 * `createKeyPairSignerFromBytes`. Official layout is 32-byte private + 32-byte public.
 * Kit's `createKeyPairFromBytes` also rejects a public half that does not verify
 * against the private half (`PUBLIC_KEY_MUST_MATCH_PRIVATE_KEY`).
 *
 * w15 additionally derives the public address from the private 32 bytes via
 * `createKeyPairSignerFromPrivateKeyBytes` and requires the embedded public half
 * to match before any wallet operation.
 *
 * The raw `KeyPairSigner.keyPair` is not exposed.
 */
export async function createWalletSignerFromSecretBytes(secretBytes: Uint8Array): Promise<WalletSigner> {
  if (secretBytes.byteLength !== 64) {
    throw new WalletError('Decoded secret length is not a 64-byte Solana keypair.', {
      code: 'invalid_secret_length',
    });
  }

  await assertPublicHalfMatchesPrivate(secretBytes);

  try {
    const kitSigner = await createKeyPairSignerFromBytes(secretBytes);
    return wrapKitSigner(kitSigner.address, kitSigner);
  } catch (error: unknown) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError('The interactive signer could not be created from the supplied secret.', {
      code: 'signer_unavailable',
    });
  }
}

export async function assertPublicHalfMatchesPrivate(secretBytes: Uint8Array): Promise<void> {
  const privateCopy = Uint8Array.from(secretBytes.subarray(0, 32));
  const embeddedPublic = Uint8Array.from(secretBytes.subarray(32, 64));
  try {
    const derived = await createKeyPairSignerFromPrivateKeyBytes(privateCopy);
    const derivedPublic = new Uint8Array(getAddressEncoder().encode(derived.address));
    if (derivedPublic.byteLength !== 32 || !timingSafeEqual(derivedPublic, embeddedPublic)) {
      throw new WalletError('Decoded 64-byte keypair public half does not match the private component.', {
        code: 'invalid_secret_encoding',
      });
    }
  } catch (error: unknown) {
    if (error instanceof WalletError) {
      throw error;
    }
    throw new WalletError('Decoded 64-byte keypair public half does not match the private component.', {
      code: 'invalid_secret_encoding',
    });
  } finally {
    privateCopy.fill(0);
  }
}

function wrapKitSigner(
  signerAddress: Address,
  kitSigner: {
    signMessages: WalletSigner['signMessages'];
    signTransactions: (
      transactions: readonly (Transaction & TransactionWithinSizeLimit & TransactionWithLifetime)[],
    ) => Promise<readonly Readonly<Record<string, Uint8Array>>[]>;
  },
): WalletSigner {
  return {
    address: signerAddress,
    signMessages(messages: readonly SignableMessage[]) {
      return kitSigner.signMessages(messages);
    },
    async signTransactions(transactions: readonly CompiledSignableTransaction[]) {
      return kitSigner.signTransactions(
        transactions as unknown as readonly (Transaction &
          TransactionWithinSizeLimit &
          TransactionWithLifetime)[],
      );
    },
  };
}

export function assertSignerMatchesTaker(signer: WalletSigner, expectedAddress: string): void {
  if (signer.address !== expectedAddress) {
    throw new WalletError(
      'Signer address does not match EXECUTION_TAKER_PUBKEY. The secret was not used to sign.',
      { code: 'signer_address_mismatch' },
    );
  }
}
