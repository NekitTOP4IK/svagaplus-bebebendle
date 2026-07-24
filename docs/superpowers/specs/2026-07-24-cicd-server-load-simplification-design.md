# CI/CD Server Load Simplification — Design Spec

**Date:** 2026-07-24  
**Status:** Approved for implementation planning  
**Product:** Bebebendle — GitHub Actions quality gate + SSH/PM2 host deploy  
**Inputs:** `.superpowers/sdd/ci-cd-server-load-report.md` (read-only review 2026-07-24)  
**Related:** `docs/superpowers/plans/2026-07-16-bebebendle-pm2-cicd-staging-production.md` (baseline CI/CD)

---

## 1. Goals

### 1.1 What we want

1. **Reduce load on the VPS** during deploys (CPU, RAM, disk, DB I/O) without weakening production safety.
2. **Shorten deploy wall time** for common “app-only” releases (frontend or bot without migrations).
3. **Cut GitHub Actions waste** (cold installs, redundant jobs on path-scoped PRs) where it does not weaken gates on protected branches.
4. Keep **staging auto-deploy** and **production approval-gated deploy** on the same contract as today.
5. Prefer **incremental, reversible** changes with host/CI feature flags and offline tests.

### 1.2 What we explicitly do not want

- Removing quality gates on `staging` / `main` (“skip all tests forever”).
- Moving app secrets (`BOT_TOKEN`, DB passwords, session secrets) into GitHub for convenience.
- Reintroducing **Docker image builds on the VPS** as the primary deploy path.
- Merging staging and production onto one host.
- Breaking auto-rollback on failed health, deploy lock, checksum verification, or `APP_ENV` isolation.

### 1.3 Success criteria

| Phase | Criterion |
|-------|-----------|
| **1** | App-only deploy (no migration) does **not** run `pg_dump`; next-only deploy does **not** restart bot (and vice versa); deploy script logs timing + flags; offline tests cover new flags; CI has bun/uv cache; path filters on PR/`dev` only. |
| **2** | Staging (then production) deploys can **skip host `bun run build`** when a prebuilt artifact is present; host-build remains as fallback (`BEBEBENDLE_HOST_BUILD=1` or missing artifact). |
| **3 (optional)** | Standalone Next runtime and/or further bot cold-start work — only if phase 2 still insufficient. |

---

## 2. Current architecture (baseline)

### 2.1 Split of responsibility

| Layer | Where | Role |
|-------|--------|------|
| Quality gate | GitHub `ubuntu-latest` | lint, test, build (proof), migrate check, gitleaks, offline deploy script test |
| Package | GitHub | `git archive` + sha256, artifact |
| Transport | GitHub | verified SSH + scp |
| Install / build / activate | **VPS** (`ops/deploy-release.sh`) | deps, **Next build**, bot venv, **always `pg_dump`**, migrate?, symlink, **pm2 delete+start both**, health, prune |
| Runtime | VPS PM2 | `bebebendle-next`, `bebebendle-bot` |

App secrets live only in `/opt/bebebendle/shared/.env`. GH Environments hold `DEPLOY_*` + variable `APP_URL`.

### 2.2 Already good

- `node_modules` cache by lock hash + hardlink clone  
- `.next` reuse when `dir_hash(next/)` + public env fingerprint match previous  
- Bot venv shared by `uv.lock` hash  
- Skip migrate when migrations tree hash unchanged  
- `nice`/`ionice`, `NODE_OPTIONS` cap, prune releases/caches  
- Health multi-check + auto-rollback to `previous`  
- `flock`, checksum, `APP_ENV` == `DEPLOY_ENV`, frozen locks  

### 2.3 Primary VPS pain (from review)

1. **`bun run build` on host** when `next/` changes (duplicates CI compile; RAM/CPU next to SVAGA+/Postgres).  
2. **`pg_dump` on every deploy**, including `SKIP_MIGRATE=1`.  
3. **`pm2 delete` + `start` both apps** on every deploy (cold Next + cold ML bot).  
4. Full-tree **`dir_hash(next/)`** I/O tax even when build later skips.  

Secondary: no GH cache for bun/uv; no path filters → bot-only PR still full frontend CI; migrations job reinstalls bun independently.

---

## 3. Design principles

1. **Safety nets are non-negotiable** (§6). Optimizations only remove work that does not protect prod.  
2. **Release identity = git SHA** (`git archive` is deterministic). Prefer SHA/markers over full filesystem hashing where equivalent.  
3. **Change-aware restarts:** restart only processes whose inputs changed.  
4. **Backup is for schema risk:** dump when migrations apply (and optional force/nightly), not when restarting apps.  
5. **Compile off-box is phase 2:** requires baking `NEXT_PUBLIC_*` / `APP_URL` in GH Environment **vars** (not app secrets). Host fallback always available.  
6. **Path filters only where safe:** PR/`dev` may skip irrelevant jobs; `staging`/`main` keep full gate (or last-green policy documented if we later tighten).  

---

## 4. Phase 1 — Quick wins (host + CI)

### 4.1 `pg_dump` only when migrating

**Behavior:**

```
if SKIP_MIGRATE == 0 OR BEBEBENDLE_FORCE_DB_BACKUP == 1:
  pg_dump → backups/pre-<sha>-….dump
else:
  skip dump (log clearly)
```

**Optional companion (same phase or immediate follow-up):**

- `ops/backup.sh` (+ cron on host) for nightly DB dump with retention (already sketched in 2026-07-16 plan).

**Rationale:** App rollback does not roll back schema; dump is critical **before migrate**, wasteful before pure app restarts.

### 4.2 Selective PM2 restart

**Inputs (computed during deploy):**

| Flag | Meaning |
|------|---------|
| `RESTART_NEXT` | Next sources/build/output/ecosystem next entry/scripts that affect next changed |
| `RESTART_BOT` | Bot sources/lock/venv/scripts that affect bot changed |
| `RESTART_BOTH` | Force both (first deploy, missing previous, env wiring change, `BEBEBENDLE_FORCE_PM2_BOTH=1`) |

**Rules (default):**

1. First release / no `previous` → both (`delete`+`start` or start fresh).  
2. Next build ran or next src/public-env fingerprint changed → `RESTART_NEXT=1`.  
3. Bot tree or `uv.lock` / venv path changed → `RESTART_BOT=1`.  
4. `ecosystem.config.cjs`, `scripts/run-*.sh`, shared layout → both.  
5. Prefer **`pm2 startOrReload` / restart single app** over `pm2 delete` both when only one side changes.  
6. Fallback: `BEBEBENDLE_PM2_HARD_RESTART=1` restores current delete+start-both behavior.

**Health:**

- Keep checking **both** live/ready/bot/public for now (simpler rollback semantics).  
- Phase 1.1 optional: if only next restarted, bot health failure does not trigger full app rollback if bot process was never touched — **defer** unless selective restart proves stable (document as follow-up to avoid partial-health complexity in v1).

### 4.3 Cheaper next-change fingerprint

**Problem:** `dir_hash` over entire `next/` (minus node_modules/.next) is expensive.

**Design:**

- Release tarball = `git archive` of commit `RELEASE_SHA` → tracked source tree is **exactly** that SHA.  
- Persist under release root markers written by CI or deploy:

```
.bebebendle-release-meta
  RELEASE_SHA=…
  NEXT_PUBLIC_FP=…   # hash of APP_URL + NEXT_PUBLIC_* used for build
  # optional from CI:
  NEXT_PATHS_CHANGED=0|1   # vs previous release SHA if known
  BOT_PATHS_CHANGED=0|1
  MIG_PATHS_CHANGED=0|1
```

**Skip Next build when:**

- previous release exists, and  
- `RELEASE_SHA` is new but **next path content** unchanged vs previous (CI marker **or** host `git diff` equivalent via markers), and  
- `NEXT_PUBLIC_FP` matches previous bake, and  
- previous `.next` is present and non-empty.

**Minimum viable without CI markers:**  
If `PREV_SHA` and `NEW_SHA` are both known and host has **no** git history of those SHAs, keep a **narrower** host hash (only `next/app`, `next/components`, `next/lib`, `next/db`, `next/public`, config files) **or** store `NEXT_SRC_FP` in meta written once at end of successful build.

Preferred: **CI writes markers into artifact** (or a small side-file uploaded with tarball) using:

```bash
git diff --name-only "$PREV_SHA" "$GITHUB_SHA" -- next/ bot/ next/db/migrations/
```

When previous SHA unknown (first deploy), full build + both restarts.

### 4.4 Deploy timing logs

Always log structured lines for verification:

```
==> timing: extract_s=… install_s=… fingerprint_s=… build_s=… dump_s=… migrate_s=… pm2_s=… health_s=…
==> flags: SKIP_NEXT_BUILD=… SKIP_MIGRATE=… SKIP_DB_BACKUP=… RESTART=next|bot|both
```

### 4.5 CI: caches + path filters (PR / `dev` only)

**Caches (all branches):**

- Bun install cache (setup-bun cache or `actions/cache` on `~/.bun/install/cache` + `next/node_modules` with lock key).  
- uv cache for bot (`astral-sh/setup-uv` cache: true or explicit cache).  

**Path filters:**

| Change set | frontend job | bot job | migrations job |
|------------|--------------|---------|----------------|
| only `bot/**` | skip on PR/`dev` | run | skip unless bot depends on schema (default skip) |
| only `next/**` (no `db/`) | run | skip on PR/`dev` | skip on PR/`dev` |
| `next/db/**` or migrations | run | skip optional | run |
| `ops/**`, workflow, ecosystem | run minimal / full deploy-script job | — | — |

**On `staging` and `main` pushes:** run **full** gate (all jobs) so production never depends on path-filter heuristics alone.

**Security / deploy-script jobs:** always on (cheap).

### 4.6 CI install hygiene

- Avoid double cold `bun install` in `frontend` and `migrations` without cache (cache makes this acceptable).  
- Optional later: single composite install job — not required if cache hits.

---

## 5. Phase 2 — Prebuild Next off the VPS

### 5.1 Goal

Host deploy **does not run `bun run build`** when a trusted prebuilt bundle for this `RELEASE_SHA` + public env fingerprint is available.

### 5.2 Public env on GitHub

Add Environment **variables** (not secrets) per env:

| Variable | Purpose |
|----------|---------|
| `APP_URL` | already exists |
| `NEXT_PUBLIC_SITE_URL` | if used (may equal `APP_URL`) |
| `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` | public bot username for widget |

**Still never in GH:** DB URLs with passwords, bot tokens, session secrets, internal SVAGA secrets.

### 5.3 CI build job (env-specific)

On `staging`/`main` after gates:

1. Checkout at deploy SHA.  
2. `bun install --frozen-lockfile`.  
3. `bun run build` with `NEXT_TELEMETRY_DISABLED=1` and public env from Environment.  
4. Upload artifact: e.g. `next-prebuild-<sha>-<env>.tgz` containing at least:
   - `next/.next/**`
   - optional production `node_modules` **or** rely on host nm-cache install  
   - meta file with `RELEASE_SHA`, env name, `NEXT_PUBLIC_FP`

### 5.4 Host activation

```
if BEBEBENDLE_HOST_BUILD=1 OR prebuild missing OR public_fp mismatch:
  existing host build path
else:
  extract prebuild into release/next
  bun install (or reuse nm-cache) without build
  verify .next exists
```

Integrity: prefer artifact checksum recorded in workflow + same `RELEASE_SHA` as source tarball.

### 5.5 Fallback / emergency

- Host env `BEBEBENDLE_HOST_BUILD=1` forces compile on VPS (current behavior).  
- Manual deploy runbook: document both paths.  
- Offline tests: stub prebuild present ⇒ script never invokes `bun run build`.

### 5.6 Out of phase 2 core

- Full Next `output: 'standalone'` — phase 3 (requires migrate tooling path review).  
- Shipping bot wheels from CI — optional, separate decision.

---

## 6. Safety nets (must remain)

| Net | Rule |
|-----|------|
| Gate before release/deploy | `needs: [frontend, bot, migrations, security, deploy-script]` (or equivalent) |
| Production Environment reviewers | Stay on |
| Archive checksum | `sha256sum -c` before extract |
| `APP_ENV` == `DEPLOY_ENV` | Stay on |
| Deploy `flock` | Stay on |
| DB backup **when migrations apply** | Stay on (phase 1 tightens “when”) |
| Atomic `current` symlink switch | Stay on |
| Auto-rollback on health failure | Stay on |
| Health: live + ready + bot + public URL | Stay on for phase 1 |
| Host-held secrets | Stay on |
| Frozen lockfiles | Stay on |
| Keep `previous` + N releases | Stay on |
| gitleaks | Stay on |
| Offline `ops/tests/deploy-release.sh` | Extend, never drop |
| Disk free preflight | Stay on |
| No `drizzle-kit push` in deploy | Stay on |

---

## 7. Explicit non-goals / deferred

| Item | Phase |
|------|--------|
| Nightly backup cron + restore runbook polish | 1 companion or follow-up |
| Soft health when only one app restarted | after selective PM2 stable |
| Next `standalone` | 3 |
| Lighter bot ML / lazy model load | product change, separate |
| Dedicated build VPS | only if phase 2 insufficient |
| Docker for prod | never as primary |
| Path-filter skip of full suite on `staging`/`main` | out of scope (unsafe) |

---

## 8. Testing strategy

### 8.1 Offline (`ops/tests/deploy-release.sh`)

Extend (or sibling tests) with stubs for:

1. `SKIP_MIGRATE=1` ⇒ no `pg_dump` invocation / no new dump file.  
2. `SKIP_MIGRATE=0` ⇒ dump then migrate.  
3. Next-only change markers ⇒ bot not `pm2 delete`/`restart`.  
4. Bot-only ⇒ next not restarted.  
5. Phase 2: prebuild present ⇒ `bun run build` not called.  
6. `BEBEBENDLE_HOST_BUILD=1` ⇒ build called even with prebuild.  
7. Health fail ⇒ rollback still invoked (existing).  

### 8.2 Staging manual matrix

| Scenario | Expect |
|----------|--------|
| Next-only commit | No dump (if no mig); bot uptime preserved; next restarts; green health |
| Bot-only commit | No next build; next uptime preserved; bot restarts |
| Migration commit | Dump exists; migrate runs; both healthy |
| Forced health fail | `current` → previous |
| Phase 2 prebuild | No host compile spike; site serves |

### 8.3 Metrics (ops)

Log timings (§4.4). Compare before/after:

- deploy wall time  
- presence of dump on app-only  
- `pm2` uptime across deploys  
- (phase 2) host CPU during deploy window  

---

## 9. Rollout order

1. **Phase 1a** — dump-if-migrate + timing flags + offline tests (lowest risk).  
2. **Phase 1b** — selective PM2 + fingerprints/markers.  
3. **Phase 1c** — CI cache + path filters (PR/dev).  
4. **Phase 2** — prebuild on staging Environment → soak → production.  
5. **Phase 3** — only if needed (standalone / isolation).  

Each step ships behind flags or is one-line revertible.

---

## 10. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| Missed bot restart when shared script changes | Broaden “both” fingerprints to `scripts/`, `ecosystem.config.cjs` |
| No dump before silent schema change | Only skip dump when migrate skipped; migrations still dump |
| Prebuild env drift | Fingerprint public env; mismatch → host build |
| Path filter skips needed test on PR | Full suite on staging/main; document PR policy |
| Selective PM2 leaves zombie state | Hard-restart flag; health still full stack in phase 1 |

---

## 11. Documentation updates

- `docs/runbooks/deploy-and-rollback.md` — new flags, dump policy, prebuild fallback.  
- `docs/runbooks/pm2-host-bootstrap.md` — nightly backup if added; GH public vars for phase 2.  
- `AGENTS.md` — one short CI/CD load note.  
- Optional: retire confusion that Docker is prod path (pointer only).

---

## 12. Summary

Simplify CI/CD by **removing VPS work that does not protect production** (unconditional dump, dual hard PM2 recycle, expensive hashing), **caching CI**, then **moving Next compile to GitHub** with host fallback. Keep the existing safety spine: gates, checksum, env isolation, migrate-time backup, health rollback, frozen locks.

**Out of scope for “done” of this initiative:** rewards, product features, bot model architecture rewrites.
