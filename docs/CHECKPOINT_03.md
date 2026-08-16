# Checkpoint 03 — Read-only Solana token candidate discovery

This checkpoint teaches the bot to **find** token addresses that appeared in public discovery feeds. It still cannot judge those tokens, store them in a database, or trade them.

## What discovery means

Discovery means only this:

> This token mint appeared in one of the discovery sources we configured.

It does **not** mean the token is good, safe, new, a meme coin, or a buy.

## What a token mint is

A mint address is the unique ID of a token on Solana. Many tokens can share a name like “PEPE”. The mint is how we tell them apart.

## What a discovery candidate is

A `DiscoveryCandidate` is a Solana mint our bot observed in a public feed, plus factual metadata from that feed.

It is not a recommendation. It has not passed a risk scanner. Checkpoint 05 will add risk scanning later.

## What “latest profiles” means

DEX Screener publishes a **latest token profiles** feed.

A profile appearing there means the provider included that token in its latest-profile list. It does **not** mean:

- the token was just minted on Solana
- this is the exact on-chain launch time
- the token is new, trending, or high quality

## What a boosted token means

DEX Screener also publishes a **latest boosts** feed.

A boost is promotional / provider metadata. Someone can pay to highlight a token. A boost does **not** mean:

- quality
- safety
- legitimacy
- bullishness
- buying pressure
- a higher chance of profit

We store boost amounts only as facts from the provider.

## Why a candidate is not a buy signal

The bot still has no wallet, no strategy, and no risk scanner. Seeing a mint in a feed is like seeing a name on a public bulletin board. It is not a reason to buy.

## Why “first seen by our bot” is different from “newly minted”

`discovery:watch` remembers mints in memory for this process only.

- **First seen / NEW** means: this running process has not printed that mint before.
- It does **not** mean the token was newly created on Solana.

Restarting the watcher clears that memory. Checkpoint 04 will add a database.

We also do **not** invent fields such as `launchTime`, `tokenCreatedAt`, or `mintCreatedAt`. Those would need authoritative on-chain evidence, which this checkpoint does not collect.

These times stay separate when they exist:

- `observedAt` — when our bot collected the candidate during this discovery cycle. It is not token-created, mint, launch, or listing time.
- `profileUpdatedAt` — only a documented provider profile-update timestamp. The official DEX Screener latest-profile and latest-boost contracts do **not** document one, so this field stays `null`. We do not copy `observedAt`, pair creation time, boost metadata, or undocumented fields such as `updatedAt`.
- `marketSnapshot.pairCreatedAt` — when the selected DEX pair was created, if the market-data module has it. This is pair age, not mint-creation time.

None of those is automatically the mint-creation time.

## Why we deduplicate token mints

The same mint can appear twice in one feed, or in both the profile feed and the boost feed. We keep **one** candidate per mint and merge the source tags, for example:

`dexscreener_profile`, `dexscreener_boost`

That avoids counting the same token twice. It is not a ranking.

Merge precedence is by source, not by whichever JSON object arrived last:

- `dexScreenerUrl` and `description`: first non-null profile value, otherwise first non-null boost value
- `links`: profile links first, then unique boost URLs
- `profileUpdatedAt`: profile source only (null for current DEX Screener feeds)
- `boostAmount` / `boostTotalAmount`: boost source `amount` / `totalAmount` only
- `observedAt`: our collection time for this cycle
- `sources`: each tag at most once, profile then boost

A later boost record cannot erase profile metadata. Same-source duplicates keep the first non-null value in that source’s encounter order. Missing values stay `null`.

## Why market enrichment can fail

After discovery, we may ask the existing Checkpoint 02 market-data module for a `MarketSnapshot`.

A newly observed token may have no usable base-oriented pair, no price, a provider error, or it may disappear. If enrichment fails for one mint:

- that candidate is still kept
- `marketSnapshot` is `null`
- `marketDataStatus` is `unavailable`
- other candidates continue

We still only accept pairs where the requested token is the **base** token. We do not invert quote prices.

## Why no risk scanner exists yet

Checkpoint 05 will look at things like mint authority, freeze authority, and holder concentration. This checkpoint only collects public discovery facts. We do not turn those facts into safety scores.

## The pipeline

```text
public discovery feeds
        ↓
   Solana only
        ↓
   validate mint
        ↓
   deduplicate
        ↓
   candidate cap
        ↓
optional market snapshot
        ↓
    display only
```

The candidate cap (`DISCOVERY_MAX_CANDIDATES`) is an operational / rate-limit control. We interleave successful sources so one feed does not starve the other. Retained candidates are **not** “best” or “top picks”.

## Commands

```bash
npm run discovery:check
npm run discovery:watch
```

`discovery:check` runs one read-only cycle and exits.

`discovery:watch` repeats about every 30 seconds by default. Press `CTRL+C` to stop. `NEW` means new to this process, not newly minted.

`npm run dev` does **not** start discovery or market watchers.

## What the bot still cannot do

- No wallet
- No private key
- No signing
- No sending transactions
- No Jupiter or Jito
- No risk scanner
- No strategy
- No paper trading
- No real trading
- No database
