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
| 13         | Dashboard                         | Complete after validation |
| 14         | Real execution engine             | Not started               |
| 15         | Wallet security                   | Not started               |
| 16         | Tiny live trading                 | Not started               |
| 17         | Strategy optimization             | Not started               |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 13 Dashboard (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, and a d13_v1 local loopback-only read-only observability dashboard
- **Not implemented:** everything from Checkpoint 14 onward

## What Checkpoint 13 did

Checkpoint 13 is a **local read-only observability interface**. It visualizes already-stored SQLite evidence, runtime paper state, a12 GROSS performance, and r125 research coverage.

It does **not** execute trades. It does **not** hold a wallet. It does **not** change strategy thresholds. It does **not** call Solana or DEX Screener.

## Planned next checkpoint: 14 Real execution engine

This phase is **not** implemented in Checkpoint 13.

Checkpoint 14 is where a real execution engine would live. The dashboard must not grow buy/sell buttons in anticipation of that work.

## Checkpoint 17 still owns optimization

The five r125_v1 candidates are pre-registered fixed hypotheses. Do not mutate their thresholds after seeing local results. If later evidence suggests a change, create a **new** candidate/version.

Checkpoint 17 remains responsible for actual strategy optimization / version evolution: walk-forward design, locked out-of-sample periods, and any parameter search methodology. Phase 12.5 deliberately has no hyperopt, grid search, or automatic threshold tuning.
