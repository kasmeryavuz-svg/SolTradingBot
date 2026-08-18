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
| 15         | Wallet security                   | Complete                  |
| 16         | Tiny live trading                 | Complete                  |
| 17         | Strategy optimization             | Complete after validation |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 17 Strategy optimization (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, a d13_v1 local loopback-only read-only observability dashboard, an e14_v1 Jupiter Swap API V2 unsigned swap preflight engine, a w15_v1 interactive in-memory signer security boundary, an l16_v1 manual single-shot tiny mainnet RPC broadcaster, and an o17_v1 read-only anchored walk-forward / cost-stress strategy-optimization lab
- **Not implemented:** everything from Checkpoint 18 onward

## What Checkpoint 17 did

Checkpoint 17 builds a **controlled strategy-optimization research lab**.

It reuses the conservative r125 snapshot universe, reconstructs c06 features point-in-time, and ranks a frozen catalog with **stage-wise** selection: entries first against frozen x11, then exits for the chosen entry. Four anchored walk-forward folds measure the selected pair out of sample. Segment bounds are integer milliseconds. Public output distinguishes time-partition constructibility, walk-forward evaluability, and promotion-data sufficiency. LOW/BASE/STRESS costs are research assumptions, not measured fees. Partial and moonbag exits are tested on stored observations only. Drawdown percent uses peak cumulative completed-trade net PnL, not a bankroll.

Promotion, if it ever happens, means **ELIGIBLE_FOR_FORWARD_PAPER_VALIDATION** only. It does not edit s07, enable paper automatically, or connect signals to l16.

A young database is expected to return `NO_PROMOTION_INSUFFICIENT_DATA`. That is a successful honest optimizer, not a reason to loosen rules.

## Planned next checkpoint: 18 Wallet intelligence

Checkpoint 18 still focuses wallet intelligence. It does not own CP17 reruns or live automation.

Checkpoint 19 owns advanced models / ML. Do not train classifiers in CP17.

## Checkpoint 17 promotion is paper-only

Passing every o17 gate does **not** mean live-ready. It means the methodology produced a candidate that may be watched in a **future paper period**. Good backtest ≠ live profitability.
