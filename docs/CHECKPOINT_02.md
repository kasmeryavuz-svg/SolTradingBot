# Checkpoint 02 — Live read-only market data

This checkpoint teaches the bot to **observe** a few known tokens. It still cannot discover new coins, judge them, or trade.

## What market data is

Market data is a snapshot of public trading information: the last price, how much money is in the pool, and how busy trading has been. Think of it as looking at a scoreboard, not placing a bet.

None of these numbers alone proves that a token is a good investment.

## Price

The current approximate market price of one token, in US dollars when the data source provides it.

A price can move quickly. A higher price is not automatically “better.”

## Liquidity

The amount of capital available in the trading pool.

Higher liquidity generally means a trade can be made with less price impact. Low liquidity can make the price jump a lot when someone buys or sells.

## Volume

How much value has been traded during a period, such as 5 minutes, 1 hour, or 24 hours.

High volume means the pair is busy. It does not mean the token is safe.

## Buys and sells

The number of buy and sell transactions during a period.

These are counts of trades, not a recommendation to buy or sell. This bot cannot execute a buy or a sell.

## Market cap

Token price multiplied by circulating supply, **when that value is available**.

If the data source does not provide market cap, we store `null`. We do not invent it.

## FDV

Fully diluted valuation: the valuation you would get if you used the **full** token supply, including tokens that are not circulating yet.

Market cap and FDV are different. This bot never copies FDV into the market-cap field.

## Trading pairs

A pair is a pool that connects two assets, such as TOKEN/SOL or TOKEN/USDC.

The DEX is the decentralized exchange where that pool lives, for example Raydium or Orca.

## Why we select the highest-liquidity usable pair

One token can trade in many pools. DEX Screener’s USD price, market cap, FDV, and price-change fields describe the **base** token of a pair, not the quote token.

For Checkpoint 02 we only accept a Solana pair when:

1. the requested mint is the **base** token
2. that pair has a valid USD price

Quote-only pairs are rejected. We do not invert a base price to guess a quote price, and we do not copy the base token’s market cap, FDV, name, or symbol onto the requested token.

Among those base-oriented pairs, we prefer positive USD liquidity and then pick the highest-liquidity candidate. A deeper quote-oriented pool is ignored if a valid base-oriented pair exists.

Liquidity, volume, and buy/sell counts are **pair-level** statistics. They describe the pool, not a single token’s valuation.

## Why data quality matters

Bad or thin data can make a token look cheap, busy, or huge when the pool is tiny. Missing fields stay `null`. We do not fill gaps with guesses.

Public DEX Screener data is fine for learning. It is not a production trading feed.

## What the bot still cannot do

- No wallet
- No private key
- No signing
- No sending transactions
- No Jupiter or Jito
- No automatic meme-coin discovery
- No strategy
- No paper trading
- No real trading

Use `npm run market:check` for one snapshot and `npm run market:watch` to refresh the manual watchlist every 15 seconds. Press `CTRL+C` to stop the watcher.
