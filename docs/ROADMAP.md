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
| 18         | Wallet intelligence               | Complete                  |
| 19         | Advanced models / ML              | Complete after validation |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 19 Advanced models / ML (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, a d13_v1 local loopback-only read-only observability dashboard, an e14_v1 Jupiter Swap API V2 unsigned swap preflight engine, a w15_v1 interactive in-memory signer security boundary, an l16_v1 manual single-shot tiny mainnet RPC broadcaster, an o17_v1 read-only anchored walk-forward / cost-stress strategy-optimization lab, a wi18_v1 read-only public-on-chain holder-cohort wallet intelligence layer, and an ml19_v1 read-only purged walk-forward regularized logistic research lab
- **Not implemented:** everything from Checkpoint 20 onward

## What Checkpoint 19 did

Checkpoint 19 builds a **deterministic, read-only supervised ML research lab**.

It asks whether frozen point-in-time c06 features provide useful out-of-sample information about later cost-adjusted x11 outcomes. It uses one model family (L2 logistic regression) plus an intercept-only null model, purged chronological walk-forward, TRAIN-only preprocessing, and a frozen 0.65 threshold. Wallet-intelligence features are not used.

CP19 does not modify s07, paper, or live. `npm run dev` does not train a model.

## Planned next checkpoint: 20 Production deployment

Checkpoint 20 owns production deployment. Do not start it from CP19. An eligible ML candidate is still only a candidate for later paper validation, not a live bot.

## Checkpoint 19 does not trade

A predicted probability is not a buy signal. It does not edit s07, does not call `live:execute`, and does not change CP16 live caps.
