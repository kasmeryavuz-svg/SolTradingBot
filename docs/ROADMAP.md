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
| 12         | Performance analytics             | Complete after validation |
| 12.5       | Strategy Research / Benchmark Lab | Not started               |
| 13         | Dashboard                         | Not started               |
| 14         | Real execution engine             | Not started               |
| 15         | Wallet security                   | Not started               |
| 16         | Tiny live trading                 | Not started               |
| 17         | Strategy optimization             | Not started               |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 12 Performance analytics (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), and a12_v1 read-only GROSS closed-paper-trade analytics
- **Not implemented:** phase 12.5 Strategy Research / Benchmark Lab, and everything from Checkpoint 13 onward

## Planned next phase: 12.5 Strategy Research / Benchmark Lab

This phase is **not** implemented in Checkpoint 12.

Later, 12.5 can test research-backed or open-source strategy _concepts_ against the same deterministic analytics engine (`a12_v1` math, new spec versions as needed). It must not silently mutate s07/p09/pm10/x11. It is not a copy of Freqtrade, Hummingbot, or any third-party bot, and it is not live trading.

Dashboard work stays Checkpoint 13, after that research lab has a place to sit.
