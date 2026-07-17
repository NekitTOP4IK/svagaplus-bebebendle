# PM2 host bootstrap (Bebebendle)

One-time staging/production host setup. Matches Plan 2 layout:

```text
/opt/bebebendle/
  current -> releases/<sha>   # created on first deploy
  releases/
  shared/
    .env                      # mode 600, never in git
    .env.example
    uploads/
    logs/
  incoming/
  backups/daily/
```

**Process owner:** `deploy` (never run app PM2 as root).  
**PM2:** global install (`/usr/local/bin/pm2`), daemon of user `deploy`.

---

## Staging host (current)

| Item | Value |
|------|--------|
| Host | `144.31.71.113` (`vm484610.hosted-by.u1host.com`) |
| SSH | `ssh -i ~/.ssh/svagaplus_staging_deploy deploy@144.31.71.113` |
| Co-located | SVAGA+ under `/opt/svagaplus` (ports 5015/5016) |
| Postgres / Redis / Nginx | already active on localhost |

### Already done (as `deploy`, no root)

- [x] SSH access as `deploy` with staging deploy key
- [x] Global `pm2` available; existing SVAGA+ apps run as `deploy`
- [x] Bun `1.3.14` installed user-local: `~/.bun/bin/bun`
- [x] Staging tree prepared at `/home/deploy/bebebendle/{releases,shared,incoming,backups}`
- [x] `/home/deploy/bebebendle/shared/.env.example` (mode 600)
- [x] Root one-shot script: `/home/deploy/bootstrap-bebebendle-root.sh`

### Blocked without root/sudo (password required)

`deploy` is in group `sudo` but has **no passwordless sudo**, and **root SSH keys are not authorized**. Creating `/opt/bebebendle` and PostgreSQL roles needs one elevated run.

---

## One command you must run (sudo password once)

On your laptop (interactive terminal so `sudo` can ask for password):

```bash
ssh -t -i ~/.ssh/svagaplus_staging_deploy deploy@144.31.71.113 \
  'sudo bash /home/deploy/bootstrap-bebebendle-root.sh'
```

That script will:

1. `apt-get install` unzip/rsync/curl/git/jq/gettext-base  
2. Create `/opt/bebebendle/...` and rsync from `/home/deploy/bebebendle`  
3. `chown -R deploy:deploy /opt/bebebendle`  
4. Create PostgreSQL role `bebebendle` + DB `bebebendle_staging` (idempotent)  
5. Write **one-time** DB URL to `/home/deploy/bebebendle-db-pass-once.txt` (mode 600) if the role was new  
6. Add narrow NOPASSWD sudo for nginx reload/status/restart only  

Then:

```bash
# copy DB URL into env, then delete the once-file
ssh -i ~/.ssh/svagaplus_staging_deploy deploy@144.31.71.113 '
  test -f /opt/bebebendle/shared/.env || cp /opt/bebebendle/shared/.env.example /opt/bebebendle/shared/.env
  chmod 600 /opt/bebebendle/shared/.env
  ls -la /opt/bebebendle
  cat /home/deploy/bebebendle-db-pass-once.txt 2>/dev/null || true
'
```

Fill remaining secrets in `/opt/bebebendle/shared/.env` (never paste them into chat):

```dotenv
APP_ENV=staging
NODE_ENV=production
SESSION_SECRET=<64 hex>
DATABASE_URL=postgresql://bebebendle:...@127.0.0.1:5432/bebebendle_staging
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
# set REDIS_PASSWORD if Redis requires auth
SVAGAPLUS_INTERNAL_URL=http://127.0.0.1:5016
SVAGAPLUS_INTERNAL_SECRET=<same as SVAGA+ BEBEBENDLE_INTERNAL_SECRET>
SVAGA_TARGET_USER_ID=<olesha users.id on this staging SVAGA+ DB>
BEBEBENDLE_INTERNAL_SECRET=<different secret bot→bebebendle>
BEBEBENDLE_INTERNAL_URL=http://127.0.0.1:3000
BOT_TOKEN=...
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=...
UPLOADS_DIR=/opt/bebebendle/shared/uploads
PORT=3000
```

Delete the one-time password file after copying:

```bash
ssh -i ~/.ssh/svagaplus_staging_deploy deploy@144.31.71.113 \
  'rm -f /home/deploy/bebebendle-db-pass-once.txt'
```

---

## Clean server from scratch (reference)

If building a new host (not this staging box):

```bash
sudo apt update
sudo apt install -y postgresql redis-server nginx certbot python3-certbot-nginx \
  rsync curl git jq nodejs npm gettext-base unzip

sudo npm install -g pm2

sudo adduser --disabled-password --gecos '' deploy
sudo usermod -aG sudo deploy

sudo mkdir -p /opt/bebebendle/{releases,shared/uploads,shared/logs,incoming,backups/daily}
sudo chown -R deploy:deploy /opt/bebebendle
```

### SSH key for deploy (GitHub Actions / laptop)

```bash
# laptop
ssh-keygen -t ed25519 -C "bebebendle-staging-deploy" -f ~/.ssh/bebebendle_staging_deploy

# server (as root or with sudo)
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
# append public key to authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

On **this** staging host the existing key `~/.ssh/svagaplus_staging_deploy` already works for `deploy` — no new key required unless you want isolation from SVAGA+ deploys.

### PM2 startup (as deploy, once)

```bash
sudo -u deploy bash -lc 'pm2 startup'
# run the exact systemctl command pm2 prints, as root
sudo -u deploy bash -lc 'pm2 save'
```

Do **not** also run a second PM2 daemon as root. One user owns all app processes.

### Bun (user-local, pin 1.3.14)

```bash
# preferred install needs unzip; or extract release zip with python zipfile
curl -fsSL https://bun.sh/install | bash
# or pin:
# https://github.com/oven-sh/bun/releases/download/bun-v1.3.14/bun-linux-x64.zip
```

### uv / Python

`uv` is already on staging at `/usr/local/bin/uv`. Python 3.12 is fine for the bot.

### Redis / Postgres binding

- Listen on `127.0.0.1` only (already true on this staging host).  
- Prefer a Redis password in production; staging may already be open on localhost only.

### Nginx

App listens on `127.0.0.1:3000`. Internal routes `/api/internal/*` must not be public (see Plan 2 nginx template). Domain note: `bebebendle.svagaplus.qzz.io` in repo `nginx/`.

---

## Verify after root bootstrap

```bash
ssh -i ~/.ssh/svagaplus_staging_deploy deploy@144.31.71.113 '
  set -e
  test -w /opt/bebebendle
  ls -la /opt/bebebendle
  ~/.bun/bin/bun -v
  pm2 -v
  # DB: only if .env filled
  # source /opt/bebebendle/shared/.env && psql "$DATABASE_URL" -c "select 1"
'
```

---

## Secrets model (CI/CD)

| Location | Contents |
|----------|----------|
| `/opt/bebebendle/shared/.env` | All app secrets (`BOT_TOKEN`, DB, session, SVAGA, admin, …) |
| GitHub Environment `staging` / `production` | `DEPLOY_*` SSH transport + variable `APP_URL` only |

See [`deploy-and-rollback.md`](./deploy-and-rollback.md).

## Next after bootstrap

1. Fill remaining host env keys (`BOT_TOKEN`, `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`, …)  
2. Ensure SVAGA+ staging has matching `BEBEBENDLE_INTERNAL_SECRET` + `SVAGA_TARGET_USER_ID` **and** the internal route deployed  
3. Configure GitHub Environment secrets; push branch `staging`  
4. Pipeline runs gate → packages tarball → `ops/deploy-release.sh` on host (migrate + PM2)  
5. Smoke: [`svaga-integration-smoke.md`](./svaga-integration-smoke.md)  
6. Tick items in [`staging-remaining-checklist.md`](./staging-remaining-checklist.md)

---

## Why not “PM2 for both root and deploy”

PM2 is global binary; the **daemon** must be owned by one user. Root + deploy both running apps → port fights, split process lists, broken `pm2 save` on reboot.  
This host correctly runs SVAGA+ under `deploy` already — Bebebendle joins the same model.
