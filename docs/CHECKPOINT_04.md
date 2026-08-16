# Checkpoint 04 — Local SQLite database and historical persistence

This checkpoint teaches the bot to **remember** what it has already observed. It still cannot judge tokens, trade, or write anything to Solana.

## What a database is

A database is a structured file the program can write to and read from later. Think of it as a notebook with labeled tables, not a pile of loose notes.

## Why RAM / in-memory state disappears

Checkpoint 03’s first-seen set lived only in memory. When the process stopped, that memory was gone. A database file stays on disk after exit.

## Why historical data matters

Later we will want to study how a token looked at 10:00, 10:30, and 11:00. That needs stored snapshots and stored discovery runs. This checkpoint only stores facts. It does not score them or trade on them.

## What SQLite is

SQLite is a small database engine built into Node 24 as `node:sqlite`. The whole database is one local file (plus short-lived WAL helper files). No separate database server is required.

## What a database row is

A row is one recorded item, such as one token or one market snapshot.

## What a table is

A table is a named collection of rows with the same columns. Example: every mint we have ever recorded lives in `tokens`.

## What a primary key is

A primary key uniquely identifies a row, such as `tokens.id`.

## What a foreign key is

A foreign key points at another table’s primary key. An observation’s `token_id` must match a real token. That prevents orphan history.

## What a unique constraint is

A unique constraint says “this combination may appear only once.” Each mint appears once in `tokens`. The same snapshot identity (`token_id`, `pair_address`, `collected_at`) is not inserted twice.

That skip is only for that exact unique conflict. A CHECK, NOT NULL, or foreign-key mistake still fails the whole discovery-run transaction. The database does not use a broad `INSERT OR IGNORE`.

A market snapshot keeps the `discovery_observation_id` from the run that first inserted it. A later exact duplicate does not retarget that historical row to a newer observation.

## What a migration is

A migration is a versioned schema change stored in source control. Version 1 creates the Checkpoint 04 tables. The table creates and the `schema_migrations` row commit together, or they all roll back. Running `db:init` twice does not recreate them.

## What a transaction is

A transaction groups many writes so they all succeed or all fail. If anything in a discovery-run write fails, SQLite rolls the whole run back.

## Why transactions matter

Without a transaction we could store a run with only half its candidates. That would lie about history. Atomic writes keep source health, observations, links, and snapshots together.

## What WAL means

WAL (Write-Ahead Logging) is how SQLite can let one process read while another write is finishing. It creates small sidecar files next to the database. Those files are local runtime artifacts and are gitignored.

## Difference between the main records

- **Token** — one canonical Solana mint this database has seen.
- **Discovery run** — one collector cycle, with its `observed_at` time.
- **Discovery observation** — that mint as seen during that run, plus source tags and metadata.
- **Market snapshot** — a Checkpoint 02 `MarketSnapshot` stored at a collection time.

## Why one token has many observations

The same mint can appear in many cycles. We keep one token row and many observation / snapshot rows.

## Why market history is not trading performance

Stored prices and volumes are facts. They are not profit, win rate, or a reason to buy.

## Why “first observed” is not “token created”

`first_observed_at` is the earliest time **this database** recorded the mint. It can move earlier if an older run is imported later. It is not on-chain mint-creation time.

## Why non-finite JavaScript numbers are rejected

`null` means “the provider did not give this number.” `0` is a real zero. `NaN` and `±Infinity` are not valid money or volume values. The persistence layer refuses them and rolls the run back instead of storing NULL or inventing zero.

## Why a local database write is not a blockchain transaction

SQLite `BEGIN` / `COMMIT` changes a file on your computer. It does not sign, send, or simulate a Solana transaction.

## The pipeline

```text
public discovery feeds
        ↓
DiscoveryRunResult
        ↓
market enrichment
        ↓
collector
        ↓
transaction
        ↓
SQLite
        ↓
historical queries
```

`discovery:check` still only looks. `collect:once` looks and then persists.

## Commands

```bash
npm run db:init
npm run db:status
npm run collect:once
npm run collect:watch
npm run db:history -- <TOKEN_MINT>
```

The live file defaults to `./data/soltradingbot.sqlite`. Do not commit it. Schema migrations are committed; data files are not. Backups are a later ops concern.

## What the bot still cannot do

- No wallet
- No private key
- No signing
- No sending blockchain transactions
- No Jupiter or Jito
- No risk scanner
- No strategy
- No paper trading
- No real trading
