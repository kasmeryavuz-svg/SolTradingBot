# Meme Trading Bot

This project will eventually become a **Solana meme-coin trading system**.

It is being built in small, safe checkpoints so you can learn as you go. You do not need to be an experienced trader or programmer to follow along.

## Current checkpoint: 01

**Current capabilities:**

- TypeScript foundation
- configuration
- safety guard
- read-only Solana RPC connection
- Solana health check

### What this checkpoint is not

- **NO wallet exists.**
- **NO private key is used.**
- **NO transactions can be sent.**
- **NO trading exists.**

If `TRADING_ENABLED=true`, the app will refuse to start. That is intentional.

## What is an RPC connection?

RPC means Remote Procedure Call. In this project it is a way to ask a public Solana server a question and get an answer, similar to opening a webpage.

This checkpoint only asks read-only questions, such as “what is the current slot?” and “is this node healthy?” It cannot move money, sign anything, or change the blockchain.

Public Solana RPC endpoints are acceptable for development and testing. They are **not** appropriate for a production trading bot because they can rate-limit you and are less reliable than a dedicated RPC provider.

## How to install dependencies

1. Install [Node.js](https://nodejs.org/) version 20.18 or newer.
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

You should see something like:

```text
Meme Trading Bot
Mode: development
Trading capability: disabled

Solana:
Network: mainnet-beta
RPC: connected
Slot: 123456789
Version: 2.x.x
Health: ok

Checkpoint: 01
Mode: READ ONLY
```

The slot and version numbers come from the live Solana network, so they will change.

## How to check Solana connectivity

```bash
npm run solana:check
```

This command only performs the read-only health check. It does not create a wallet or trade. It exits with code 0 when the check succeeds, and a non-zero code when it fails.

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
  config/      Reads settings such as NODE_ENV, TRADING_ENABLED, and Solana RPC
  core/        Startup, banner, and safety checks
  solana/      Read-only Solana RPC client and health check
  utils/       Small shared helpers
  index.ts     The program entry point
tests/         Automated tests (they do not require a live Solana connection)
docs/          Project documents, including the roadmap
```

Later checkpoints will add market data, scanners, and strategies. Those pieces are listed in [docs/ROADMAP.md](docs/ROADMAP.md). They are **not** implemented yet.

See [docs/CHECKPOINT_01.md](docs/CHECKPOINT_01.md) for a short explanation of this checkpoint.
