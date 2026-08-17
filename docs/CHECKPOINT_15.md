# Checkpoint 15 — Wallet security / signer isolation

Checkpoint 15 builds the **wallet security and signing boundary**. A trading-wallet secret may exist only in memory, only after a hidden TTY prompt, and only long enough to prove a signature. The signed transaction is not broadcast.

Spec: `w15_v1`  
Name: `interactive_in_memory_signer_security_boundary`

Schema stays **7**. There is no migration 008. There is no wallets table and no signing-proof persistence.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Public key / address | The account identity anyone may see. `EXECUTION_TAKER_PUBKEY` is this |
| Private key / secret | The 64-byte Solana keypair that can approve a transaction. Never put this in `.env`, a file, source, or chat |
| Signer | An object that can produce a signature for a specific address without handing the secret to business code |
| Signature | A 64-byte Ed25519 proof that the holder of that secret approved exact bytes |
| Why signatures authorize transactions | Solana will not execute a transaction unless every required signer has a valid signature over the compiled message |
| Why we compare signer address to taker | The e14 candidate was built for one fee payer. Signing with a different wallet would authorize a different account than the simulated trade |
| Why no private key in the environment | `.env` files are copied, logged, backed up, and easy to leak. w15 refuses env secrets |
| Why shell arguments are dangerous | `npm run wallet:verify -- secret` lands in shell history. Extra CLI args are rejected |
| Why hidden TTY is used | Typed characters must not echo. Piped or redirected stdin is refused so a secret cannot be casually streamed in |
| Why byte buffers are zeroized | After decode, w15 overwrites the 64-byte array it controls |
| Why JavaScript cannot guarantee perfect wiping | Strings and WebCrypto/Kit signer internals are not reliably overwriteable from userland. w15 claims best-effort zeroization only |
| Why the self-test signs a domain-separated challenge | The challenge starts with `SolTradingBot / w15_v1 / signer-self-test / <address>`. It is not transaction bytes and not user-supplied text |
| Why a generic signing oracle is forbidden | A `wallet:sign-message` command would sign attacker-chosen bytes. w15 allows only the self-test and the exact e14 candidate |
| Why e14 must `simulation_pass` before the prompt | The secret must not be unlocked while Jupiter/RPC work is still failing or incomplete |
| Why the signed wire is not exposed | A returned base64 transaction is a ready-to-send artifact. Checkpoint 16 is the broadcast boundary |
| Why CP16 is separate | Proving a signature is not the same as transmitting it |
| Why production automation needs dedicated signer infrastructure | Official Solana guidance: a local keypair is for development. Unattended production should use KMS / HSM / Vault / MPC. w15’s `WalletSigner` is replaceable; those backends are not implemented here |

## Commands

```bash
npm run wallet:status
npm run wallet:verify
npm run wallet:sign-test
npm run wallet:sign-preflight
```

`wallet:status` makes **zero** network calls, **zero** secret prompts, and **zero** database writes.

`wallet:verify` and `wallet:sign-test` require an interactive TTY and `EXECUTION_TAKER_PUBKEY`. They do not call Jupiter or Solana RPC.

`wallet:sign-preflight` may call the same hosts already allowed by e14: `api.jup.ag` and the configured Solana RPC. All expensive provider preflight occurs **before** unlock. After the secret is unlocked, the only allowed network operation is one bounded `getBlockHeight` expiry recheck. The signer may exist during that single RPC. This is not “secret never in memory during any network call.”

The public `src/wallet/index.ts` barrel exports only status / verify / self-test / exact-preflight-sign operations, public proofs, and fingerprints. Low-level signer, decode, and TTY helpers are internal modules. Do not import `withInteractiveSigner` as a generic application capability.

There is no `wallet:send`, `wallet:broadcast`, `wallet:export`, `wallet:generate`, or `wallet:watch`.

`npm run dev` does **not** prompt or sign.

## Secret format

w15_v1 accepts **one** local format:

base58-encoded 64-byte Solana keypair secret.

It does not accept mnemonics, JSON integer arrays, 32-byte seeds, hex, base64, comma lists, file paths, or environment variables.

Maximum typed length is 88 characters (the maximum base58 length of 64 bytes). Longer input is aborted.

## Signer lifetime

Conceptual flow:

1. Hidden TTY input
2. Decode to 64 bytes
3. Create a Kit `KeyPairSigner` via `createKeyPairSignerFromBytes`
4. Wrap it as `WalletSigner` (address + sign methods only)
5. Clear the decoded byte array
6. Run one scoped callback
7. Drop the signer reference

There is no global wallet, no `AppConfig` private key, and no automatic strategy → signer connection.

## `wallet:sign-preflight` order

The secret stays locked while provider work runs:

1. Load public config
2. Require `TRADING_ENABLED=false`
3. Require `mainnet-beta`
4. Run the e14 Jupiter build
5. Run e14 cluster verification (official mainnet genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`)
6. Run e14 first simulation
7. Derive final CU
8. Run e14 exact final simulation
9. Require status `simulation_passed`
10. Recheck block height / expiry (still locked)
11. **Only now** prompt for the hidden secret
12. Derive the signer
13. Require signer address == intent taker
14. Recheck block height once more (the only post-unlock network call)
15. Recompute SHA-256 of the **exact e14 final compiled message bytes** and require equality with the certified e14 candidate hash. No Jupiter rebuild. No recompile.
16. Sign that exact compiled transaction
17. Verify the signature locally against those same message bytes
18. Produce a public signing proof
19. Discard the signed artifact and signer
20. Never send

If the blockhash expires while the operator is typing, the signer is dropped and the command is refused. There is no automatic Jupiter rebuild while the secret is unlocked.

## What the public proof contains

The proof includes spec version, definition fingerprint, public signer address, e14 candidate fingerprints, compiled-message SHA-256, `signatureVerified: true`, and a fingerprint of the signed artifact.

It does **not** include the secret, signature bytes, or signed transaction bytes.

## Production guidance

The interactive-memory signer is a **local controlled backend**.

Do not treat it as ideal unattended production custody. Official Solana Keychain guidance is to develop against a memory signer and switch to Vault, cloud KMS/HSM, or a managed/MPC backend through the same signer interface.

Checkpoint 15 documents that future backend. It does not implement it.

## What this checkpoint does not do

- No broadcast / `sendTransaction` / `sendRawTransaction` / `sendAndConfirmTransaction`
- No Jupiter `/execute` or `/submit`
- No Jito
- No private key in `.env` or AppConfig
- No plaintext wallet JSON / Solana CLI `id.json` autoload
- No mnemonic
- No secret persistence / migration 008
- No dashboard unlock / sign / send / connect-wallet controls
- No automatic signing of paper or research signals
- No live trading
- No wallet generation or funding

## What Checkpoint 16 adds

Tiny live trading: intentionally handing a signed artifact to a broadcaster. Not started here.
