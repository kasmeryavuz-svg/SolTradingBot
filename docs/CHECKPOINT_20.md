# Checkpoint 20 — Production deployment

Checkpoint 20 adds a **paper-only production supervisor**. It can collect public market and discovery evidence for a long time, and it can optionally manage **explicit paper watchlist** positions. It does **not** turn the project into unattended real-money trading.

Spec: `prod20_v1`  
Name: `paper_only_production_supervisor_and_release_readiness`

Schema stays **9**. Migration **010 does not exist**.

## The most important sentence

**A production deployment is not automatic live trading.**

`TRADING_ENABLED=true` or `LIVE_BROADCAST_ENABLED=true` makes `prod:run` fail closed before network, database writes, or lock acquisition. Manual Checkpoint 16 `live:execute` remains a separate operator command. The production process never imports `src/live`, `src/wallet`, or `src/execution`.

## Beginner map

| Idea | What it means here |
| --- | --- |
| Production supervisor | One long-running Node process that repeats a fixed cycle, then waits |
| Data collection | Reuses the existing collector: public discovery feeds plus optional market snapshots into SQLite |
| Paper watchlist | Only the mint addresses you list in `PROD20_PAPER_MINTS` can open or close simulated positions |
| Why the watchlist is explicit | Discovery may see many meme tokens. Automatically paper-trading all of them would silently become a new entry-selection strategy |
| Fixed delay | After a cycle finishes, wait `PROD20_INTERVAL_MS`, then start the next. There is no catch-up queue |
| Serial work | Collector finishes, then mint A, then mint B. Nothing writable runs in parallel |
| Open-position snapshot | If a paper position is already open when that mint is handled, only exit logic runs. If it is closed, only position-entry logic runs. No same-cycle close then reopen |
| Health | `/healthz` means the process is alive |
| Readiness | `/readyz` means startup passed, the lock is held, a cycle has succeeded, and the process is not shutting down |
| Singleton lock | A file that binds pid + process-start identity (`performance.timeOrigin`) + runtime start. Same PID with a new process start is stale reuse, not a live owner |
| Circuit breaker | Three consecutive recoverable cycle failures stop the process with exit code 1. A fatal DB/lock/health failure exits immediately |
| ML / wallet intelligence | Research status may be displayed. They are not production trading inputs. CP19 is currently `NO_MODEL_PROMOTION_INSUFFICIENT_DATA` |

## What this checkpoint can do

- Collect real public market and discovery evidence
- Optionally manage explicit paper watchlist positions using existing s07 / c06 / x11 / paper / position / exit primitives
- Run continuously with a 5-minute default delay
- Survive ordinary provider failures without overlapping cycles
- Bind loopback-only health endpoints (`127.0.0.1`; never `0.0.0.0`)
- Shut down cleanly on SIGINT / SIGTERM
- Write sanitized JSON line logs
- Run in a hardened Docker image whose health API stays container-local

## What this checkpoint must not do

- Sign, send, or broadcast transactions
- Call `live:preview` or `live:execute`
- Load an ML candidate or change s07 thresholds
- Use wallet-intelligence rows as strategy input
- Paper-trade every discovered token
- Expand the SQLite schema
- Bind health endpoints on `0.0.0.0`

## Commands

```bash
npm run prod:status
npm run prod:plan
npm run prod:preflight
npm run prod:run
```

There is no `prod:live`, `prod:trade`, `prod:execute`, or `prod:wallet`.

`status` and `plan` do not require `PROD20_ENABLED=true`. Only `prod:run` does.

See [PRODUCTION_RUNBOOK.md](PRODUCTION_RUNBOOK.md) and [DEPLOYMENT_SECURITY.md](DEPLOYMENT_SECURITY.md).

## Health exposure

The process always listens on **127.0.0.1**. That host is a code constant (`PROD20_HEALTH_HOST`). No environment variable can change it.

| Deployment | Who can reach `/healthz` | What operators use |
| --- | --- | --- |
| Bare metal `npm run prod:run` | The same host, at `127.0.0.1:<PROD20_HEALTH_PORT>` | Local loopback HTTP, plus logs |
| Docker Compose | Only processes inside that container | `docker compose ps`, `docker compose logs`, and Docker's own HEALTHCHECK |

Docker Compose does **not** publish port 4314. A mapping such as `127.0.0.1:4314:4314` would bind the **host** loopback and forward to the **container IP**. A server listening only on the container's `127.0.0.1` is not reachable through that NAT path. prod20_v1 does not "fix" this by listening on `0.0.0.0`. Docker HEALTHCHECK calls `http://127.0.0.1:4314/healthz` from inside the same container. The Dockerfile does not `EXPOSE` 4314. Do not browse `localhost:4314` for the Docker deployment.

## Failure taxonomy

- `RECOVERABLE_OPERATION_FAILURE` — known provider/network errors. The cycle is FAILED. Remaining safe mints may continue. Three consecutive failed cycles open the circuit.
- `FATAL_PRODUCTION_FAILURE` — persistence/SQLite errors, lock/config/health failures, failed open-position lookup, or an error that cannot be classified as a provider failure. Remaining work stops. Cleanup runs. Exit code 1. No three-cycle wait.

HTTP and HTTPS URL substrings in logs are replaced with `[REDACTED_URL]`. A leftover preflight write probe (`.prod20-preflight-write-probe`) is never the runtime lock.
