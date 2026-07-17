# Staging remaining checklist

**Date:** 2026-07-16  
**Status:** Code (Plan 1) is on `dev` and pushed. Staging host/env/smoke still open.

Use this tomorrow as the single place to resume. Related docs:

- Smoke commands: [`svaga-integration-smoke.md`](./svaga-integration-smoke.md)
- Design: `docs/superpowers/specs/2026-07-16-bebebendle-readiness-svagaplus-design.md`
- Plan 1 (done in code): `docs/superpowers/plans/2026-07-16-bebebendle-security-svagaplus-fixes.md`
- Plan 2 (later, CI/CD): `docs/superpowers/plans/2026-07-16-bebebendle-pm2-cicd-staging-production.md`

---

## Already done (not staging, but foundation)

| Item | Status |
|------|--------|
| Security + SVAGA+ integration code | On `dev`, pushed |
| Merge feature → `dev` (no PR, solo workflow) | Both repos |
| Local Bebebendle docker + SVAGA+ on `:5016` | Env/secrets/smoke OK locally |
| Migration `0005` on local DB | Applied |
| Error UI contrast fix | On `dev` |
| `/daily` empty state (no 404) + home CTA disabled | On `dev` (`20ba818`) |
| Integration smoke runbook | Written |

**Branches / commits (as of 2026-07-16):**

- Bebebendle `dev` includes sessions, SVAGA client, bot snapshots, profile UX, docker host.docker.internal, UI fixes.
- SVAGA+ `dev` includes `POST /api/internal/bebebendle/subscription-status`.

---

## Still needed for staging

### 1. Infra / access

- [x] Staging host(s) for **SVAGA+** and **Bebebendle** (or one VPS) — `144.31.71.113`, same box as SVAGA+ staging
- [ ] DNS / HTTPS: staging `bebetest.svagaplus.qzz.io`, prod `bebebendle.svagaplus.qzz.io` — host configs in `ops/nginx/` (not Docker `nginx/`)
- [x] Postgres + Redis on staging — `bebebendle` / `bebebendle_staging` created
- [x] Deploy method: GitHub Actions → SSH → `ops/deploy-release.sh` (app secrets stay on host `shared/.env`)
- [x] Host bootstrap: `/opt/bebebendle`, `deploy` ownership, bun 1.3.14, PM2 as deploy — see [`pm2-host-bootstrap.md`](./pm2-host-bootstrap.md)

### 2. Env on SVAGA+ staging

```dotenv
BEBEBENDLE_INTERNAL_SECRET=<same value as Bebebendle SVAGAPLUS_INTERNAL_SECRET>
SVAGA_TARGET_USER_ID=<olesha users.id on STAGING DB — may differ from local>
```

- [x] `BEBEBENDLE_INTERNAL_SECRET` + `SVAGA_TARGET_USER_ID` written to shared + current backend `.env` (2026-07-17)
- [ ] Deploy SVAGA+ from `dev` (or staging branch) — **endpoint code missing on staging** (`POST /api/internal/bebebendle/subscription-status` → 404)
- [ ] Restart backend (after code deploy so new route + env load)
- [ ] Confirm endpoint responds

### 3. Env on Bebebendle staging

`/opt/bebebendle/shared/.env` (mode 600):

- [x] `APP_ENV=staging`, `NODE_ENV=production`, DB URL, SESSION/ADMIN/CRON secrets, internal bot secret, SVAGA shared secret + Olesha UUID, URLs/ports/uploads
- [ ] `BOT_TOKEN` + `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (user must fill)
- [ ] Optional: `REDIS_PASSWORD` if Redis auth enabled

Do **not** reuse one secret for both hops (`SVAGAPLUS_INTERNAL_SECRET` ≠ `BEBEBENDLE_INTERNAL_SECRET`).

### 4. Deploy Bebebendle

- [ ] Postgres backup before migrate
- [ ] `git pull` of `dev`
- [ ] `drizzle-kit migrate` (includes `0005_secure_sessions_and_svaga_status`)
- [ ] Frontend build + bot deps
- [ ] PM2 / docker restart

### 5. Staging fixtures + smoke (completion gate)

Create **staging-only** Telegram fixtures (record IDs only, not secrets):

1. Active Olesha subscriber  
2. Inactive Olesha subscriber  
3. Active subscriber of a **different** owner  
4. Unknown Telegram ID  

Then run [`svaga-integration-smoke.md`](./svaga-integration-smoke.md):

- [ ] Direct SVAGA+ curls (4 fixtures + 401 without secret)
- [ ] Login once on `/profile` (legacy cookies intentionally dead)
- [ ] «Проверить подписку»
- [ ] Bot `/suggest` → moderation badge `SVAGA+` or «Не проверено»
- [ ] Optional: point `SVAGAPLUS_INTERNAL_URL` at a dead port → stale/unknown, never invented `false`

### 6. Nice-to-have (not blocking “staging is up”)

| Item | Why |
|------|-----|
| Plan 2 CI/CD | Auto-deploy from `staging` branch, health, rollback |
| `/api/health/ready` | Deploy readiness checks |
| Commit untracked `docs/superpowers/*` if still untracked | Specs/plans in git |
| BotFather Login Widget domain for staging URL | Telegram login on staging host |
| Generate daily on staging | Otherwise home CTA shows «Дейлика на сегодня нет» (expected) |

---

## Deploy order (do not reverse)

```text
1) SVAGA+ deploy + env
2) SVAGA+ fixture smoke
3) Bebebendle migrate + deploy + env
4) Bebebendle product smoke
```

If Bebebendle goes first, subscription checks become `unknown` / `stale` until SVAGA+ is live — not always a hard crash, but staging is not green.

---

## Minimal “staging is ready” checkbox

```text
[ ] SVAGA+ staging: code + 2 env vars + restart
[ ] curl 4 fixtures + 401
[ ] Bebebendle staging: env + migrate 0005 + build + restart
[ ] HTTPS + APP_ENV=staging
[ ] Login + SVAGA check + bot suggest
[ ] Smoke runbook executed once and signed off
```

---

## Local reminder (already working on this machine)

- Bebebendle: docker compose (`next` :3000, `db`, `redis` internal, `bot`)
- SVAGA+: gunicorn on `0.0.0.0:5016` (may need restart if killed)
- Local Olesha id was set in local `.env` from local SVAGA DB — **re-resolve on staging DB**
- Local secrets live only in `.env` files (not git)

---

## Tomorrow quick start

1. Open this file.  
2. Confirm host access / DNS.  
3. Fill staging env templates above with real values.  
4. Follow **Deploy order**.  
5. Tick the minimal checklist.  
6. Only then consider Plan 2 CI/CD.
