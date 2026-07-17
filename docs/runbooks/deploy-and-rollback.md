# Deploy and rollback (PM2 hosts)

## Secrets model

| Where | What |
|-------|------|
| **Host** `/opt/bebebendle/shared/.env` (mode `600`) | All application runtime secrets: `BOT_TOKEN`, `SESSION_SECRET`, `DATABASE_URL`, SVAGA secrets, admin/cron, Redis, uploads path, `APP_ENV` |
| **GitHub Environment** (`staging` / `production`) | Deploy transport only: `DEPLOY_HOST`, `DEPLOY_PORT`, `DEPLOY_USER`, `DEPLOY_PATH`, `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS` |
| **GitHub Environment variable** | `APP_URL`: staging `https://bebetest.svagaplus.qzz.io`, production `https://bebebendle.svagaplus.qzz.io` (use `http://127.0.0.1:3000` only before nginx/TLS) |

CI **never** uploads bot tokens or DB passwords. The deploy script sources `shared/.env` on the host and fails if required keys are missing.

`NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` is read from host `shared/.env` during `bun run build` on the server (not from GitHub).

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
