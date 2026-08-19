# Deployment security

Checkpoint 20 is a **hardened paper / data runtime**. Treat it as an internet-connected collector with a local database, not as a wallet.

## Live gates

The supervisor refuses to start if:

- `TRADING_ENABLED=true`
- `LIVE_BROADCAST_ENABLED=true`

Those checks run before network use and before database writes. `docker-compose.production.yml` sets both to `false` in `environment`, which overrides `env_file`.

There is no signing secret field in `.env.production.example`. Do not add one.

## What the production process never loads

- `src/live/**`
- `src/wallet/**`
- `src/execution/**`
- A keypair, seed phrase, or mnemonic
- An ML candidate
- Wallet-intelligence scans as strategy input

## Health bind

The health server listens on **127.0.0.1** only. That host is a code constant. No environment variable can override it. Do not bind `0.0.0.0` or `::`. Do not enable host networking.

Bare-metal `npm run prod:run` is therefore inspectable on that host at `127.0.0.1:<PROD20_HEALTH_PORT>`.

Docker Compose does **not** publish the health port. A mapping such as `127.0.0.1:4314:4314` is a **host** bind plus NAT to the **container IP**. It does not reach a process that listens only on the container's loopback. prod20_v1 leaves the port unpublished. Docker HEALTHCHECK probes `http://127.0.0.1:4314/healthz` from inside the same container. The Dockerfile does not `EXPOSE` 4314; `EXPOSE` is metadata and would not publish a port anyway. Do not browse `localhost:4314` for the Docker deployment. Use `docker compose ps` and `docker compose logs`.

Routes are only `GET`/`HEAD` `/healthz` and `/readyz`. Other methods return 405. Unknown paths return 404. There is no CORS header and no environment dump.

## Docker hardening

The production image:

- builds in one stage and runs compiled `node dist/production/run.js` in another
- installs production dependencies only in the final stage
- runs as `USER node`
- does not use `tsx` at runtime

Compose sets:

- `read_only: true`
- `cap_drop: [ALL]`
- `security_opt: [no-new-privileges:true]`
- `init: true`
- `restart: unless-stopped`
- a writable data volume only
- tmpfs for `/tmp`
- no `ports:` publication
- no `network_mode: host`

Do not mount the Docker socket. Do not use `privileged: true`. Do not attach host devices. Do not add a health port mapping.

## Build context

`.dockerignore` excludes `.git`, `node_modules`, host `dist`, coverage, `data`, SQLite files, `.env`, and `.env.*`, while keeping `.env.production.example`. Secrets must not enter the build context.

## Logs and redaction

Prefer allowlisted JSON fields. Error text is redacted before print. Strings that look like `api-key=`, `Bearer`, `privateKey=`, or secret path segments must not appear in output.

## Operator mistakes to avoid

- Turning on `TRADING_ENABLED` to “just test production”
- Putting a private key in `.env.production`
- Paper-trading every discovered mint by copying discovery output into `PROD20_PAPER_MINTS` without reading it
- Copying only the main SQLite file while WAL is active
- Binding health on a public interface
- Publishing the Docker health port or browsing `localhost:4314` for a container that keeps health container-local
- Treating CP19 `ELIGIBLE_FOR_FORWARD_PAPER_MODEL_VALIDATION` as permission to go live (that status still would not enable prod20 live mode, and live mode does not exist)
