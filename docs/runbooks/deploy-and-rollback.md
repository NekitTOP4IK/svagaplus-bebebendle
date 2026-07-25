# Deploy and rollback (PM2 hosts)

## Secrets model

| Where | What |
|-------|------|
| **Host** `/opt/bebebendle/shared/.env` (mode `600`) | All application runtime secrets: `BOT_TOKEN`, `SESSION_SECRET`, `DATABASE_URL`, SVAGA secrets, admin/cron, Redis, uploads path, `APP_ENV` |
| **GitHub Environment** (`staging` / `production`) | Deploy transport only: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |
| **GitHub Environment variable** | `APP_URL`: staging `https://bebetest.svagaplus.qzz.io`, production `https://bebebendle.svagaplus.com` (use `http://127.0.0.1:3000` only before nginx/TLS). Deploy always bakes this into host `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_APP_URL` for Next build (share links, absolute client URLs). |

CI **never** uploads bot tokens or DB passwords. The deploy script sources `shared/.env` on the host and fails if required keys are missing.

`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is read from host `shared/.env` during `bun run build` on the server (not from GitHub).

### Daily cron (production/staging hosts)

```cron
0 0 * * * TZ=Europe/Moscow /opt/bebebendle/current/ops/cron-generate-daily.sh >> /opt/bebebendle/shared/logs/daily-cron.log 2>&1
0 0 * * * TZ=Europe/Moscow /opt/bebebendle/current/ops/cron-generate-competitive.sh >> /opt/bebebendle/shared/logs/competitive-cron.log 2>&1
```

Requires `CRON_SECRET` in `shared/.env`. Daily date boundary is 00:00 Europe/Moscow. Competitive cron uses the same secret and endpoint auth (`Bearer ${CRON_SECRET}` → `/api/cron/competitive`); exits 0 when competitive is disabled or no playable season.

## Branch → environment

| Git branch | Quality gate | Deploy |
|------------|--------------|--------|
| `dev` | yes | no |
| `staging` | yes | auto → GitHub env `staging` |
| `main` | yes | auto → GitHub env `production` (add required reviewers) |

## First-time staging checklist

1. Host bootstrap complete (`docs/runbooks/pm2-host-bootstrap.md`).
2. Fill `/opt/bebebendle/shared/.env` on the server (especially `BOT_TOKEN`, bot username; rest may already be set).
3. Create GitHub Environment `staging` with deploy secrets + `APP_URL`.
4. Push or merge to branch `staging`.
5. Watch Actions → **Bebebendle Pipeline** → `deploy` job.
6. On host: `pm2 status`, `curl -fsS http://127.0.0.1:3000/api/health/ready`.

## Manual deploy (emergency)

```bash
# laptop
git archive --format=tar.gz --output=/tmp/bebebendle-$SHA.tar.gz $SHA
sha256sum /tmp/bebebendle-$SHA.tar.gz > /tmp/bebebendle-$SHA.tar.gz.sha256
scp -i ~/.ssh/svagaplus_staging_deploy \
  /tmp/bebebendle-$SHA.tar.gz \
  /tmp/bebebendle-$SHA.tar.gz.sha256 \
  ops/deploy-release.sh \
  deploy@HOST:/opt/bebebendle/incoming/

ssh -i ~/.ssh/svagaplus_staging_deploy deploy@HOST \
  "BEBEBENDLE_DEPLOY_ROOT=/opt/bebebendle bash /opt/bebebendle/incoming/deploy-release.sh $SHA staging http://127.0.0.1:3000"
```

## Automatic application rollback

If health checks fail after symlink switch, `ops/deploy-release.sh` restores the previous `current` release and reloads PM2. **Database migrations are not reversed** — keep migrations backward-compatible.

## Manual app rollback (previous release)

```bash
ssh deploy@HOST
cd /opt/bebebendle
ln -sfn "$(readlink -f previous)" current
pm2 startOrReload current/ecosystem.config.cjs --update-env
pm2 save
curl -fsS http://127.0.0.1:3000/api/health/ready
```

## Secret rotation

| Secret | Where to rotate |
|--------|-----------------|
| `SESSION_SECRET` | host `shared/.env` only → redeploy or `pm2 restart` |
| `BOT_TOKEN` | host `shared/.env` only |
| `SVAGAPLUS_INTERNAL_SECRET` / SVAGA `BEBEBENDLE_INTERNAL_SECRET` | **both** host Bebebendle `.env` and SVAGA+ backend `.env`, same value → restart both |
| `BEBEBENDLE_INTERNAL_SECRET` | host only (bot → Next) |
| Deploy SSH key | GitHub Environment `DEPLOY_SSH_KEY` + host `~deploy/.ssh/authorized_keys` |

Never put rotated app secrets into GitHub Actions secrets unless they are truly build-time and non-sensitive.

## HTTP boundary and rollback compatibility

The browser must not call `/api/**` for application state. Reads are rendered by Server Components and writes use Server Actions, which perform their own authentication, role checks, validation, and rate limits.

The handlers retained as deployment/runtime contracts are:

| Handler | Consumer |
| --- | --- |
| `/api/auth/twitch/start`, `/api/auth/twitch/callback` | Twitch OAuth |
| `/api/internal/svaga/subscription-status` | Telegram bot |
| `/api/cron/daily`, `/api/cron/competitive` | Host cron |
| `/api/health/live`, `/api/health/ready` | Process/load-balancer probes |
| `/api/images/**`, `/api/competitive/content-assets/**`, `/cdn/**` | Static/binary delivery |

Public legacy reads (`/api/daily`, `/api/scrandle`, `/api/scrandle/results`, `/api/stats`, and season archive reads) remain compatibility contracts until nginx access logs show no external consumer for 30 days. Do not remove those routes as part of an ordinary application deploy.
