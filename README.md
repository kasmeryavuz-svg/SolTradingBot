# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 00

**Current capability: project foundation only.**

This checkpoint sets up a clean TypeScript project. It does **not** trade, scan tokens, or talk to Solana.

### What this checkpoint is not

- Real trading is **not** implemented
- No wallet exists
- No private keys or seed phrases are stored
- The bot cannot send transactions
- Paper trading is not implemented yet

If `TRADING_ENABLED=true`, the app will refuse to start. That is intentional.

## How to install dependencies

1. Install [Node.js](https://nodejs.org/) version 20 or newer.
2. Open a **new** terminal in this project folder.
3. If `node` or `npm` is not recognized, Node.js may be installed but not on your PATH. On Windows it is often at `C:\Program Files\nodejs`. Restart the terminal after installing Node.js.
4. Run:

```bash
npm install
```

## How to run the project

Copy the example environment file (optional — defaults already match this file):

```bash
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env` instead.

Then start the app:

```bash
npm run dev
```

You should see:

```text
Meme Trading Bot
Mode: development
Trading capability: disabled
```

## How to run tests

```bash
npm run test
```

Other useful commands:

```bash
npm run typecheck
npm run lint
npm run format
npm run build
```

## Folder explanation

```text
src/           Application source code
  config/      Reads settings such as NODE_ENV and TRADING_ENABLED
  core/        Startup, banner, and safety checks
  utils/       Small shared helpers
  index.ts     The program entry point
tests/         Automated tests
docs/          Project documents, including the roadmap
```

Later checkpoints will add Solana, market data, scanners, and strategies. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). They are **not** implemented yet.
