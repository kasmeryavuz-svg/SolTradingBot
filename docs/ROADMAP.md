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
| 16         | Tiny live trading                 | Complete after validation |
| 17         | Strategy optimization             | Not started               |
| 18         | Wallet intelligence               | Not started               |
| 19         | Advanced models / ML              | Not started               |
| 20         | Production deployment             | Not started               |

## Current status

- **Active checkpoint:** 16 Tiny live trading (complete after validation)
- **Implemented:** TypeScript foundation, safety guard, read-only Solana RPC, market snapshots, candidate discovery, local SQLite historical persistence, technical token risk scanning, a deterministic point-in-time feature engine, the first experimental s07_v1 entry-candidate classifier, a deterministic read-only historical backtester, a p09_v1 live paper-entry observation layer, pm10_v1 simulated single-open-position management with a fixed $100 reference notional, an experimental x11_v1 deterministic paper exit engine (10% stop, 20% take profit, 6-hour max hold, full close only), a12_v1 read-only GROSS closed-paper-trade analytics, an r125_v1 read-only historical strategy research / benchmark lab, a d13_v1 local loopback-only read-only observability dashboard, an e14_v1 Jupiter Swap API V2 unsigned swap preflight engine, a w15_v1 interactive in-memory signer security boundary, and an l16_v1 manual single-shot tiny mainnet RPC broadcaster
- **Not implemented:** everything from Checkpoint 17 onward

## What Checkpoint 16 did

Checkpoint 16 completes **manual tiny-live broadcast plumbing**.

It can take an exact e14 `simulation_passed` WSOL→USDC candidate, require both trading flags plus a TTY `LIVE SEND` phrase, sign with the w15 interactive signer, submit that exact transaction once through standard Solana RPC, derive the expected txid before send, poll `getSignatureStatuses`, fetch a `getTransaction` receipt, and persist public live-attempt evidence only.

It does **not** activate strategy automation. s07 / paper / research cannot trigger a send. It does **not** use Jito or Jupiter `/execute` / `/submit`. It does **not** add dashboard live controls. Automated tests use fake RPC and the unfunded test fixture only.

l16 proves sign → send → confirmation → receipt → persistence. It is not a live trading bot and not evidence of an edge.

## Planned next checkpoint: 17 Strategy optimization

Checkpoint 17 still focuses strategy optimization and evidence. It does not own a second broadcaster.

A later execution-quality version may compare standard RPC with Jito after baseline tiny-live data exists. That comparison is not Checkpoint 16 and not Checkpoint 17.

## Checkpoint 17 still owns optimization

The five r125_v1 candidates are pre-registered fixed hypotheses. Do not mutate their thresholds after seeing local results. If later evidence suggests a change, create a **new** candidate/version.

Checkpoint 17 remains responsible for actual strategy optimization / version evolution: walk-forward design, locked out-of-sample periods, and any parameter search methodology. Phase 12.5 deliberately has no hyperopt, grid search, or automatic threshold tuning.
