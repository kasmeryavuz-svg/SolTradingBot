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
| 14         | Real execution engine             | Complete                  |
| 15         | Wallet security                   | Complete after validation |
| 16         | Tiny live trading                 | Not started               |
| 17         | Strategy optimization             | Not started               |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 15 Wallet security (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, a d13_v1 local loopback-only read-only observability dashboard, an e14_v1 Jupiter Swap API V2 unsigned swap preflight engine, and a w15_v1 interactive in-memory signer security boundary
- **Not implemented:** everything from Checkpoint 16 onward

## What Checkpoint 15 did

Checkpoint 15 completes the **wallet security and signing boundary**.

It can accept a base58 64-byte Solana keypair from a hidden interactive TTY, keep that secret in memory only, require the derived address to equal `EXECUTION_TAKER_PUBKEY`, prove local message signing, and sign the exact e14 `simulation_passed` candidate. The signature is verified locally. The signed wire is discarded. Public output is a signing proof, not a sendable transaction.

It does **not** broadcast. It does **not** call `sendTransaction`, Jupiter `/execute`, Jupiter `/submit`, or Jito. It does **not** store a private key in `.env`, a file, or SQLite. It does **not** add dashboard signing controls. `TRADING_ENABLED` must remain false.

CP15 can produce and verify an in-memory signature. CP15 cannot transmit it.

## Planned next checkpoint: 16 Tiny live trading

This phase is **not** implemented in Checkpoint 15.

Checkpoint 16 owns a tightly bounded live broadcast of an already-signed artifact. Do not add `sendTransaction` in Checkpoint 15.

## Checkpoint 17 still owns optimization

The five r125_v1 candidates are pre-registered fixed hypotheses. Do not mutate their thresholds after seeing local results. If later evidence suggests a change, create a **new** candidate/version.

Checkpoint 17 remains responsible for actual strategy optimization / version evolution: walk-forward design, locked out-of-sample periods, and any parameter search methodology. Phase 12.5 deliberately has no hyperopt, grid search, or automatic threshold tuning.
