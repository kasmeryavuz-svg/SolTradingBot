# Production runbook

This runbook is for the Checkpoint 20 **paper / data only** supervisor. It is not a live-trading playbook.

## What you are deploying

You can run:

- **Data collection** — public discovery and market evidence into SQLite
- **Paper watchlist validation** — simulated positions for mint addresses you list yourself

You are **not** deploying automatic real-money trading. Checkpoint 16 tiny-live remains a separate manual command. Do not run `live:execute` from production.

Checkpoint 19 currently reports `NO_MODEL_PROMOTION_INSUFFICIENT_DATA`. That is expected on a young database. It is **not** a reason to enable live trading. prod20 may mention research readiness. It must not act on it.

## First-time host setup

1. Install Node.js **24.15.0 or newer**.
2. Copy `.env.production.example` to `.env.production`.
3. Keep `TRADING_ENABLED=false` and `LIVE_BROADCAST_ENABLED=false`.
4. Initialize SQLite once (`npm run db:init` with `DATABASE_PATH` pointing at the production file, or start from a copied empty initialized file).
5. Run `npm run prod:status`, `npm run prod:plan`, and `npm run prod:preflight`.
6. Only then run `npm run prod:run` or Docker Compose.

## Data collection versus paper validation

If `PROD20_COLLECTOR_ENABLED=true`, each cycle first runs the existing collector primitive `runCollectorCycle`. That uses the same discovery feeds and optional market enrichment as `collect:once`. It does not invent new discovery rules.

If `PROD20_PAPER_ENABLED=true`, you must set `PROD20_PAPER_MINTS` to a comma-separated list of Solana **mint addresses**. The supervisor:

1. Looks up whether an **open paper position** already exists for that mint.
2. If open: runs existing `executeExitStep` only (10% stop, 20% take, 6-hour max hold, full close, exact opening pair).
3. If closed: runs existing `executePositionStep` only (live market + risk + c06 + s07 + paper decision + position management).

A mint is processed once per cycle. If an exit closes a position, that mint is **not** reopened in the same cycle.

Do not put token symbols, token names, or wallet addresses in `PROD20_PAPER_MINTS`.

## How the scheduler works

Default interval: **300000 ms** (5 minutes). Minimum 60000. Maximum 3600000.

This is a **fixed delay**, not a fixed rate. If a cycle takes 7 minutes and the interval is 5 minutes, the next cycle starts 5 minutes **after** the slow cycle finishes. Missed cycles are not queued.

## Health versus readiness

The process always binds **127.0.0.1** and `PROD20_HEALTH_PORT` (default **4314**). The host is a constant. There is no `PROD20_HEALTH_HOST` environment override. Do not bind `0.0.0.0`.

| Endpoint | Meaning | Typical status |
| --- | --- | --- |
| `GET` / `HEAD` `/healthz` | Process is alive | 200 until the process exits |
| `GET` / `HEAD` `/readyz` | Safe to treat the supervisor as operational | 503 until the first successful cycle; 200 after success; 503 after a failed cycle until a later success; 503 while shutting down |

### Bare metal (`npm run prod:run`)

Health is **host-local**. From that same machine you may inspect `http://127.0.0.1:4314/healthz` (or the configured port).

### Docker

Health is **container-local**. Compose does **not** publish port 4314. Docker HEALTHCHECK calls `http://127.0.0.1:4314/healthz` from inside the same container so a container can stay "healthy" while it is still warming up. Application readiness is stricter.

Do **not** browse `localhost:4314` for the Docker deployment. Use:

```bash
docker compose -f docker-compose.production.yml ps
docker compose -f docker-compose.production.yml logs
```

Publishing `127.0.0.1:4314:4314` would bind the **host** loopback and NAT to the **container IP**. A process listening only on the container's `127.0.0.1` is not reachable through that path. prod20_v1 keeps the application on container loopback and leaves the port unpublished.

## Singleton lock

The lock file is `.prod20-runtime.lock` in the production data directory (the directory that contains the SQLite file). Payload: `specVersion`, `specFingerprint`, `pid`, `processStartedAtMs` (integer `performance.timeOrigin`), `runtimeStartedAt`. No secrets, paths, or env values. On POSIX the file is created with mode `0600` when the filesystem allows it.

- Same PID and same process-start identity: this process already owns or is associated with the lock. A second supervisor in the same Node process fails and does **not** delete the first lock.
- Same PID and a **different** process-start identity: crashed-container PID reuse. The old lock is stale, removed, then acquired.
- Different PID that liveness still reports alive: fail closed (`production_instance_already_running`). Do not kill it. Do not delete the lock. Cross-process start-time is not proven with Node built-ins alone.
- Different PID that is dead: stale, removed, then acquired.
- Malformed JSON or an unknown spec/fingerprint: **fail closed**. Do not delete the file automatically.

On graceful shutdown the process removes the lock only if it still owns the same pid, process-start identity, runtimeStartedAt, and fingerprint.

## Graceful shutdown

Send SIGINT or SIGTERM once.

- Readiness becomes false.
- A new cycle does not start.
- The current collector or mint operation is allowed to finish.
- The health server closes.
- The owned lock is released.
- The process exits 0.

A second signal uses the same handler. prod20_v1 does not `process.kill` itself. Do not force-kill during a SQLite write if you can wait one cycle.

After three consecutive **recoverable** failed cycles the supervisor shuts down with **exit code 1**. A fatal database, lock, config, health-bind, or health-server failure exits **immediately** with code 1. It does not wait for three cycles.

Docker `restart: unless-stopped` may start a **new** process. That new process has a new `performance.timeOrigin`. If the previous process cleaned up, there is no lock. If it died before cleanup and the kernel reused PID X, the new process-start identity does not match the lock, so the old lock is treated as stale instead of a false permanent lockout.

There is no internal process-spawning restart loop. Startup preflight runs again after Docker restarts the container.

## Docker volume

Compose mounts `production-data` at `/app/data`. The SQLite file, WAL/SHM side files, and the lock file live there. The container root filesystem is read-only. `/tmp` is tmpfs.

## Backing up SQLite

This project opens file databases with **`PRAGMA journal_mode = WAL`**. Copying only `market.sqlite` while the supervisor is running can miss commits that still sit in `market.sqlite-wal`.

Preferred production backup:

1. Stop the production service cleanly (`docker compose ... stop` or SIGTERM and wait).
2. Verify the process has exited.
3. Copy **all** of these if they exist:
   - the main database file (`market.sqlite` or your configured name)
   - `-wal`
   - `-shm`
4. Store the copies together.

Do not invent a hot-copy of the main file alone. If you later add an official SQLite backup/checkpoint helper, use that instead of copying a live WAL database.

## Restoring SQLite

1. Stop production.
2. Replace the database file and any `-wal` / `-shm` companions with the backup set.
3. Do not mix a new main file with an old WAL file.
4. Run `npm run prod:preflight` (or the same checks in the container) before start.

## Updating the application

1. Stop production cleanly.
2. Back up SQLite as above.
3. Deploy the new image or `dist`.
4. Confirm schema is still **9** and migration **010** is absent.
5. Run preflight.
6. Start production.

## Rollback

1. Stop production.
2. Restore the previous image or `dist`.
3. Restore the matching SQLite backup if the failed version wrote research/paper rows you do not want.
4. Preflight, then start.

## Logs

The supervisor writes JSON lines to stdout/stderr. They include event, cycle number, component, result, and duration. They must not include RPC URLs, API keys, private keys, environment dumps, or absolute filesystem paths.

## Secrets

Never put a private key, seed phrase, or mnemonic in `.env` or `.env.production`. Checkpoint 15 loads secrets only from a hidden interactive TTY. Production does not load a signer.

Compose forces `TRADING_ENABLED=false` and `LIVE_BROADCAST_ENABLED=false` so an env-file mistake cannot enable live broadcast.

## Why manual CP16 live stays separate

`live:execute` can send one hard-capped WSOL→USDC transaction after TTY confirmation. That is plumbing, not a strategy loop. Wiring it into prod20 would make a collector restart able to spend money. That is out of scope and forbidden.
