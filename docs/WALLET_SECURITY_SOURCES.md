# Wallet security sources

Primary sources for Checkpoint 15 (`w15_v1`). Date checked: **2026-08-18**.

No unofficial wallet tutorial is the source of truth. This file records what was verified against current official documentation and what w15 deliberately does not use.

## Solana — signing and custody

Official sources:

- [Signing in Production](https://solana.com/docs/core/transactions/signing-in-production) — checked 2026-08-18
- [Solana Keychain](https://solana.com/docs/tools/keychain) — checked 2026-08-18
- [Choosing a backend](https://solana.com/docs/tools/keychain/choosing-a-backend) — checked 2026-08-18
- [Keychain production best practices](https://solana.com/docs/tools/keychain/production-best-practices) — checked 2026-08-18
- [Transactions / transaction structure](https://solana.com/docs/core/transactions) — already used by e14; re-checked 2026-08-18

Verified capability used by w15:

| Item | Official current name / fact | How w15 uses it |
| --- | --- | --- |
| Local vs production custody | A local keypair is the only approach that puts raw key material in the application. Production should use dedicated key-management infrastructure. | Interactive memory signer is a **local controlled** backend only |
| Replaceable signer interface | Keychain exposes one `SolanaSigner` across Memory, Vault, AWS KMS, GCP KMS, and managed/MPC backends | w15 defines a narrow `WalletSigner` (`address` + `signMessages` + `signTransactions`) so a future Keychain/KMS backend can replace the local one |
| Memory backend | Official Keychain Memory backend is for development/tests, not unattended production | Documented as the CP15 local backend; Keychain package is **not** installed |
| Do not embed keys | Never embed private keys in client code, `.env` as a standing secret store for this checkpoint, or source control | Hidden TTY only; no `WALLET_PRIVATE_KEY` |

Deliberately deferred:

- Installing `@solana/keychain` or any Keychain backend package
- AWS KMS / GCP KMS / HashiCorp Vault
- MPC / institutional custody (Fireblocks, Dfns, Para, Utila, Fordefi)
- Embedded / managed wallets (Privy, Turnkey, CDP, Crossmint, Openfort)
- Browser wallets / Wallet Standard
- Unattended production automation

## @solana/kit 7.1.0 — already installed

Official sources:

- [Kit key pairs](https://www.solanakit.com/docs/advanced-guides/keypairs) — checked 2026-08-18
- [Kit signers](https://www.solanakit.com/docs/advanced-guides/signers) — checked 2026-08-18
- [createKeyPairSignerFromBytes](https://www.solanakit.com/api/functions/createKeyPairSignerFromBytes) — checked 2026-08-18
- Installed package `@solana/kit@7.1.0` type declarations

If a name in the original CP15 prompt differs from current Kit, **current official Kit wins**.

| Prompt concept | Current official Kit API | Difference |
| --- | --- | --- |
| Restore keypair from 64 bytes | `createKeyPairSignerFromBytes(bytes)` | Official name. Also `createKeyPairFromBytes` for a `CryptoKeyPair`. Official layout: first 32 bytes private, last 32 public. Installed Kit `createKeyPairFromBytes` **rejects** a public half that does not verify against the private half (`PUBLIC_KEY_MUST_MATCH_PRIVATE_KEY`). w15 also independently derives the public address from the private 32 bytes via `createKeyPairSignerFromPrivateKeyBytes` and requires a match. |
| Sign a message | `signer.signMessages([createSignableMessage(bytes)])` or low-level `signBytes(privateKey, data)` | w15 uses the signer method so business code never sees a raw keypair |
| Verify a message / tx signature | `verifySignature(publicKey, signature, messageBytes)` plus `getPublicKeyFromAddress` | Official verification primitive |
| Sign a compiled transaction | `signer.signTransactions([compiled])` or `signTransactionWithSigners(signers, compiled)` | w15 uses `signTransactions` only |
| Send after signing | `signAndSendTransactionWithSigners` exists in Kit | **Not used.** Signing must not send |
| Base58 secret → bytes | `getBase58Encoder().encode(base58String)` | Kit names this an *encoder* because it encodes the string type into bytes. e14 already uses `getBase58Decoder().decode(bytes)` for the inverse (blockhash bytes → base58) |
| Address check | `isAddress` / `address()` | Same APIs e14 already uses |

No new npm dependency was added. `@solana/web3.js`, `bs58`, `bip39`, `tweetnacl`, wallet-adapter, Jito SDK, and Jupiter SDK were not required.

## Node.js

Official / runtime capabilities used:

- TTY detection: `stream.isTTY`
- Raw mode / no-echo: `stdin.setRawMode` and `stdin.isRaw` (Node TTY ReadStream). w15 records the previous raw and pause state and restores those values in `finally`, including after Ctrl+C (raw-mode byte `0x03`, not an automatic SIGINT)
- Post-unlock network: only the existing narrow e14 `ExecutionRpc.getBlockHeight` recheck. Not “secret never in memory during any RPC.”
- `process.stdin` `data` events for character-at-a-time input
- `Buffer` / `Uint8Array.fill(0)` for best-effort zeroization of **mutable buffers we control**
- `node:crypto` SHA-256 for public fingerprints

Deliberately not used:

- Reading the secret from `process.argv`
- Reading the secret from `process.env`
- Clipboard APIs
- An automatic secret-entry timeout

## JavaScript memory limitation

Official Kit key-pair documentation and WebCrypto behavior: `CryptoKey` internals and JavaScript strings cannot be guaranteed to be overwritten by userland code. w15 documents **best-effort zeroization of mutable buffers we control**. It does not claim perfect memory erasure.

## Jito / Jupiter execute — still deferred

Official Jito send/bundle endpoints and Jupiter `/execute` / `/submit` exist. w15 records them only to explain why they are **not** called:

- Checkpoint 15 may hold a signed artifact long enough to verify it
- The public command API must not return that artifact
- Checkpoint 16 is the broadcast boundary
