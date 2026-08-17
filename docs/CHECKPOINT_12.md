# Checkpoint 12 — Gross paper performance analytics

Checkpoint 12 sits **after** the frozen paper lifecycle:

`s07_v1` → `p09_v1` → `pm10_v1` → `x11_v1`

It is the first checkpoint allowed to calculate **descriptive GROSS paper-trade PnL and return metrics**. It reads immutable completed paper positions from SQLite. It does not trade, does not change the strategy, and does not store analytics rows.

`a12_v1` (`gross_closed_paper_trade_analytics`) is a **descriptive sample report**. It is not live profitability, not net profitability, not a forecast, and not an optimized strategy result.

## What gross paper PnL means

For one completed simulated paper trade:

```text
GROSS exit value = stored quantity × observed exit reference price
GROSS paper PnL  = GROSS exit value − $100 reference notional
```

Example: quantity `1`, exit price `$120`, reference notional `$100` → GROSS paper PnL is `+$20`.

That number is a **paper accounting identity** over stored prices. It is **not**:

- net profit after fees
- money in a wallet
- a live Solana fill
- proof the strategy will make money later

## What gross return means

```text
GROSS return % = ((exit price / entry price) − 1) × 100
```

Example: entry `$100`, exit `$120` → `+20%`. Entry `$50`, exit `$100` → `+100%`.

Checkpoint 12 does **not** recompute quantity as `100 / entry price` when calculating PnL. It **does** prove the stored quantity equals that frozen pm10_v1 fact (`Object.is`) before using the stored quantity. Source identities are recomputed from the loaded opening and exit facts using the frozen p09/pm10/x11 builders. Changing a stored price, quantity, pair, or timestamp while leaving identity text untouched fails the whole report.

IEEE `-0` is canonicalized to `+0` in analytics numbers. That is not rounding.

## Why this is not net or live profitability

The stored x11 exit price is an **observed market reference price**, not a guaranteed executable fill.

This checkpoint subtracts **no costs**:

- no DEX trading fees
- no Solana base or priority fees
- no slippage
- no price impact
- no MEV
- no transaction latency
- no failed transactions
- no partial fills
- no token transfer restrictions or taxes

If those were included, GROSS paper PnL would be smaller, and sometimes the close would not happen at all.

Gross paper results are **not evidence of live profitability**.

## Why fees and slippage matter

A meme-coin “win” of a few percent can disappear after:

- the DEX swap fee
- the Solana fee
- the price moving while a transaction is sent
- the pool’s price impact on the size you actually trade

Checkpoint 12 does not model those yet. That is why every money and return number is labeled **GROSS**, **PAPER**, and **REFERENCE**.

## Why the observed exit price is not a guaranteed fill

x11 asked DEX Screener for the **same opening pair** and stored that `priceUsd`. A real sell would have to:

- build a swap
- pay fees
- land a transaction
- accept whatever fill the pool gives

None of that exists yet. Treat the exit price as a **reference observation**.

## What win rate means

```text
win rate % = win count / closed trade count × 100
```

A trade is a **win** only when GROSS paper PnL is exactly greater than `0`. A **loss** is exactly less than `0`. **Breakeven** is exactly `0`. There is no rounding and no epsilon.

A high win rate alone does **not** prove profitability. Many small wins and one large loss can still produce negative total GROSS paper PnL. Look at totals, mean, median, profit factor, and winner concentration together.

## Profit factor

```text
profit factor = total positive GROSS paper PnL / absolute total negative GROSS paper PnL
```

- If there are losses, calculate normally.
- If there are no losses, the value is `n/a`, not Infinity.
- If there are losses but no winners, the value is `0`.
- If there are no closed trades, the value is `n/a`.

This is a **sample ratio** over completed paper trades. It is not proof of a future edge.

## Payoff ratio

```text
payoff ratio = mean winning GROSS PnL / absolute mean losing GROSS PnL
```

This is only available when the sample has **at least one winner and one loser**. Otherwise it is `n/a`.

## Mean and median

- **Mean GROSS PnL** is the historical gross sample mean of closed-trade PnL. It is not a prediction and not “expectancy” in the live-trading sense.
- **Median** is the middle value (or the midpoint of the two central values when the count is even). It is less pulled by one huge winner than the mean.

When a subgroup has no trades (for example no winners), the mean for that subgroup is `n/a`, not `0`.

## Closed-trade cumulative PnL drawdown

`maxClosedTradeCumulativePnlDrawdownUsd` is calculated like this:

1. Sort completed trades oldest → newest by exit time (then by immutable source identities).
2. Start cumulative GROSS paper PnL at `0`.
3. After each close, add that trade’s GROSS paper PnL.
4. Track the running **peak** of that cumulative series (the peak also starts at `0`).
5. Drawdown at each step is `peak − current cumulative`.
6. The metric is the **maximum** of those USD differences.

There is **no drawdown percentage**.

### Why this is not portfolio drawdown

The bot does **not** have a bankroll, wallet, or equity curve. Overlapping positions and capital usage are not modeled. Several `$100` reference trades in a row are **not** the same as starting with `$100` and compounding.

This drawdown is only a diagnostic over the **sequence of closed paper trades**.

## Winner concentration

Meme-coin samples are often dominated by a few huge winners.

- `top1WinnerGrossPnlContributionPct` asks: of all **positive** GROSS paper PnL, what share came from the single largest winner?
- `top3WinnersGrossPnlContributionPct` asks the same for up to three largest winners.
- The denominator is **total positive GROSS PnL**, not net PnL. The overall sample can still be negative.

Removing those winners and reporting GROSS PnL without them is a **fragility diagnostic**. It is not a rule for optimizing the strategy. If almost all of the sample’s gains came from one trade, the headline total is fragile.

## Why there is no Sharpe or CAGR yet

Sharpe, Sortino, Calmar, CAGR, and annualized return need a realistic clock, a capital base, and usually a cost model. Checkpoint 12 has none of those. Adding them now would look scientific and still be misleading.

## Why there is no bankroll or equity curve yet

The `$100` figure is a **per-trade reference notional** from pm10. Summing those notionals is **not**:

- a wallet balance
- required starting capital
- concurrent exposure

`totalReferenceNotionalUsd` is the sum of each closed trade’s `$100` reference size. Aggregate GROSS return is:

```text
total GROSS paper PnL / total reference notional × 100
```

That is **aggregate gross return on summed trade reference notional**. It is not portfolio return and not compounded return.

## Why no-trade output cannot be read as 0% performance

The current live local database may have **zero** completed paper positions. That is expected.

`performance:report` then says:

- Dataset status: `no_closed_trades`
- Closed trades: `0`
- No performance conclusion is available

It must **not** say `0% return`, `0% win rate`, or “the strategy broke even”. Nothing closed, so there is no sample to describe.

## What is eligible

An `a12_v1` trade exists only when all of these immutable rows exist:

- one `paper_positions` row
- one `paper_position_exits` row for that exact position
- the linked closing `exit_evaluations` row (`close_position` only)
- the opening paper / position / strategy chain that proves frozen s07/p09/pm10/x11 identity

Open positions are not completed trades. A `no_change` x11 evaluation is not a completed trade. The command does not mark-to-market open positions or invent an exit from a later price.

## How to run it

Requires `DATABASE_ENABLED=true` and an existing SQLite file. Opens that file **read-only** with `PRAGMA query_only = ON`. No network. No writes. No `performance:watch`.

```bash
npm run performance:report
npm run performance:trades
```

`performance:report` always uses **every** eligible closed trade. There is no date filter, token filter, or “best period” switch. One corrupt completed-trade row fails the whole report; it is not dropped from the denominator.

`performance:trades` only limits **how many rows are printed**. Default `PERFORMANCE_TRADE_LIMIT=20` (allowed `1..100`). That display bound does not change the aggregate report, dataset fingerprint, or metrics. Both commands load and validate the complete eligible dataset inside one SQLite deferred read snapshot, then `performance:trades` slices for display.

`npm run dev` does **not** run these commands.

## What this checkpoint does not do

- no wallet, signer, private key, or transaction
- no Jupiter, Jito, or swap execution
- no strategy / entry / exit mutation
- no migration 008 and no stored analytics tables
- no Strategy Research / Benchmark Lab (planned as phase 12.5)
- no Dashboard (Checkpoint 13)

SQLite schema remains **version 7**. Metrics are recomputed from immutable stored data every time.
