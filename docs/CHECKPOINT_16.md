# Checkpoint 16 — Tiny live trading

Checkpoint 16 builds the **first live-broadcast layer**. It can take an exact e14 `simulation_passed` candidate, require explicit operator authorization, sign with the w15 interactive signer, and submit that exact transaction **once** through standard Solana RPC.

Spec: `l16_v1`  
Name: `manual_single_shot_tiny_mainnet_rpc_broadcast`

Schema becomes **8**. Migration `008_live_execution_attempts.sql` adds one public-evidence table: `live_execution_attempts`.

This is **execution plumbing**, not strategy validation and not a profitability claim.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Broadcast | Hand signed transaction bytes to an RPC node with `sendTransaction`. The node may forward them to a leader |
| Preflight | The RPC simulates and checks signatures before forwarding when `skipPreflight=false` |
| Transaction signature / txid | The first signature in the signed transaction. It identifies the transaction. l16 derives it **before** send |
| processed | The node has seen the transaction in a recent block. It can still fork away. Not completion |
| confirmed | Supermajority of stake has voted for a block containing the transaction |
| finalized | The cluster treats that block as finalized. Strongest common commitment |
| Why a send response is not confirmation | Official `sendTransaction` returns as soon as the RPC accepts bytes. Landing is a later cluster event |
| Why blockhash expiry matters | A transaction using a stale recent blockhash will never land. Remaining headroom can run out while a human confirms and types a secret |
| Why retry can duplicate intent | If the node already accepted bytes and the client retries, the same signed transaction may be forwarded again. The same txid cannot land twice, but a **new** signature is a second intent |
| Why expected txid is known before send | The txid is the first signature. After local signing it is public and safe to persist |
| Why timeout is ambiguous | The HTTP client may lose the response after the node already accepted the bytes. Timeout ≠ unsent |
| Why one RPC send only | l16 never automatically resends. Ambiguous outcomes are reconciled by polling the expected txid |
| Why receipt verification matters | `getTransaction` must correspond to what was signed. A mismatched wire is `confirmation_integrity_error` |
| Why daily caps are persistent | Crash or timeout after send still counts. UTC-day limits live in SQLite, not in process memory |
| Why the first pair is WSOL → USDC | The first proof is sign → send → confirm → receipt → persist, not unknown-token risk |
| Why Jito is deferred | We want one baseline broadcaster with explicit preflight. Jito is a later comparison, not the first send path |
| Why this is not strategy validation | Nothing in s07 / paper / research can trigger `live:execute` |

## Hard contract

Fixed pair only:

- Input: Wrapped SOL `So11111111111111111111111111111111111111112`
- Output: mainnet USDC `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`

Code-defined caps (no environment override):

- 1,000,000 lamports (0.001 SOL) max input per attempt
- 2,000,000 lamports max broadcast-at-risk input per UTC day
- 2 broadcast-at-risk attempts per UTC day
- 100,000 lamports max RPC transaction-fee estimate
- 50,000 lamports max calculated priority component
- 10,000,000 lamports (0.01 SOL) minimum taker SOL balance before the attempt

These are safety caps, not trading recommendations.

## Commands

```bash
npm run live:status
npm run live:preview
npm run live:execute
npm run live:history
npm run live:reconcile
```

`live:status` is local only: no network, no secret, no send.

`live:preview` may call e14 Jupiter `/build` and mainnet RPC for simulation, genesis, balance, and headroom. It does **not** prompt a secret, sign, send, or reserve a live attempt. It may run while `TRADING_ENABLED=false` and `LIVE_BROADCAST_ENABLED=false`.

`live:execute` is the **only** CP16 command that can send. It requires both `TRADING_ENABLED=true` and `LIVE_BROADCAST_ENABLED=true`, an exact TTY `LIVE SEND <candidate-short-id> <amountRaw>` phrase, then the hidden w15 secret. Confirmation happens before the secret prompt. There is no `--yes`, piped stdin, or env confirmation.

`live:history` reads public SQLite rows only.

`live:reconcile` polls the **oldest** unresolved stored expected txid that has already crossed `broadcast_submitting`. `signed` rows are not maybe-sent and are not auto-sent. Reconcile never signs or sends. It does not accept an attacker-supplied signature argument.

There is no `live:watch`, `live:auto`, `live:strategy`, `live:jito`, or `live:send-raw`.

`npm run dev` still does nothing live.

## Crash safety before send

The irreversible send boundary is **`broadcast_submitting`**, not `signed`.

Required sequence:

1. Persist expected txid and public `signed_wire_sha256` as `signed`
2. Recheck block-height headroom
3. `BEGIN IMMEDIATE`, recalculate UTC-day risk using `broadcast_risk_at_ms`, enforce 2 attempts / 2,000,000 lamports, transition this row to `broadcast_submitting`, **COMMIT**
4. Only then call `sendTransaction` exactly once

A crash after `signed` and before that commit means the transaction was **not** handed to RPC. A crash after the commit means broadcast **may** have occurred. `live:reconcile` treats `broadcast_submitting` as maybe-sent. It never resends.

Candidate reservation (`reserved`) only prevents duplicate candidate sign/send. It does not consume the daily risk budget. Daily risk starts at `broadcast_submitting` and is attributed to the UTC day of `broadcast_risk_at_ms`.

## Ambiguous send outcomes

If `sendTransaction` times out, resets, is aborted after invocation, or returns 5xx after bytes may have left the process, l16 stores `broadcast_outcome_unknown` and polls the **expected** txid. It never assumes “not sent.” It never resends. The send RPC timeout is a code-defined 10 seconds.

If the RPC returns a different signature than the locally derived txid, both public values are stored. l16 still polls the expected txid.

`live:reconcile` exists because a process can crash after send. The stored public txid is enough to recover. The secret is never required to reconcile.

## What this checkpoint is not

- Not automatic trading
- Not a strategy → live bridge
- Not dashboard BUY/SELL/SEND
- Not Jito
- Not Jupiter `/execute` or `/submit`
- Not arbitrary meme-token live entry
- Not a profitability claim
- Not a real mainnet broadcast during implementation or automated tests
