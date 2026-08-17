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
| 12.5       | Strategy Research / Benchmark Lab | Complete after validation |
| 13         | Dashboard                         | Not started               |
| 14         | Real execution engine             | Not started               |
| 15         | Wallet security                   | Not started               |
| 16         | Tiny live trading                 | Not started               |
| 17         | Strategy optimization             | Not started               |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 12.5 Strategy Research / Benchmark Lab (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, and an r125_v1 read-only historical strategy research / benchmark lab
- **Not implemented:** everything from Checkpoint 13 onward

## What Phase 12.5 did

Phase 12.5 creates a **fixed historical candidate comparison lab**. Five pre-registered entry hypotheses run against the same SQLite research universe, reconstruct frozen c06_v1 features point-in-time, share frozen x11_v1 exits, and reuse a12-compatible GROSS paper mathematics.

It does **not** prove profitability. It does **not** optimize parameters. It does **not** select a strategy for live trading.

## Planned next checkpoint: 13 Dashboard

This phase is **not** implemented in Phase 12.5.

Checkpoint 13 can visualize stored history and research reports. It must not become a live trading console.

## Checkpoint 17 still owns optimization

The five r125_v1 candidates are pre-registered fixed hypotheses. Do not mutate their thresholds after seeing local results. If later evidence suggests a change, create a **new** candidate/version.

Checkpoint 17 remains responsible for actual strategy optimization / version evolution: walk-forward design, locked out-of-sample periods, and any parameter search methodology. Phase 12.5 deliberately has no hyperopt, grid search, or automatic threshold tuning.
