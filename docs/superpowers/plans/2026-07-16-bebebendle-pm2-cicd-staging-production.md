# Bebebendle PM2 CI/CD, Staging, and Production Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reproducible quality gate and release-based SSH deployment that checks `dev`, automatically deploys `staging`, and approval-gates production deployment from `main` to non-Docker PM2 hosts.

**Architecture:** GitHub Actions runs the same frontend, bot, migration, and security jobs on all three branches. A successful `staging` or `main` run packages the exact Git commit, uploads it over verified SSH, and invokes an idempotent host deploy script that installs frozen dependencies, backs up PostgreSQL, migrates, atomically switches the `current` symlink, reloads PM2, checks health, and restores the previous application release on failure.

**Tech Stack:** GitHub Actions, SSH/SCP, Bash, PM2, Bun, Next.js 16, uv, Python 3.11, PostgreSQL 15+, Redis 7+, Nginx, Certbot.

---

## Prerequisite Gate

Do not execute this plan until `2026-07-16-bebebendle-security-svagaplus-fixes.md` is complete and its Plan 1 Completion Gate is green. CI/CD must automate a passing system, not encode exceptions for known failures.

## Deployment Contract

| Git ref | Quality gate | Deploy target | GitHub Environment |
|---|---|---|---|
| `dev` | Required | None | None |
| `staging` | Required | Staging host | `staging` |
| `main` | Required | Production host | `production` with required reviewers |

Each environment defines the same secret names with different values:

- `DEPLOY_HOST`
- `DEPLOY_PORT`
- `DEPLOY_USER`
- `DEPLOY_PATH`
- `DEPLOY_SSH_KEY`
- `DEPLOY_KNOWN_HOSTS`

Each environment defines:

- Variable `APP_URL`, including `https://` and no trailing slash.

Secrets remain in `/opt/bebebendle/shared/.env` on each host. GitHub does not upload application secrets.

## File Map

- Create `.bun-version`: exact Bun version used locally, in CI, and on hosts.
- Modify `next/package.json`: declare the package manager.
- Modify `next/Dockerfile`: retain dev Docker support but make its install reproducible.
- Create `next/.dockerignore`: bounded development build context.
- Modify `bot/pyproject.toml` and `bot/uv.lock`: force CPU-only PyTorch and remove CUDA wheels.
- Create `next/lib/redis.ts`: shared authenticated Redis client.
- Modify `next/app/api/middleware/rateLimit.ts`: use the shared client and fail closed for security-sensitive calls.
- Create `next/app/api/health/live/route.ts`: process liveness.
- Create `next/app/api/health/ready/route.ts`: database, Redis, and config readiness.
- Create `bot/src/health.py`: local bot health listener.
- Modify `bot/src/main.py`: verify Telegram connectivity, start health listener, and close it cleanly.
- Replace `ecosystem.config.js` with `ecosystem.config.cjs`: release-local PM2 definition.
- Create `scripts/run-next.sh` and `scripts/run-bot.sh`: load shared env and exec processes.
- Create `ops/deploy-release.sh`: locked release installation, activation, health, rollback, and pruning.
- Create `ops/backup.sh`: PostgreSQL/uploads backups with retention.
- Create `ops/restore-backup.sh`: explicit staging restore procedure.
- Create `ops/nginx/bebebendle.conf.template`: host Nginx reverse proxy.
- Create `docs/runbooks/pm2-host-bootstrap.md`: one-time server setup.
- Create `docs/runbooks/deploy-and-rollback.md`: operational commands and incident flow.
- Create `.github/workflows/pipeline.yml`: branch gate and conditional deploy.
- Modify `.env.sample`, `README.md`, `Makefile`, and `docker-compose.yml`: dev/staging/production consistency.

## Task 1: Make Dependency Installation Reproducible and CPU-Only

**Files:**
- Create: `.bun-version`
- Modify: `next/package.json`
- Modify: `next/Dockerfile`
- Create: `next/.dockerignore`
- Modify: `bot/pyproject.toml`
- Regenerate: `bot/uv.lock`

- [ ] **Step 1: Pin Bun**

Use Bun `1.3.14` everywhere. This is the version reported by the repository's current `oven/bun:latest` development image during plan preparation; do not silently advance it while implementing this plan:

```text
1.3.14
```

Add to `next/package.json`:

```json
"packageManager": "bun@1.3.14"
```

The version in `.bun-version` and `packageManager` must be identical.

- [ ] **Step 2: Make the Next Dockerfile deterministic for local development**

Use a pinned Bun image matching `.bun-version`, copy `bun.lock` before install, and require the lockfile:

```dockerfile
FROM oven/bun:1.3.14 AS base
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.3.14 AS production
WORKDIR /app
COPY drizzle.config.ts ./
COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/public ./public
COPY --from=base /app/scripts ./scripts
COPY --from=base /app/db ./db
RUN mkdir -p /app/uploads
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "start"]
```

Migrations are deliberately removed from container startup. CI/PM2 deployment owns migrations.

Create `next/.dockerignore`:

```text
node_modules
.next
coverage
.env
.env.*
tests
*.log
```

- [ ] **Step 3: Force CPU-only PyTorch in uv**

Append to `bot/pyproject.toml`:

```toml
[[tool.uv.index]]
name = "pytorch-cpu"
url = "https://download.pytorch.org/whl/cpu"
explicit = true

[tool.uv.sources]
torch = { index = "pytorch-cpu" }
```

Regenerate and verify the lock:

```bash
cd bot
uv lock
rg 'name = "cuda-toolkit"|name = "nvidia-cusolver"' uv.lock && exit 1 || true
uv sync --extra dev --frozen
uv run python -c 'import torch; assert not torch.cuda.is_available(); print(torch.__version__)'
```

Expected: no CUDA toolkit/NVIDIA package entries, sync succeeds, and the CPU import prints a version.

- [ ] **Step 4: Run both dependency gates and commit**

```bash
cd next
bun install --frozen-lockfile
bun run build
cd ../bot
uv sync --extra dev --frozen
cd ..
git add .bun-version next/package.json next/bun.lock next/Dockerfile next/.dockerignore bot/pyproject.toml bot/uv.lock
git commit -m "build: pin frontend and CPU bot dependencies"
```

## Task 2: Add Shared Redis and Application Health Endpoints

**Files:**
- Create: `next/lib/redis.ts`
- Modify: `next/app/api/middleware/rateLimit.ts`
- Create: `next/app/api/health/live/route.ts`
- Create: `next/app/api/health/ready/route.ts`
- Create: `next/tests/api/health.test.ts`

- [ ] **Step 1: Write health contract tests**

Mock database and Redis dependencies and assert:

```ts
expect(await live()).toMatchObject({ status: 200 });
expect(await ready({ database: true, redis: true, config: true })).toMatchObject({ status: 200 });
expect(await ready({ database: false, redis: true, config: true })).toMatchObject({ status: 503 });
expect(await ready({ database: true, redis: false, config: true })).toMatchObject({ status: 503 });
expect(await ready({ database: true, redis: true, config: false })).toMatchObject({ status: 503 });
```

The response body must contain only component booleans/status strings, never connection URLs or exception messages.

- [ ] **Step 2: Create one Redis client**

Create `next/lib/redis.ts`:

```ts
import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL;

export const redis = redisUrl
  ? new Redis(redisUrl, { maxRetriesPerRequest: 1, lazyConnect: true, retryStrategy: () => null })
  : new Redis({
      host: process.env.REDIS_HOST || "127.0.0.1",
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null,
    });

redis.on("error", (error) => console.error("Redis connection error:", error.message));
```

Import this singleton from `rateLimit.ts` and remove its local client construction. Change `checkRateLimit` to accept `failureMode: "open" | "closed" = "open"`; internal/auth/SVAGA routes pass `"closed"`, while low-risk anonymous gameplay may retain open behavior.

- [ ] **Step 3: Implement liveness**

Create `next/app/api/health/live/route.ts`:

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Implement readiness**

Create `next/app/api/health/ready/route.ts`. Execute `db.execute(sql`select 1`)`, `redis.ping()`, and check non-empty `SESSION_SECRET`, `BEBEBENDLE_INTERNAL_SECRET`, `SVAGAPLUS_INTERNAL_URL`, `SVAGAPLUS_INTERNAL_SECRET`, and `SVAGA_TARGET_USER_ID`. Return:

```json
{
  "status": "ok",
  "components": {
    "database": "ok",
    "redis": "ok",
    "configuration": "ok"
  }
}
```

If any component fails, return status `503` and replace only that component with `"unavailable"`. Log the actual exception server-side with a request ID, but do not include it in JSON.

- [ ] **Step 5: Run health tests and commit**

```bash
cd next
bun run test:run tests/api/health.test.ts
bun run lint -- lib/redis.ts app/api/middleware/rateLimit.ts app/api/health
cd ..
git add next/lib/redis.ts next/app/api/middleware/rateLimit.ts next/app/api/health next/tests/api/health.test.ts
git commit -m "feat(ops): expose application liveness and readiness"
```

## Task 3: Add Bot Health and Startup Verification

**Files:**
- Create: `bot/src/health.py`
- Create: `bot/tests/test_health.py`
- Modify: `bot/src/main.py`

- [ ] **Step 1: Write the health response test**

Test a local server on an ephemeral port, send `GET /health HTTP/1.1`, assert status 200 and `{"status":"ok"}`. Assert any other path returns 404.

- [ ] **Step 2: Implement a stdlib-only health server**

Create `bot/src/health.py`:

```python
from __future__ import annotations

import asyncio
import json


async def _handle(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    request_line = await reader.readline()
    while await reader.readline() not in {b"\r\n", b"\n", b""}:
        pass
    ok = request_line.startswith(b"GET /health ")
    body = json.dumps({"status": "ok" if ok else "not_found"}).encode()
    status = b"200 OK" if ok else b"404 Not Found"
    writer.write(
        b"HTTP/1.1 " + status + b"\r\n"
        b"Content-Type: application/json\r\n"
        + f"Content-Length: {len(body)}\r\nConnection: close\r\n\r\n".encode()
        + body
    )
    await writer.drain()
    writer.close()
    await writer.wait_closed()


async def start_health_server(host: str, port: int) -> asyncio.AbstractServer:
    return await asyncio.start_server(_handle, host, port)
```

- [ ] **Step 3: Wire health into bot startup**

In `main.py`, before polling:

```python
await bot.get_me()
health_server = await start_health_server(
    os.getenv("BOT_HEALTH_HOST", "127.0.0.1"),
    int(os.getenv("BOT_HEALTH_PORT", "3011")),
)
try:
    await dp.start_polling(bot)
finally:
    health_server.close()
    await health_server.wait_closed()
```

If `get_me()` fails, the process exits and PM2 restarts it; health never reports ready for an invalid token.

- [ ] **Step 4: Run bot checks and commit**

```bash
cd bot
uv run --extra dev ruff check src tests
uv run --extra dev mypy src
uv run --extra dev pytest -q tests/test_health.py
cd ..
git add bot/src/health.py bot/src/main.py bot/tests/test_health.py
git commit -m "feat(bot): expose local health and verify startup"
```

## Task 4: Create Release-Local PM2 Process Definitions

**Files:**
- Create: `scripts/run-next.sh`
- Create: `scripts/run-bot.sh`
- Create: `ecosystem.config.cjs`
- Delete: `ecosystem.config.js`

- [ ] **Step 1: Create strict process wrappers**

Create `scripts/run-next.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$ROOT/.env"
set +a
cd "$ROOT/next"
exec bun run start
```

Create `scripts/run-bot.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
source "$ROOT/.env"
set +a
cd "$ROOT/bot"
exec .venv/bin/python src/main.py
```

Run: `chmod +x scripts/run-next.sh scripts/run-bot.sh`.

- [ ] **Step 2: Create the PM2 ecosystem**

Create `ecosystem.config.cjs`:

```js
const path = require("node:path");

const root = __dirname;

module.exports = {
  apps: [
    {
      name: "bebebendle-next",
      cwd: root,
      script: path.join(root, "scripts/run-next.sh"),
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
      time: true,
    },
    {
      name: "bebebendle-bot",
      cwd: root,
      script: path.join(root, "scripts/run-bot.sh"),
      interpreter: "none",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      kill_timeout: 10000,
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: "10s",
      time: true,
    },
  ],
};
```

- [ ] **Step 3: Validate PM2 config without starting production processes**

Run:

```bash
node -e 'const c=require("./ecosystem.config.cjs"); if(c.apps.length!==2) process.exit(1); console.log(c.apps.map(a=>a.name).join(" "))'
bash -n scripts/run-next.sh scripts/run-bot.sh
```

Expected: both app names print and shell syntax passes.

- [ ] **Step 4: Commit PM2 process definitions**

```bash
git add ecosystem.config.cjs ecosystem.config.js scripts/run-next.sh scripts/run-bot.sh
git commit -m "ops: run Next and bot from release-local PM2 config"
```

## Task 5: Implement the Locked Atomic Deploy Script

**Files:**
- Create: `ops/deploy-release.sh`
- Create: `ops/tests/deploy-release.bats` or `ops/tests/deploy-release.sh`

- [ ] **Step 1: Write a shell-level dry-run test**

The test creates a temporary release root, stubs `bun`, `uv`, `pg_dump`, `pm2`, and `curl`, then verifies:

- checksum mismatch stops before extraction;
- missing env key stops before migration;
- successful deploy updates `current` and `previous`;
- failed health restores the old `current`;
- failed health on the first-ever release removes `current` and stops both PM2 apps;
- only the newest five successful releases remain.

Use plain Bash if Bats is not already installed. The test must not call real PM2, PostgreSQL, Redis, or the network.

- [ ] **Step 2: Implement deploy inputs and preflight**

Create `ops/deploy-release.sh` with this interface:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_SHA="${1:?release sha is required}"
DEPLOY_ENV="${2:?staging or production is required}"
APP_URL="${3:?application URL is required}"
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "invalid release sha" >&2; exit 2; }
[[ "$DEPLOY_ENV" == "staging" || "$DEPLOY_ENV" == "production" ]] || exit 2

ROOT="${BEBEBENDLE_DEPLOY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INCOMING="$ROOT/incoming"
ARCHIVE="$INCOMING/bebebendle-$RELEASE_SHA.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
RELEASE="$ROOT/releases/$RELEASE_SHA"
ENV_FILE="$ROOT/shared/.env"
BACKUP_DIR="$ROOT/backups"

mkdir -p "$ROOT/releases" "$ROOT/shared/uploads" "$ROOT/shared/logs" "$BACKUP_DIR" "$INCOMING"
exec 9>"$ROOT/deploy.lock"
flock -n 9 || { echo "another deploy is active" >&2; exit 1; }

cd "$INCOMING"
sha256sum -c "$(basename "$CHECKSUM")"
for command in bun uv pm2 pg_dump curl tar flock sha256sum; do
  command -v "$command" >/dev/null || { echo "missing command: $command" >&2; exit 1; }
done
[[ -f "$ENV_FILE" ]] || { echo "missing $ENV_FILE" >&2; exit 1; }

set -a
source "$ENV_FILE"
set +a
for key in APP_ENV SESSION_SECRET DATABASE_URL REDIS_URL BOT_TOKEN CRON_SECRET \
  BEBEBENDLE_INTERNAL_SECRET SVAGAPLUS_INTERNAL_URL SVAGAPLUS_INTERNAL_SECRET \
  SVAGA_TARGET_USER_ID NEXT_PUBLIC_TELEGRAM_BOT_USERNAME UPLOADS_DIR; do
  [[ -n "${!key:-}" ]] || { echo "missing env key: $key" >&2; exit 1; }
done
[[ "$APP_ENV" == "$DEPLOY_ENV" ]] || { echo "APP_ENV does not match deploy environment" >&2; exit 1; }
```

- [ ] **Step 3: Implement preparation, backup, and migration**

Append:

```bash
AVAILABLE_KB=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
[[ "$AVAILABLE_KB" -ge 2097152 ]] || { echo "less than 2 GiB free" >&2; exit 1; }

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
ln -sfn "$ENV_FILE" "$RELEASE/.env"
rm -rf "$RELEASE/uploads"
ln -s "$ROOT/shared/uploads" "$RELEASE/uploads"
mkdir -p "$ROOT/shared/logs/next" "$ROOT/shared/logs/bot"

cd "$RELEASE/next"
bun install --frozen-lockfile
bun run build

cd "$RELEASE/bot"
UV_PROJECT_ENVIRONMENT="$RELEASE/bot/.venv" uv sync --no-dev --frozen

BACKUP="$BACKUP_DIR/pre-$RELEASE_SHA-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$BACKUP" "$DATABASE_URL"

cd "$RELEASE/next"
bunx drizzle-kit migrate
```

Do not run `drizzle-kit push`.

- [ ] **Step 4: Implement atomic activation and rollback trap**

Append:

```bash
OLD_RELEASE=""
[[ -L "$ROOT/current" ]] && OLD_RELEASE="$(readlink -f "$ROOT/current")"
SWITCHED=0

rollback() {
  local exit_code=$?
  if [[ "$SWITCHED" -eq 1 && -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
    ln -sfn "$OLD_RELEASE" "$ROOT/current.rollback"
    mv -Tf "$ROOT/current.rollback" "$ROOT/current"
    pm2 startOrReload "$ROOT/current/ecosystem.config.cjs" --update-env || true
  elif [[ "$SWITCHED" -eq 1 ]]; then
    rm -f "$ROOT/current"
    pm2 delete bebebendle-next bebebendle-bot || true
  fi
  exit "$exit_code"
}
trap rollback ERR

if [[ -n "$OLD_RELEASE" ]]; then
  ln -sfn "$OLD_RELEASE" "$ROOT/previous"
fi
ln -sfn "$RELEASE" "$ROOT/current.next"
mv -Tf "$ROOT/current.next" "$ROOT/current"
SWITCHED=1

pm2 startOrReload "$ROOT/current/ecosystem.config.cjs" --update-env
pm2 save
```

Database changes are not automatically reversed. All production migrations must remain backward-compatible with the previous application release.

- [ ] **Step 5: Implement condition-based health checks and pruning**

Append:

```bash
wait_for() {
  local url=$1
  for _ in $(seq 1 30); do
    curl -fsS --max-time 3 "$url" >/dev/null && return 0
    sleep 2
  done
  echo "health check failed: $url" >&2
  return 1
}

wait_for "http://127.0.0.1:${PORT:-3000}/api/health/ready"
wait_for "http://127.0.0.1:${BOT_HEALTH_PORT:-3011}/health"
wait_for "$APP_URL/api/health/live"

SWITCHED=0
trap - ERR
rm -f "$ARCHIVE" "$CHECKSUM"

mapfile -t OLD_RELEASES < <(find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -rn | tail -n +6 | cut -d' ' -f2-)
for old in "${OLD_RELEASES[@]}"; do
  [[ "$old" == "$(readlink -f "$ROOT/current")" ]] || rm -rf "$old"
done

echo "deployed $RELEASE_SHA to $DEPLOY_ENV"
```

- [ ] **Step 6: Run the shell test and commit**

```bash
chmod +x ops/deploy-release.sh ops/tests/deploy-release.sh
bash -n ops/deploy-release.sh
ops/tests/deploy-release.sh
git add ops/deploy-release.sh ops/tests/deploy-release.sh
git commit -m "ops: add atomic PM2 release deployment"
```

## Task 6: Add Backup, Restore, and Nginx Operations

**Files:**
- Create: `ops/backup.sh`
- Create: `ops/restore-backup.sh`
- Create: `ops/nginx/bebebendle.conf.template`
- Create: `docs/runbooks/pm2-host-bootstrap.md`
- Create: `docs/runbooks/deploy-and-rollback.md`

- [ ] **Step 1: Create scheduled backup script**

`ops/backup.sh` must source `/opt/bebebendle/shared/.env`, take a custom-format `pg_dump`, archive `/opt/bebebendle/shared/uploads`, write SHA-256 files, and delete backup sets older than 14 days only after both new files succeed.

Use names:

```text
/opt/bebebendle/backups/daily/database-YYYYmmddTHHMMSSZ.dump
/opt/bebebendle/backups/daily/uploads-YYYYmmddTHHMMSSZ.tar.gz
```

The runbook installs it as:

```cron
17 3 * * * /opt/bebebendle/current/ops/backup.sh >> /opt/bebebendle/shared/logs/backup.log 2>&1
```

- [ ] **Step 2: Create guarded restore script**

`ops/restore-backup.sh` accepts database dump and uploads archive paths. It requires `ALLOW_BEBEBENDLE_RESTORE=yes`, validates both checksums, stops the two PM2 apps, runs `pg_restore --clean --if-exists --no-owner`, replaces uploads through a temporary directory and atomic rename, restarts PM2, and calls both local health endpoints. It must refuse to run when either backup path is outside `/opt/bebebendle/backups/`.

- [ ] **Step 3: Create Nginx template**

Create `ops/nginx/bebebendle.conf.template`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name ${SERVER_NAME};

    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${SERVER_NAME};

    ssl_certificate /etc/letsencrypt/live/${SERVER_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${SERVER_NAME}/privkey.pem;
    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location ^~ /api/internal/ { return 404; }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_connect_timeout 10s;
        proxy_read_timeout 60s;
    }
}
```

Using `$remote_addr` rather than `$proxy_add_x_forwarded_for` prevents callers from injecting the first IP consumed by application rate limiting.

- [ ] **Step 4: Write exact bootstrap and rollback runbooks**

The bootstrap runbook must include:

```bash
sudo apt update
sudo apt install -y postgresql redis-server nginx certbot python3-certbot-nginx rsync curl git jq nodejs npm gettext-base
sudo npm install -g pm2
sudo adduser --disabled-password --gecos '' deploy
sudo mkdir -p /opt/bebebendle/{releases,shared/uploads,shared/logs,incoming,backups}
sudo chown -R deploy:deploy /opt/bebebendle
```

It must also document installing the exact `.bun-version`, uv, Python 3.11+, creating separate database/user credentials, binding PostgreSQL/Redis to localhost, setting Redis authentication, creating `/opt/bebebendle/shared/.env` with mode `600`, setting `UPLOADS_DIR=/opt/bebebendle/shared/uploads`, Nginx template rendering through `envsubst`, Certbot issuance, `pm2 startup`, and GitHub deploy SSH key installation.

The rollback runbook must distinguish:

- automatic application rollback after health failure;
- manual `current -> previous` rollback;
- database restore, which requires incident approval and the guarded restore script;
- secret rotation for `SESSION_SECRET`, deploy key, bot secret, and SVAGA+ secret.

- [ ] **Step 5: Validate scripts/templates and commit**

```bash
bash -n ops/backup.sh ops/restore-backup.sh
SERVER_NAME=staging.example.test APP_PORT=3000 envsubst '${SERVER_NAME} ${APP_PORT}' < ops/nginx/bebebendle.conf.template > /tmp/bebebendle-nginx.conf
rg 'staging.example.test|127.0.0.1:3000' /tmp/bebebendle-nginx.conf
git add ops/backup.sh ops/restore-backup.sh ops/nginx docs/runbooks
git commit -m "ops: document PM2 hosts, backups, and rollback"
```

## Task 7: Add the Unified GitHub Actions Pipeline

**Files:**
- Create: `.github/workflows/pipeline.yml`

- [ ] **Step 1: Create triggers, permissions, and concurrency**

Start `pipeline.yml` with:

```yaml
name: Bebebendle Pipeline

on:
  push:
    branches: [dev, staging, main]
  pull_request:
    branches: [dev, staging, main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: bebebendle-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: ${{ github.ref_name == 'dev' }}
```

- [ ] **Step 2: Add frontend gate**

```yaml
jobs:
  frontend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: next
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: .bun-version
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run test:run
        env:
          NODE_ENV: test
      - run: bun run build
        env:
          NEXT_TELEMETRY_DISABLED: '1'
```

- [ ] **Step 3: Add bot gate**

```yaml
  bot:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: bot
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - uses: astral-sh/setup-uv@v4
      - run: uv sync --extra dev --frozen
      - run: uv run ruff check src tests
      - run: uv run mypy src
      - run: uv run pytest -q
```

- [ ] **Step 4: Add PostgreSQL migration gate**

```yaml
  migrations:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: bebendle_test
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U postgres -d bebendle_test"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
    defaults:
      run:
        working-directory: next
    env:
      DATABASE_URL: postgresql://postgres:postgres@127.0.0.1:5432/bebendle_test
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version-file: .bun-version
      - run: bun install --frozen-lockfile
      - run: bunx drizzle-kit migrate
      - run: bunx drizzle-kit migrate
      - name: Verify required schema
        run: |
          psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
          DO $schema$
          BEGIN
            IF NOT EXISTS (
              SELECT FROM information_schema.tables
              WHERE table_schema = 'public' AND table_name = 'user_sessions'
            ) THEN
              RAISE EXCEPTION 'user_sessions table is missing';
            END IF;
            IF NOT EXISTS (
              SELECT FROM pg_indexes
              WHERE schemaname = 'public' AND indexname = 'unique_user_result_per_user_day'
            ) THEN
              RAISE EXCEPTION 'daily result uniqueness index is missing';
            END IF;
            IF NOT EXISTS (
              SELECT FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'scrans'
                AND column_name = 'is_subscriber_at_submit'
                AND is_nullable = 'YES'
            ) THEN
              RAISE EXCEPTION 'scrans.is_subscriber_at_submit must be nullable';
            END IF;
          END
          $schema$;
          SQL
```

- [ ] **Step 5: Add security scan and release artifact**

```yaml
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gitleaks/gitleaks-action@v2
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

  release:
    if: github.event_name == 'push' && (github.ref_name == 'staging' || github.ref_name == 'main')
    needs: [frontend, bot, migrations, security]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Package exact commit
        run: |
          git archive --format=tar.gz --output="bebebendle-${GITHUB_SHA}.tar.gz" HEAD
          sha256sum "bebebendle-${GITHUB_SHA}.tar.gz" > "bebebendle-${GITHUB_SHA}.tar.gz.sha256"
      - uses: actions/upload-artifact@v4
        with:
          name: bebebendle-${{ github.sha }}
          path: |
            bebebendle-${{ github.sha }}.tar.gz
            bebebendle-${{ github.sha }}.tar.gz.sha256
          if-no-files-found: error
          retention-days: 14
```

- [ ] **Step 6: Add conditional environment deploy**

```yaml
  deploy:
    if: github.event_name == 'push' && (github.ref_name == 'staging' || github.ref_name == 'main')
    needs: [release]
    runs-on: ubuntu-latest
    environment:
      name: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
      url: ${{ vars.APP_URL }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with:
          name: bebebendle-${{ github.sha }}
      - name: Configure verified SSH
        env:
          SSH_KEY: ${{ secrets.DEPLOY_SSH_KEY }}
          KNOWN_HOSTS: ${{ secrets.DEPLOY_KNOWN_HOSTS }}
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$SSH_KEY" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          printf '%s\n' "$KNOWN_HOSTS" > ~/.ssh/known_hosts
          chmod 600 ~/.ssh/known_hosts
      - name: Upload release
        env:
          HOST: ${{ secrets.DEPLOY_HOST }}
          PORT: ${{ secrets.DEPLOY_PORT }}
          USER: ${{ secrets.DEPLOY_USER }}
          PATH_ON_HOST: ${{ secrets.DEPLOY_PATH }}
        run: |
          ssh -i ~/.ssh/deploy_key -p "$PORT" "$USER@$HOST" "mkdir -p '$PATH_ON_HOST/incoming'"
          scp -i ~/.ssh/deploy_key -P "$PORT" \
            "bebebendle-${GITHUB_SHA}.tar.gz" \
            "bebebendle-${GITHUB_SHA}.tar.gz.sha256" \
            ops/deploy-release.sh \
            "$USER@$HOST:$PATH_ON_HOST/incoming/"
      - name: Activate release
        env:
          HOST: ${{ secrets.DEPLOY_HOST }}
          PORT: ${{ secrets.DEPLOY_PORT }}
          USER: ${{ secrets.DEPLOY_USER }}
          PATH_ON_HOST: ${{ secrets.DEPLOY_PATH }}
          APP_URL: ${{ vars.APP_URL }}
          DEPLOY_ENV: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
        run: |
          ssh -i ~/.ssh/deploy_key -p "$PORT" "$USER@$HOST" \
            "BEBEBENDLE_DEPLOY_ROOT='$PATH_ON_HOST' bash '$PATH_ON_HOST/incoming/deploy-release.sh' '$GITHUB_SHA' '$DEPLOY_ENV' '$APP_URL'"
      - name: Cleanup SSH key
        if: always()
        run: rm -f ~/.ssh/deploy_key
```

- [ ] **Step 7: Validate workflow syntax and commit**

Validate with the pinned actionlint release through Go, avoiding an unrelated npm package with the same name:

```bash
go run github.com/rhysd/actionlint/cmd/actionlint@v1.7.7 .github/workflows/pipeline.yml
```

Expected: no syntax or expression errors.

```bash
git add .github/workflows/pipeline.yml
git commit -m "ci: gate dev and deploy staging and production"
```

## Task 8: Align Local Development and Documentation

**Files:**
- Modify: `docker-compose.yml`
- Modify: `.env.sample`
- Modify: `Makefile`
- Modify: `README.md`

- [ ] **Step 1: Bind development infrastructure to localhost**

Change PostgreSQL and Redis ports:

```yaml
ports:
  - "127.0.0.1:5432:5432"
```

```yaml
ports:
  - "127.0.0.1:6379:6379"
```

Add Redis password support:

```yaml
command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
healthcheck:
  test: ["CMD-SHELL", "redis-cli -a \"$${REDIS_PASSWORD}\" ping | grep PONG"]
```

Make Next depend on healthy Redis as well as PostgreSQL. These settings are for local Docker only; PM2 hosts use system services.

- [ ] **Step 2: Remove obsolete migration and backup commands**

Change `make migrate` to run only `bunx drizzle-kit migrate`. Replace the SQLite backup target with a PostgreSQL custom dump using `DATABASE_URL`; add `make verify` that runs the complete frontend and bot gates without Docker.

- [ ] **Step 3: Document environment modes and commands**

`.env.sample` must use `APP_ENV=development`, a localhost `REDIS_URL` with password, separate internal secrets, and no claim that `NODE_ENV=development` should be passed to production `next start`. Keep `UPLOADS_DIR` optional for direct local processes so their existing parent-directory default remains valid; document `/app/uploads` for Compose and require `/opt/bebebendle/shared/uploads` in each PM2 host env file.

README must distinguish:

- local app processes + Docker database/Redis;
- optional full local Compose;
- staging/production PM2 hosts;
- branch behavior;
- health endpoints;
- `make verify`, migration, backup, and rollback commands.

- [ ] **Step 4: Validate local config and commit**

```bash
docker compose config --quiet
make verify
git add docker-compose.yml .env.sample Makefile README.md
git commit -m "docs: align local development with PM2 environments"
```

## Task 9: Provision GitHub Environments and Bootstrap Staging

**External configuration plus tracked runbook verification.**

- [ ] **Step 1: Create GitHub Environments**

Create `staging` and `production`. Add the six deploy secrets and `APP_URL` variable to each. Configure required reviewers on `production`; do not configure reviewers on `staging` unless the team explicitly wants manual staging promotion.

- [ ] **Step 2: Protect branches**

Require the `frontend`, `bot`, `migrations`, and `security` jobs before merging to `dev`, `staging`, and `main`. Prevent direct pushes to `main`. Allow `staging` deployment only from the `staging` branch and production only from `main` through environment deployment-branch rules.

- [ ] **Step 3: Bootstrap the staging host**

Execute `docs/runbooks/pm2-host-bootstrap.md` with:

- `DEPLOY_PATH=/opt/bebebendle`
- `APP_ENV=staging`
- a staging-only PostgreSQL database/user;
- a staging-only Redis password;
- staging Telegram bot token or an explicitly isolated test bot;
- staging SVAGA+ URL, target ID, and dedicated secret;
- a staging domain and certificate.

Never reuse the production database, bot token, session secret, or SVAGA+ secret on staging.

- [ ] **Step 4: Push `dev` and verify no deploy**

Expected: all four quality jobs run, `release` and `deploy` are skipped, and the staging host is untouched.

- [ ] **Step 5: Push/merge to `staging` and verify automatic deploy**

Expected: quality jobs pass, one release artifact is created, deploy activates `/opt/bebebendle/releases/<sha>`, both PM2 apps are online, and local/public health checks pass.

## Task 10: Prove Rollback, Restore, and Production Promotion

- [ ] **Step 1: Prove application rollback on staging**

Deploy a staging-only commit whose health endpoint intentionally returns 503 under `FORCE_READINESS_FAILURE=true`. Confirm the deploy job fails and `current` points back to the prior release. Remove the flag/commit immediately and redeploy the healthy revision.

- [ ] **Step 2: Prove backup restore on staging**

Create a known test row and upload, run `ops/backup.sh`, delete both, then run:

```bash
BACKUP_DIR=/opt/bebebendle/backups/daily
DATABASE_BACKUP="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'database-*.dump' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
UPLOADS_BACKUP="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name 'uploads-*.tar.gz' -printf '%T@ %p\n' | sort -nr | head -n1 | cut -d' ' -f2-)"
test -n "$DATABASE_BACKUP" && test -n "$UPLOADS_BACKUP"
ALLOW_BEBEBENDLE_RESTORE=yes /opt/bebebendle/current/ops/restore-backup.sh \
  "$DATABASE_BACKUP" "$UPLOADS_BACKUP"
```

Confirm the selected files share the same timestamp, then confirm the row/upload and both health endpoints return.

- [ ] **Step 3: Bootstrap production independently**

Repeat host bootstrap with `APP_ENV=production`, production-only credentials, production domain, and production GitHub Environment. Do not copy staging `.env`; generate every secret independently.

- [ ] **Step 4: Verify production approval**

Merge the already-verified staging commit to `main`. Expected: quality and release jobs pass, deploy waits for a production environment reviewer, and no SSH connection occurs before approval.

- [ ] **Step 5: Approve and verify production**

After approval, verify:

```bash
curl -fsS "$PRODUCTION_APP_URL/api/health/live"
ssh -p "$PRODUCTION_DEPLOY_PORT" "$PRODUCTION_DEPLOY_USER@$PRODUCTION_DEPLOY_HOST" \
  'curl -fsS http://127.0.0.1:3000/api/health/ready'
ssh -p "$PRODUCTION_DEPLOY_PORT" "$PRODUCTION_DEPLOY_USER@$PRODUCTION_DEPLOY_HOST" \
  'curl -fsS http://127.0.0.1:3011/health'
ssh -p "$PRODUCTION_DEPLOY_PORT" "$PRODUCTION_DEPLOY_USER@$PRODUCTION_DEPLOY_HOST" 'pm2 status'
```

Expected: three health responses succeed and both PM2 processes are online.

- [ ] **Step 6: Record the first release**

Append the deployed commit SHA, migration number, backup filename, approver, and smoke-check result to `docs/runbooks/deploy-and-rollback.md` under a dated "First production deployment" entry, then commit:

```bash
git add docs/runbooks/deploy-and-rollback.md
git commit -m "docs: record first PM2 production deployment"
```

## Plan 2 Completion Gate

- `dev` runs all checks and cannot deploy.
- `staging` deploys automatically only after all checks pass.
- `main` deploy waits for production Environment approval.
- SSH host verification remains enabled through the environment's pinned `known_hosts` entry.
- Release archives are checksummed and represent exact Git commits.
- Deploys are serialized with `flock`.
- Dependencies install from frozen Bun and uv lockfiles.
- Database backup completes before migration.
- `drizzle-kit push` is absent from deploy/start commands.
- Next readiness, bot health, and public liveness all gate activation.
- Failed application health restores the prior release.
- Database and uploads restore has been demonstrated on staging.
- PostgreSQL, Redis, Next.js, and bot health ports are not publicly exposed.
- Production secrets are independent from staging secrets.
