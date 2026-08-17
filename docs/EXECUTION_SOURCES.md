# Execution sources

Primary sources for Checkpoint 14 (`e14_v1`). Date first checked: **2026-08-17**. Re-verified: **2026-08-18**.

Hostile audit (2026-08-18) re-read the current official Jupiter Router `/build` page, OpenAPI `GET /swap/v2/build`, common-instructions page, official `@solana/kit` `/build` example, and Solana `simulateTransaction`, compute-budget, `getFeeForMessage`, and `getGenesisHash` pages. No material provider contract change. Implementation was not guessed against a stale copy.

No unofficial blog is the source of truth for API schemas. This file records what was verified and what e14 deliberately does not use.

## Jupiter Swap API V2

Official sources:

- [Swap overview](https://dev.jup.ag/docs/swap)
- [Build](https://dev.jup.ag/docs/swap/v2/build)
- [Build OpenAPI](https://developers.jup.ag/docs/api-reference/swap/build)
- [Metis to Router migration](https://dev.jup.ag/docs/swap/v2/migration)
- [Common instructions / ordering](https://dev.jup.ag/docs/swap/v2/build/common-instructions)
- [Compute units and priority fees](https://dev.jup.ag/docs/swap/advanced/compute-units)

Verified capability used by e14:

| Item | Value |
| --- | --- |
| API | Jupiter Swap API V2 |
| Method / path | `GET https://api.jup.ag/swap/v2/build` |
| Host | `api.jup.ag` (code-defined, no `JUPITER_BASE_URL`) |
| Redirects | `redirect: "error"` |
| Auth | optional `x-api-key` when `JUPITER_API_KEY` is configured |
| Swap mode | ExactIn only (`/build` does not support ExactOut) |
| Routing | Metis / Router path |
| Lookup tables | `addressesByLookupTableAddress` supplied in the response; no extra ALT RPC fetch |
| Blockhash | `blockhashWithMetadata` supplied in the response |
| Compute budget | CU **price** instruction(s); CU **limit** is integrator-owned |

Instruction order bound in e14 follows the official V2 common-instructions page plus the official `@solana/kit` `/build` example:

1. integrator `SetComputeUnitLimit`
2. Jupiter compute-budget CU price
3. setup
4. swap
5. cleanup if present
6. `otherInstructions` after cleanup

First simulation omits the provider CU-price instruction, matching the official kit example, and may use `replaceRecentBlockhash: true` for CU estimation.

The **final** unsigned candidate includes the provider CU price, the exact Jupiter blockhash, `replaceRecentBlockhash: false`, and `sigVerify: false`. A `simulation_passed` status is only for that exact candidate.

## Deliberately not used

- Legacy `GET /swap/v1/quote`
- Legacy `POST /swap/v1/swap`
- Legacy `POST /swap/v1/swap-instructions`
- Managed `GET /swap/v2/order`
- Managed `POST /swap/v2/execute`
- Jupiter `/submit` / `tx.jup.ag`
- Ultra legacy APIs
- `mode=fast`
- RTSE slippage
- `platformFeeBps` / `feeAccount`
- `payer` override
- `tipAmount` / `tipInstruction`
- `destinationTokenAccount` / `nativeDestinationAccount`
- `dexes` / `excludeDexes`
- Jupiter SDK

## Solana

Official sources:

- [Compute budget](https://solana.com/docs/core/fees/compute-budget) — variants `RequestHeapFrame` (1), `SetComputeUnitLimit` (2), `SetComputeUnitPrice` (3), `SetLoadedAccountsDataSizeLimit` (4). e14 owns limit; provider may supply price; other variants are `provider_contract_changed`, not dropped.
- [Fee structure](https://solana.com/docs/core/fees/fee-structure)
- [Transactions / 1,232-byte packet limit](https://solana.com/docs/core/transactions)
- [simulateTransaction](https://solana.com/docs/rpc/http/simulatetransaction)
- [getFeeForMessage](https://solana.com/docs/rpc/http/getfeeformessage) — returns the lamports the cluster would charge for the serialized message. e14 reports this separately from the calculated priority-fee component and does **not** add the two.
- [getGenesisHash](https://solana.com/docs/rpc/http/getgenesishash)
- [Available clusters / expected genesis hashes](https://docs.anza.xyz/clusters/available)
- [@solana/kit](https://github.com/anza-xyz/kit) v7.1.0, already installed

Official mainnet-beta genesis hash (Anza cluster docs, 2026-08-18):

`5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`

`execution:simulate` requires this connected-cluster identity. Hostname/`SOLANA_NETWORK` alone is not enough. RPC URL and credentials are never fingerprinted.

`@solana/kit` 7.1.0 exposes v0 transaction messages, address-lookup-table compression, `compileTransaction`, `simulateTransaction`, `getFeeForMessage`, and compute-unit limit/price helpers.

e14 did **not** add `@solana/web3.js`.

e14 did **not** add `@solana-program/compute-budget`. Kit already compiles v0 messages and the official Solana compute-budget layout is documented (`SetComputeUnitLimit` discriminator `2`, `SetComputeUnitPrice` discriminator `3`). Jupiter’s own kit example encodes the CU-limit instruction with that layout. Adding another package was not required.

## Jito — deferred

Official Jito send/bundle endpoints exist, including `mainnet.block-engine.jito.wtf`. e14 records them only to explain why they are **not** called:

- There is no signed transaction
- Checkpoint 14 is preflight-only
- Tips, bundles, `bundleOnly`, and `jitodontfront` belong to a later live-execution contract

e14 must not call `getTipAccounts`, tip floor, `sendTransaction`, or `sendBundle`.
