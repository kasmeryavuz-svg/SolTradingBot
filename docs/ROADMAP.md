# Roadmap

This project is built one checkpoint at a time.

Do not implement a later checkpoint until the current one is complete.

| Checkpoint | Name                              | Status                    |
| ---------- | --------------------------------- | ------------------------- |
| 00         | Project foundation                | Complete                  |
| 01         | Solana connection                 | Complete                  |
| 02         | Live market data                  | Complete                  |
| 03         | Meme-coin discovery               | Complete                  |
| 04         | Database                          | Complete                  |
| 05         | Token risk scanner                | Complete                  |
| 06         | Signal and feature engine         | Complete                  |
| 07         | First strategy                    | Complete                  |
| 08         | Backtester                        | Complete                  |
| 09         | Paper trading                     | Complete                  |
| 10         | Position management               | Complete                  |
| 11         | Exit engine                       | Complete                  |
| 12         | Performance analytics             | Complete                  |
| 12.5       | Strategy Research / Benchmark Lab | Complete                  |
| 13         | Dashboard                         | Complete                  |
| 14         | Real execution engine             | Complete after validation |
| 15         | Wallet security                   | Not started               |
| 16         | Tiny live trading                 | Not started               |
| 17         | Strategy optimization             | Not started               |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 14 Real execution engine (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, a d13_v1 local loopback-only read-only observability dashboard, and an e14_v1 Jupiter Swap API V2 unsigned swap preflight engine
- **Not implemented:** everything from Checkpoint 15 onward

## What Checkpoint 14 did

Checkpoint 14 completes the **unsigned route/build/simulation execution engine**.

It can request a real Jupiter Swap API V2 `/build` route, compile a real unsigned v0 Solana transaction message, estimate compute units with `replaceRecentBlockhash: true`, then prove a second simulation of the exact provider-bound candidate (`replaceRecentBlockhash: false`) after `getGenesisHash` matches official mainnet-beta. Quoted output, minimum output threshold, RPC message-fee estimate, and calculated priority-fee component are separate numbers. They are not a landing or profit guarantee.

It does **not** create or import a private key. It does **not** sign. It does **not** broadcast. It does **not** call Jupiter `/execute` or `/submit`. It does **not** call Jito. Transaction signing is intentionally withheld until Checkpoint 15. Actual tiny broadcast is intentionally withheld until Checkpoint 16.

The Checkpoint 13 dashboard remains a frozen d13 observability artifact. It has no BUILD / SIMULATE / SIGN / SEND buttons.

## Planned next checkpoint: 15 Wallet security

This phase is **not** implemented in Checkpoint 14.

Checkpoint 15 owns wallet / signer security. Do not add a private key in Checkpoint 14.

## Checkpoint 17 still owns optimization

The five r125_v1 candidates are pre-registered fixed hypotheses. Do not mutate their thresholds after seeing local results. If later evidence suggests a change, create a **new** candidate/version.

Checkpoint 17 remains responsible for actual strategy optimization / version evolution: walk-forward design, locked out-of-sample periods, and any parameter search methodology. Phase 12.5 deliberately has no hyperopt, grid search, or automatic threshold tuning.
