# Strategy research sources

Phase 12.5 reviewed external work as **research references**. It did **not** copy strategy source, port Python line-by-line, or add Freqtrade / Hummingbot as dependencies.

r125_v1 candidates are **clean-room TypeScript hypotheses**. They are **not** faithful reproductions of academic portfolios or third-party bots.

This file distinguishes:

- **concept inspired by** — we borrowed an idea (momentum, modular strategy vs execution)
- **faithful reproduction of** — we did **not** claim this

Observed licenses are described as published on the reviewed repositories. This is not a legal opinion.

## Matrix

| Source | Type | Strategy concept | Data it typically needs | Can c06_v1 represent it? | In r125_v1? | Why / why not | License note | Methodological warning |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Frozen s07_v1 | internal | Conservative flow + 5m momentum band + risk blockers | c06_v1 vector | Yes — it **is** s07 | Yes as `s07_baseline` | Delegates to frozen `evaluateStrategy`; not reimplemented | Internal | Baseline, not a recommended live strategy |
| Internal quality gate | internal | Liquid / fresh / non-blocking-risk eligibility | c06 market + 7 blocking risk flags | Yes | Yes as `quality_control_v1` | Control for “does overlay matter?” | Internal | Not a recommended live strategy |
| Moskowitz, Ooi, Pedersen-style time-series momentum (classic TSMOM literature; used as conceptual background) | academic_research | Trade an asset if its own past return is positive | Long, regular return series / futures-style portfolios | Only as a **proxy**: c06 has provider 5m/1h/24h `%` change, not a constructed lookback/hold portfolio | Concept only: `time_series_momentum_v1` | Not a 12-month/1-month academic portfolio; no volatility scaling | NBER working papers are academic publications | Equity/futures results do not transfer to sparse meme-coin snapshots |
| Liu & Tsyvinski, *Risks and Returns of Cryptocurrency*, NBER 24877 | academic_research | Crypto return factors; network/attention predictors in their sample | Broad crypto market history, not 5-minute DEX snapshots | No — not the same dataset or factors | No | Inspiration/warning only | Academic working paper | Not a Solana meme-coin execution study |
| Liu, Tsyvinski & Wu, *Common Risk Factors in Cryptocurrency*, NBER 25882 | academic_research | Cross-sectional crypto factors (market, size, momentum-style sorts) | Cross-section of coins, constructed portfolios | No — r125 does not form long/short factor portfolios | No | We do not reproduce their factor construction | Academic working paper | Factor portfolios ≠ one-token entry rules on DEX snapshots |
| Han, Kang & Ryu, *Time-Series and Cross-Sectional Momentum in the Cryptocurrency Market…*, SSRN 4675565 | academic_research | Crypto TS/CS momentum under more realistic assumptions | Regular prices, costs, intra-horizon moves | Partial proxy only (provider windows, **no** cost model) | Concept only for TS proxy | Paper warns many “significant” momentum results weaken with costs and intra-horizon liquidation | SSRN preprint | r125 has **no costs**; do not treat GROSS paper PnL as that paper’s net result |
| Freqtrade official strategies repo | open_source_reference | Momentum/trend, RSI, EMA, MACD, ROI/trailing exits | OHLCV candles + indicators | RSI/EMA/MACD: **no** faithful OHLC history in c06. Simple momentum: only provider `%` windows | Momentum **concept** only. RSI/EMA/MACD **not** implemented | Do not rename a c06 `%` change as “RSIStrategy” | Repository documents **GPL-3.0** | Copying strategy files would be a license/clean-room violation; indicators are not interchangeable |
| Hummingbot strategies / V2 architecture | open_source_reference | Modular strategy vs execution; market making / order-book logic | Order book, balances, live order APIs | Order-book MM: **no**. Architecture lesson: yes (candidate logic ≠ simulator ≠ SQLite ≠ CLI) | Architecture inspiration only. No MM candidate | We have no order-book depth or execution model | Hummingbot client repo documents **Apache-2.0**; follow each repo’s license | Do not pretend a snapshot-entry lab is Hummingbot market making |

## What was not copied

- No Freqtrade strategy Python
- No Hummingbot executor/controller Python
- No GPL implementation details translated into this TypeScript tree
- No third-party strategy names used as if we reproduced them

## What cannot currently be reproduced with c06_v1

- RSI / EMA / MACD / Ichimoku / Supertrend that need proper OHLC candles
- Trailing stop / ROI tables / partial exits (x11 is a full close at fixed thresholds)
- Order-book market making, Avellaneda–Stoikov, inventory skew
- Cross-sectional academic portfolios (rank all coins, long winners / short losers)
- Cost-aware net performance, latency, MEV, failed transactions

If a later checkpoint adds candle history or an execution model, that is a **new** research spec. Do not keep the r125_v1 name.

## Why academic / CEX results do not transfer automatically

Solana meme-coin snapshots in this database are sparse, pair-specific, and provider-windowed. Papers often use liquid coins, regular bars, and portfolio construction. SSRN 4675565 in particular warns that ignoring costs and intra-horizon moves can overstate momentum. r125 is GROSS paper reference evidence on **this** sample only.
