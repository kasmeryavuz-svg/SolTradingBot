# Checkpoint 14 — Real execution preflight engine

Checkpoint 14 builds an **unsigned swap preflight engine**. It talks to the real Jupiter Swap API V2 `/build` route and can simulate a real Solana transaction. It does **not** hold a wallet, sign, or send.

Spec: `e14_v1`  
Name: `jupiter_v2_unsigned_swap_preflight_engine`

Schema stays **7**. There is no migration 008. Execution candidates are ephemeral. They are not stored.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Execution intent | Public swap request: input mint, output mint, raw amount, taker public key |
| Raw token amount (`amountRaw`) | Smallest native units of the input token. `1000000` USDC is 1 USDC if the mint has 6 decimals. Not a USD size |
| Jupiter route | A provider-chosen path across Solana DEXes. Labels are untrusted display text |
| Swap instructions | Program calls Jupiter returns. We assemble them. We do not execute arbitrary JavaScript from the response |
| Address lookup tables | Extra account lists that let a v0 transaction stay small. Jupiter already supplies the mappings |
| Blockhash | A recent chain snapshot the transaction is allowed to use. It expires |
| Compute units (CU) | How much Solana execution work the transaction may consume |
| Calculated priority-fee component | `ceil(CU price × final CU limit / 1_000_000)` lamports. e14 caps this; the cap is not a landing guarantee |
| RPC transaction-fee estimate | `getFeeForMessage` on the **final** unsigned message. This is the cluster charge for that message. It is not added to the priority-fee component |
| Slippage | Frozen e14 tolerance of 100 bps. That is a testable contract, not a “safe” or “optimal” value |
| Simulation | Ask an RPC what would happen **without** sending the transaction |
| Quoted output | Provider estimate of output tokens. Not guaranteed execution output |
| Simulation passed | Second simulation succeeded under the final CU limit. Not a landed trade and not profit |

## Commands

```bash
npm run execution:status
npm run execution:build
npm run execution:simulate
```

`execution:status` makes **zero** network calls and **zero** database writes.

`execution:build` may call Jupiter `GET /swap/v2/build` and compile an unsigned candidate. It does not sign or send.

`execution:simulate` may call Jupiter and the configured Solana RPC for genesis hash, block height, simulation, and fee estimation. It does not sign or send.

`execution:simulate` also proves the connected RPC is Solana mainnet-beta by comparing `getGenesisHash` to the official genesis `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d`. `SOLANA_NETWORK=mainnet-beta` alone is not enough.

`npm run dev` does **not** run these commands. There is no `execution:watch`. Strategy, paper, research, and the dashboard do **not** start execution.

## Required public config

Set all four before `execution:build` or `execution:simulate`. There are no defaults.

```text
EXECUTION_TAKER_PUBKEY=
EXECUTION_INPUT_MINT=
EXECUTION_OUTPUT_MINT=
EXECUTION_AMOUNT_RAW=
```

`amountRaw` is a canonical positive decimal integer string such as `1`, `1000000`, or `1000000000`. Forms like `01`, `1.0`, `1e9`, or `+1` are rejected.

Optional:

```text
EXECUTION_PROVIDER_TIMEOUT_MS=5000
JUPITER_API_KEY=
```

`JUPITER_API_KEY` is a secret. It is never printed, persisted, fingerprinted, or returned in errors.

Do **not** add `PRIVATE_KEY`, `SECRET_KEY`, a seed phrase, or a wallet JSON file.

## Why two simulations

Jupiter `/build` returns a compute-unit **price**, not a compute-unit **limit**. Official V2 guidance is:

1. Assemble the swap with a 1,400,000 CU headroom limit
2. Simulate to read units consumed
3. Set the final limit to `ceil(units * 1.20)`, capped at 1,400,000
4. Rebuild the unsigned message and simulate again

If consumed units are already at or above 1,400,000, the candidate is `blocked_compute_limit`. e14 does not pretend a capped value is safe.

The second simulation must use the exact final instructions, the provider blockhash (`replaceRecentBlockhash: false`, `sigVerify: false`), and succeed with consumed units `<=` the final limit before status can be `simulation_passed`. Height is checked after the first simulation and again immediately before the final simulation.

## Why there is no private key

Checkpoint 15 owns wallet / signer security. A preflight engine that already loaded a secret would make later security work backwards.

e14 only accepts a **public** taker address. If Jupiter marks any other account `isSigner: true`, the candidate is `unsupported_signer_requirement`.

## Why there is no signing

An unsigned v0 message can be compiled and simulated with `sigVerify: false`. Signing would create a live-capable artifact before the signer-security checkpoint exists.

## Why there is no broadcast

Broadcast is Checkpoint 16. e14 has no path to `sendTransaction`, Jupiter `/execute`, Jupiter `/submit`, or Jito `sendTransaction` / `sendBundle`.

## Why Jito is deferred

There is no signed transaction yet. Jito tips, bundles, and `jitodontfront` belong to a later live-execution contract. e14 requests `forJitoBundle=false` and rejects a provider tip instruction.

## Why simulation success is not a landing guarantee

Simulation uses current RPC bank state and an explicit CU limit. A later slot can change balances, accounts, fees, or congestion. The blockhash can expire. A passed preflight is evidence that **this unsigned candidate simulated**, not that a future send would land.

## Why quote output is not guaranteed execution output

Jupiter’s `outAmount` is a quoted output. `otherAmountThreshold` is the minimum output after the frozen 100 bps slippage. Price can move. Routes can fail. Simulation can fail for insufficient funds even when the route itself is structurally valid.

## Why the blockhash expires

Solana transactions are only valid through `lastValidBlockHeight`. e14 treats `currentHeight > lastValidBlockHeight` as `expired_blockhash`. Equal is still valid. There is no automatic rebuild. Run the command again.

## Instruction order

Official Jupiter V2 `/build` docs and the official `@solana/kit` example assemble:

1. Our `SetComputeUnitLimit`
2. Jupiter `SetComputeUnitPrice`
3. Setup instructions
4. Swap instruction
5. Cleanup instruction, if present
6. Other instructions, in provider order

e14 does not include a tip instruction.

## What Checkpoint 15 adds

Wallet / signer security: how a key is stored, loaded, and used. Implemented in Checkpoint 15 as an interactive in-memory signer. See [CHECKPOINT_15.md](CHECKPOINT_15.md).

## What Checkpoint 16 adds

Tiny live trading: actually signing and broadcasting a tightly bounded live attempt. Not started here.

## What this checkpoint does not do

- No private key, seed phrase, or wallet adapter
- No signing
- No send / broadcast
- No Jupiter `/order`, `/execute`, or `/submit`
- No Jito client
- No strategy → execution bridge
- No dashboard execution buttons
- No paper/research mutation
- No migration 008
