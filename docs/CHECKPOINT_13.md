# Checkpoint 13 — Local read-only observability dashboard

Checkpoint 13 adds a browser UI that **looks at** the bot. It does **not** operate the bot.

Spec: `d13_v1`  
Name: `local_read_only_observability_dashboard`

The dashboard binds only to `127.0.0.1` and reads already-stored SQLite evidence plus the existing a12 and r125 report builders. It stores nothing. Schema stays **7**. There is no migration 008.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Observability | Seeing what is already stored or already computed |
| Trading console | Something this dashboard **is not** |
| Latest stored observation | The last market row in SQLite, which may be old |
| Live price | A current DEX quote. This dashboard does **not** fetch one |
| Runtime paper | p09 / pm10 / x11 rows from the live paper lifecycle |
| Research trades | Synthetic r125 historical simulations. Not the same rows |
| GROSS | Paper math that ignores fees, slippage, and execution |
| NET | After costs. This dashboard does **not** compute net PnL |

A good historical GROSS number is still only a description of **this sample**. It is not a forecast.

## What the dashboard does

- Shows bot / safety status: read-only, trading disabled, wallet not implemented
- Shows local database coverage counts and latest stored timestamps
- Shows recent stored market snapshots (display limit 25)
- Shows current open runtime paper positions and recent closed runtime paper trades
- Shows a12 GROSS paper performance, including a closed-trade cumulative GROSS PnL chart when trades exist
- Shows r125 strategy research coverage and all five candidates in canonical `candidateId` order
- Shows raw data-health counts and an on-demand read-only integrity check

Start:

```bash
npm run dashboard:start
```

Open [http://127.0.0.1:4313](http://127.0.0.1:4313). Press `CTRL+C` to stop.

`npm run dev` does **not** start the dashboard.

## What it does not do

- No buy, sell, open, or close buttons
- No `paper:step`, `position:step`, or `exit:step`
- No starting collectors or watchers
- No strategy threshold or configuration writes
- No enable-trading switch
- No wallet, signer, or transactions
- No React, Vite, Next.js, Express, Fastify, or chart libraries
- No CORS, CDN, Google Fonts, or third-party scripts
- No Solana RPC / DEX Screener / Jupiter / other HTTP APIs from dashboard requests
- No SQLite writes, no dashboard tables, no migration 008

If `TRADING_ENABLED=true`, `dashboard:start` refuses to start with a Checkpoint 13 read-only message. The dashboard is not a way around the trading guard. The shared Checkpoint 00 trading-safety implementation is unchanged; the dashboard command wraps the refusal for this UI.

## Why there is no trading button

Checkpoint 13 is observability. Real execution is Checkpoint 14 and is **not** started. A green BUY button would imply the process can trade. It cannot.

The top bar always shows **READ ONLY** and **TRADING DISABLED** in words, not only by color.

## Runtime paper vs research trades

Runtime paper rows come from the live p09 / pm10 / x11 pipeline stored in SQLite.

Research trades are rebuilt in memory by r125 against the historical snapshot universe. They reuse a12-compatible GROSS math. They are **not** stored x11 closes.

The dashboard keeps these sections separate so a research simulation cannot look like an open live paper position.

## GROSS vs net

Displayed performance is **GROSS paper performance**. It excludes fees, slippage, price impact, MEV, failed transactions, and partial fills. It is not wallet equity and not live PnL.

## Latest stored observation vs live price

Market cards show values from `market_snapshots`. Refresh reloads **local JSON**. It does not pull a new DEX quote. Do not read a stored price as “the price right now.”

## Why zero trades is a valid empty state

The current local database may have snapshots but no completed runtime paper trades, and research candidates may show many `insufficient_data` decisions. That is honest. The UI shows empty states and `n/a`. It does **not** print a 0% win rate or call that a breakeven strategy.

Do not loosen research rules to make the table prettier.

## Why CORS is disabled

The API is same-origin only: the HTML page on `http://127.0.0.1:<port>` talking to `/api/v1/*` on that same origin. There is no `Access-Control-Allow-Origin: *`. Other websites should not read this local database through the browser.

## Why security headers exist

The server sends CSP, `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, `no-store`, and a tight Permissions-Policy so the page cannot load outside scripts, be framed, or use camera/mic/geo. Host headers must look like `127.0.0.1:<port>` or `localhost:<port>` to reduce DNS-rebinding tricks.

Only GET and HEAD are allowed. POST and other methods return 405.

## Why secrets are sanitized

The API never returns `SOLANA_RPC_URL`, API keys, private keys, `process.env`, stack traces, or full home-directory paths. Sanitized configuration may show node environment, Solana **network** name, whether the database is enabled, the database **filename**, discovery enabled, configured market token count, checkpoint, and dashboard spec version.

## Why the dashboard does not call Solana or DexScreener

Those network calls belong to collector / market / risk commands. The dashboard is a viewer over **already stored** evidence. Calling RPC from a refresh loop would mix live I/O into an observability checkpoint and could surprise the operator.

`npm run dev` may still do its existing independent read-only Solana health check. `dashboard:start` does not.

## How future Checkpoint 14 differs

Checkpoint 14 is the real execution engine. It is **not** implemented here. A future execution engine would send transactions. This dashboard must not grow execution controls while waiting for that work.

## Why query strings are rejected

Checkpoint 13 has no data-selection API. `/api/v1/research?best=true` must not become a hidden cherry-pick. Unexpected query parameters return 400. Absolute-form request targets such as `GET http://evil.example/api/v1/dashboard` are also rejected.

## Why `tsc` does not ship a deployable dashboard

`npm run build` compiles TypeScript into `dist/`. It does **not** copy `src/dashboard/public/` (`index.html`, `app.js`, `styles.css`) into `dist`. That is acceptable for Checkpoint 13: `npm run dashboard:start` runs TypeScript from source with `tsx` and reads those files from `src/dashboard/public`. `dist` is not a self-contained dashboard artifact. Packaging belongs to Checkpoint 20.

## What was not claimed

This checkpoint did not run a headed browser (Playwright/Puppeteer) walkthrough. Frontend behavior is covered by Node syntax checks, ESLint on `app.js`, and automated execution against a DOM stub.

The dashboard is **not** one atomic database snapshot. Sections may be rebuilt under separate read-only transactions. Individual a12 and r125 reports keep their own coherent load semantics.

Recent markets (25) and recent runtime closed trades (20) are UI limits only. They do not change a12 metrics, r125 metrics, or fingerprints.
