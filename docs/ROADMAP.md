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
| 17         | Strategy optimization             | Complete                  |
| 18         | Wallet intelligence               | Complete after validation |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 18 Wallet intelligence (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, a d13_v1 local loopback-only read-only observability dashboard, an e14_v1 Jupiter Swap API V2 unsigned swap preflight engine, a w15_v1 interactive in-memory signer security boundary, an l16_v1 manual single-shot tiny mainnet RPC broadcaster, an o17_v1 read-only anchored walk-forward / cost-stress strategy-optimization lab, and a wi18_v1 read-only public-on-chain holder-cohort wallet intelligence layer
- **Not implemented:** everything from Checkpoint 19 onward

## What Checkpoint 18 did

Checkpoint 18 builds **public on-chain holder-cohort intelligence**.

It resolves the largest token accounts for one mint, aggregates owners inside that observed set, classifies owner accounts, and profiles up to 10 system-owned non-executable wallet candidates with capped Helius history. Features are factual. There is no smart-money score, no wallet PnL, no identity attribution, and no copy trading.

Top token accounts are not top wallets. Observed wallet age is not wallet creation time. Bidirectional token balance changes are not guaranteed swaps.

CP18 does not modify s07, r125, o17, paper, or live. `npm run dev` does not call Helius wallet-intelligence endpoints.

## Planned next checkpoint: 19 Advanced models / ML

Checkpoint 19 owns advanced models / ML. Do not start it from CP18. Wallet-intelligence features are evidence for later research, not an automatic trading input.

## Checkpoint 18 does not trade

A holder-cohort report is not a buy signal. It does not follow wallets, does not call `live:execute`, and does not change CP16 live caps.
