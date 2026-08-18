# Live execution sources

Primary sources for Checkpoint 16 (`l16_v1`). Date checked: **2026-08-18**.

No unofficial trading-bot tutorial is the source of truth. This file records what was verified against current official documentation and what l16 deliberately does not use.

l16 is a **manual single-shot tiny mainnet RPC broadcast** of an already simulated e14 candidate. It is execution plumbing, not strategy validation and not a profitability claim.

## Solana RPC — send, confirm, receipt

Official sources:

- [sendTransaction](https://solana.com/docs/rpc/http/sendtransaction) — checked 2026-08-18
- [getSignatureStatuses](https://solana.com/docs/rpc/http/getsignaturestatuses) — checked 2026-08-18
- [getTransaction](https://solana.com/docs/rpc/http/gettransaction) — checked 2026-08-18
- [getBlockHeight](https://solana.com/docs/rpc/http/getblockheight) — already used by e14; re-checked 2026-08-18
- [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash) — already used by e14; re-checked 2026-08-18
- [getBalance](https://solana.com/docs/rpc/http/getbalance) — checked 2026-08-18
- [Confirmation and expiration](https://solana.com/docs/core/transactions/confirmation) — checked 2026-08-18

Verified facts used by l16:

| Item | Official current fact | How l16 uses it |
| --- | --- | --- |
| `sendTransaction` does not wait for confirmation | A successful RPC response means the node accepted the bytes for forwarding. It is not a landed trade. | l16 never treats a send response as `confirmed` / `finalized` |
| Transaction id is the first signature | The returned signature is the first signature in the signed transaction. It can be extracted before submission. | l16 derives the expected txid from the signed transaction **before** `sendTransaction` |
| `skipPreflight` default | Default is `false`. Preflight verifies signatures and simulates at `preflightCommitment`. | Frozen `skipPreflight = false` |
| `preflightCommitment` | Official values: `processed`, `confirmed`, `finalized`. Default on the server is `finalized` if unset. | Frozen `preflightCommitment = "confirmed"` to match e14 simulation commitment |
| `encoding` | `base64` is the recommended wire encoding. `base58` is slow. | Frozen `encoding = "base64"` |
| `maxRetries` | Maximum times the **RPC node** retries forwarding to the leader. If omitted, the node retries until finalized or the blockhash expires. Official JSON examples use a JSON number. | Frozen JSON `maxRetries: 0` (number, not omitted, not `null`, not `"0"`). This only caps the requested RPC retry budget. It does not control validator/network forwarding after the first accept |
| Timeout after send | Official docs: the node may have received the transaction even when the client loses the response. | Timeout / 5xx / reset after send is `broadcast_outcome_unknown`. Never classified as “not sent.” Never resent |
| `getSignatureStatuses` | Returns `processed`, `confirmed`, or `finalized`, plus `err`. `null` means not in the recent cache unless `searchTransactionHistory` is true. | Bounded poll of the **expected** txid. `processed` is not completion. Success requires `confirmed` or `finalized` with `err == null` |
| Recent status cache | Without `searchTransactionHistory`, only the recent cache is searched. | Live tracker uses the recent cache. `live:reconcile` sets `searchTransactionHistory = true` |
| `getTransaction` | Returns `null` if not found at the requested commitment. Does not accept `processed`. `maxSupportedTransactionVersion` currently must be `0` to include v0 transactions. | Frozen `maxSupportedTransactionVersion = 0`, encoding `base64` so the returned wire can be hashed without logging it |
| Token-balance metadata | `meta.preTokenBalances` / `meta.postTokenBalances` include owner, mint, and raw `uiTokenAmount.amount` | Used only to derive taker-owned USDC raw net increase when identity is reliable. Not PnL |
| Blockhash lifetime | A blockhash remains processable for about 151 blocks (~60–90 seconds at 400–600 ms slots). `lastValidBlockHeight` is the expiry bound. e14 already treats `currentHeight > lastValidBlockHeight` as expired. | l16 requires **25** block-heights of remaining headroom before operator confirmation and **10** immediately before send. Those values are inside the official ~150-block window and leave time for a manual TTY confirm + hidden sign |
| `getBalance` | Returns lamports for one address. | Balance gate only, explicit `commitment=confirmed`, u64 validation. No airdrop, transfer, or funding. A preview balance is not a final guarantee |
| `minContextSlot` | Optional sendTransaction preflight lower bound | **Omitted.** e14 public simulation evidence has `unitsConsumed` only and no trustworthy public simulation-context slot. Adding a slot to e14 would change the e14 fingerprint. l16 does not guess a slot |

No material incompatibility was found. Implementation proceeded.

## @solana/kit 7.1.0 — already installed

Official Kit `SendTransactionApi` (`@solana/rpc-api` via `@solana/kit@7.1.0`):

- `sendTransaction(base64EncodedWireTransaction, { encoding: 'base64', skipPreflight?, preflightCommitment?, maxRetries?: bigint })`
- Kit types `maxRetries` as `bigint`. l16 still emits JSON-RPC `maxRetries` as the number `0`
- Official Kit comment: a successful send is not confirmation; use `getSignatureStatuses`
- Official Kit comment: the signature can be extracted from the transaction before sending

l16 uses the configured `createSolanaRpc` **only** behind a narrow `LiveRpc`:

- `getGenesisHash`
- `getBlockHeight`
- `getBalance`
- `sendTransaction`
- `getSignatureStatuses`
- `getTransaction`

Not used:

- `sendAndConfirmTransaction` / `sendAndConfirmTransactionFactory`
- `signAndSendTransactionWithSigners`
- `requestAirdrop`
- generic raw RPC passthrough

No new npm dependency was added. `@solana/web3.js`, Jito SDKs, and Jupiter SDKs were not required.

## Jupiter Swap API V2 — `/build` only

Official / existing e14 contract:

- Jupiter Swap API V2 `GET /swap/v2/build` on `api.jup.ag`
- Already frozen by e14 as the only Jupiter surface

Deliberately **not** used by l16:

- `/order`
- `/execute`
- `/submit`
- Ultra / managed execution

Reason: the transaction we send must be the transaction **we** constructed, simulated, and signed. A managed execute/submit path would hide preflight and wire identity.

## Jito — deferred

Official Jito sender behavior (current public docs / `jito.wtf` JSON-RPC):

- Jito exposes a `sendTransaction` that can skip preflight and optionally `bundleOnly`
- Separate `sendBundle` submits a bundle with tip instructions
- Tip-floor / `jitodontfront` are Jito-specific landing policies

l16 does **not** call Jito.

Reason: the first live proof needs one baseline broadcaster whose preflight is explicit (`skipPreflight=false`, `preflightCommitment=confirmed`, `maxRetries=0`). Jito may be evaluated only after this standard-RPC tiny-live baseline has public evidence. A later execution-quality version may compare the two. That comparison is not Checkpoint 16 and not Checkpoint 17.

## JavaScript memory limitation

Raw signed bytes must exist briefly in order to:

1. derive the public txid
2. compute a signed-wire SHA-256
3. call `sendTransaction` once
4. compare the confirmed `getTransaction` wire hash

l16 keeps those bytes memory-only. It does not log them, persist them, return them from public commands, or write them to SQLite or files.

Best-effort: disposable `Uint8Array` copies we control are overwritten with zeros after use.

Limitation: JavaScript strings (including base64 wire) and Kit / WebCrypto internals cannot be guaranteed to be overwritten by userland code. l16 documents this honestly. It does not claim perfect memory erasure.

## What l16 will not treat as official permission

- Unofficial “retry until it lands” bot snippets that call `sendTransaction` in a loop
- Skipping preflight “for speed”
- Treating an RPC timeout as proof the transaction was not sent
- Using a returned signature that does not equal the locally derived expected txid
- Jupiter managed execute/submit as a substitute for our compiled wire
- Jito as the first broadcaster
