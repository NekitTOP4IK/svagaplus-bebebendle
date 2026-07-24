# CI/CD Server Load Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut VPS deploy load and CI waste while preserving staging/production safety nets (gates, checksum, flock, migrate-time backup, health rollback, env isolation).

**Architecture:** Keep GitHub Actions as quality gate + packaging + SSH transport. Optimize `ops/deploy-release.sh` first (dump-if-migrate, selective PM2, cheaper fingerprints, timing logs). Then cache CI and path-filter PR/`dev`. Later, prebuild Next in GH Environments and activate on host without `bun run build` unless fallback is forced.

**Tech Stack:** GitHub Actions, Bash, PM2, Bun, Next.js, uv, PostgreSQL, existing `ops/deploy-release.sh` / `ops/tests/deploy-release.sh`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-24-cicd-server-load-simplification-design.md`
- Review input: `.superpowers/sdd/ci-cd-server-load-report.md`
- Baseline plan: `docs/superpowers/plans/2026-07-16-bebebendle-pm2-cicd-staging-production.md`
- **Do not** remove: production reviewers, gitleaks, checksum, `APP_ENV` check, flock, health+auto-rollback, frozen locks, host secrets, backup **when migrations run**
- **Do not** path-filter away full gate on `staging`/`main` pushes
- **Do not** put DB passwords / bot tokens / session secrets in GitHub
- Prefer flags for emergency old behavior: `BEBEBENDLE_FORCE_DB_BACKUP`, `BEBEBENDLE_PM2_HARD_RESTART`, `BEBEBENDLE_HOST_BUILD`
- Offline tests must stay green: `ops/tests/deploy-release.sh`
- Stage only intentional paths; avoid Windows CRLF noise commits

---

## File Map

| Path | Action | Responsibility |
|------|--------|----------------|
| `ops/deploy-release.sh` | Modify | dump policy, selective PM2, fingerprints, timing, prebuild activate (phase 2) |
| `ops/tests/deploy-release.sh` | Modify | offline coverage for new flags |
| `ops/backup.sh` | Create (if missing) | nightly/manual DB dump |
| `.github/workflows/pipeline.yml` | Modify | caches, path filters PR/dev, phase 2 prebuild job |
| `docs/runbooks/deploy-and-rollback.md` | Modify | flags, dump policy, prebuild |
| `docs/runbooks/pm2-host-bootstrap.md` | Modify | backup cron, GH public vars |
| `AGENTS.md` | Modify | short CI/CD note |
| `next/package.json` / config | Modify only in phase 3 if standalone |

---

### Task 1: Dump only when migrating + timing logs

**Files:**
- Modify: `ops/deploy-release.sh`
- Modify: `ops/tests/deploy-release.sh`

**Interfaces / flags:**

```bash
# After computing SKIP_MIGRATE:
SKIP_DB_BACKUP=0
if [[ "$SKIP_MIGRATE" -eq 1 && "${BEBEBENDLE_FORCE_DB_BACKUP:-0}" != "1" ]]; then
  SKIP_DB_BACKUP=1
fi

# Wrap pg_dump:
if [[ "$SKIP_DB_BACKUP" -eq 0 ]]; then
  run_low_prio pg_dump ...
else
  echo "==> skip pg_dump (no migrate; set BEBEBENDLE_FORCE_DB_BACKUP=1 to force)"
fi
```

Add near end of major sections:

```bash
echo "==> timing: extract_s=${t_extract} install_s=... fingerprint_s=... build_s=... dump_s=... migrate_s=... pm2_s=... health_s=..."
echo "==> flags: SKIP_NEXT_BUILD=$SKIP_NEXT_BUILD SKIP_MIGRATE=$SKIP_MIGRATE SKIP_DB_BACKUP=$SKIP_DB_BACKUP ..."
```

Use `SECONDS` or `date +%s` deltas; keep simple.

- [ ] **Step 1: Read current dump/migrate block** in `deploy-release.sh` (~lines 330–350) and the offline test harness patterns in `ops/tests/deploy-release.sh`.

- [ ] **Step 2: Implement SKIP_DB_BACKUP** as above; ensure migrate path still dumps first.

- [ ] **Step 3: Add timing + flags log lines** (at least dump/migrate/build/pm2).

- [ ] **Step 4: Offline test** — stub environment where migrations hash matches previous ⇒ assert `pg_dump` not called (mock via `PATH` wrapper or script-under-test hooks if harness already stubs commands).

- [ ] **Step 5: Offline test** — force migrate path ⇒ dump runs.

- [ ] **Step 6: Run**

```bash
bash ops/tests/deploy-release.sh
# or whatever entry the harness uses
```

Expected: PASS.

- [ ] **Step 7: Commit** (when user allows)

```bash
git add ops/deploy-release.sh ops/tests/deploy-release.sh
git commit -m "perf(deploy): skip pg_dump when migrations are unchanged"
```

---

### Task 2: Selective PM2 restart

**Files:**
- Modify: `ops/deploy-release.sh`
- Modify: `ops/tests/deploy-release.sh`

**Logic:**

```bash
# Defaults
RESTART_NEXT=0
RESTART_BOT=0

if [[ ! -e "$ROOT/previous" || "${BEBEBENDLE_PM2_HARD_RESTART:-0}" == "1" ]]; then
  RESTART_NEXT=1
  RESTART_BOT=1
else
  # Next: build ran OR next fingerprint changed OR public env fp changed
  if [[ "$SKIP_NEXT_BUILD" -eq 0 ]]; then RESTART_NEXT=1; fi
  # Bot: uv lock hash / venv path / bot dir fingerprint changed
  if bot_changed; then RESTART_BOT=1; fi
  # Shared process wiring
  if ecosystem_or_run_scripts_changed; then
    RESTART_NEXT=1
    RESTART_BOT=1
  fi
fi

if [[ "$RESTART_NEXT" -eq 1 && "$RESTART_BOT" -eq 1 ]]; then
  pm2 delete bebebendle-next bebebendle-bot >/dev/null 2>&1 || true
  pm2 start "$ROOT/current/ecosystem.config.cjs"
elif [[ "$RESTART_NEXT" -eq 1 ]]; then
  pm2 describe bebebendle-next >/dev/null 2>&1 \
    && pm2 restart bebebendle-next --update-env \
    || pm2 start "$ROOT/current/ecosystem.config.cjs" --only bebebendle-next
elif [[ "$RESTART_BOT" -eq 1 ]]; then
  pm2 describe bebebendle-bot >/dev/null 2>&1 \
    && pm2 restart bebebendle-bot --update-env \
    || pm2 start "$ROOT/current/ecosystem.config.cjs" --only bebebendle-bot
else
  echo "==> pm2: no process restart required"
fi
pm2 save
```

Adjust to match actual ecosystem app names and whether `--only` is supported by the PM2 version on host. Prefer patterns already used in the script.

**Health:** keep full health suite (next live/ready, bot, public URL) in this task.

- [ ] **Step 1: Implement change detection helpers** (reuse existing hash helpers; extend for `bot/`, `ecosystem.config.cjs`, `scripts/run-next.sh`, `scripts/run-bot.sh`).

- [ ] **Step 2: Replace unconditional delete+start** (active path and any rollback path as appropriate).

- [ ] **Step 3: Offline tests** for next-only / bot-only / both / hard-restart flag.

- [ ] **Step 4: Run offline suite; commit**

```bash
git commit -m "perf(deploy): selective PM2 restart for next vs bot"
```

---

### Task 3: Cheaper fingerprints / release meta

**Files:**
- Modify: `ops/deploy-release.sh`
- Optionally modify: `.github/workflows/pipeline.yml` (write meta into tarball or side file)

**Goal:** Prefer `RELEASE_SHA` + narrow fingerprints over full `dir_hash(next/)` when equivalent.

- [ ] **Step 1: Write `.bebebendle-release-meta`** into each activated release:

```bash
RELEASE_SHA=...
NEXT_PUBLIC_FP=...
SKIP_NEXT_BUILD=...
# optional CI:
NEXT_CHANGED=0|1
BOT_CHANGED=0|1
MIG_CHANGED=0|1
```

- [ ] **Step 2: Skip-build decision** uses previous meta + current markers; fall back to existing `dir_hash` if meta missing (backward compatible with old releases).

- [ ] **Step 3 (optional in same task):** In `release` job, compute:

```bash
git diff --name-only "${{ github.event.before }}" "${{ github.sha }}" -- next/ bot/ 'next/db/migrations/'
```

Pack `deploy-markers.env` into artifact or upload alongside tarball; deploy job scp’s it; `deploy-release.sh` sources it.

Note: `github.event.before` may be all-zeros on first push — treat as full change.

- [ ] **Step 4: Offline test** missing meta ⇒ falls back to hash path; present meta ⇒ skip dir_hash when markers say unchanged.

- [ ] **Step 5: Commit**

```bash
git commit -m "perf(deploy): release meta fingerprints to avoid full next tree hash"
```

---

### Task 4: Optional nightly backup script

**Files:**
- Create: `ops/backup.sh` (if not present)
- Modify: `docs/runbooks/pm2-host-bootstrap.md` / deploy runbook

```bash
#!/usr/bin/env bash
set -euo pipefail
# load shared/.env DATABASE_URL
# pg_dump --format=custom to /opt/bebebendle/backups/nightly-...
# retain last N
```

- [ ] **Step 1: Implement script** with root/path args consistent with deploy layout.

- [ ] **Step 2: Document cron** (staging/prod): e.g. daily 03:00 host local time.

- [ ] **Step 3: Commit**

```bash
git commit -m "ops: nightly PostgreSQL backup script for bebebendle host"
```

---

### Task 5: CI caches + path filters (PR / dev only)

**Files:**
- Modify: `.github/workflows/pipeline.yml`

**Caches:**

```yaml
# frontend / migrations after setup-bun:
- uses: actions/cache@v4
  with:
    path: |
      ~/.bun/install/cache
      next/node_modules
    key: bun-${{ runner.os }}-${{ hashFiles('next/bun.lock', '.bun-version') }}

# bot after setup-uv:
# enable cache: true on setup-uv@v4 if supported, else cache ~/.cache/uv
```

**Path filters** (use `dorny/paths-filter@v3` on `pull_request` and `push` to `dev` only):

```yaml
# Pseudo-structure
jobs:
  changes:
    if: github.ref_name == 'dev' || github.event_name == 'pull_request'
    outputs:
      frontend: ...
      bot: ...
      migrations: ...
  frontend:
    needs: [changes]
    if: |
      github.ref_name == 'staging' || github.ref_name == 'main' ||
      needs.changes.outputs.frontend == 'true' || needs.changes.outputs == null
```

Simpler approach if conditionals get messy:

- Always run all jobs on `staging`/`main`.
- On `pull_request` + `dev`, use path filter outputs to skip.

Ensure `release`/`deploy` still `needs` the same full set on staging/main.

- [ ] **Step 1: Add caches** to frontend, bot, migrations.

- [ ] **Step 2: Add path-filter job** for PR/dev only.

- [ ] **Step 3: Wire `if:`** on frontend/bot/migrations carefully so staging/main never skip.

- [ ] **Step 4: Open a dry-run PR or push to dev** and confirm Actions UI (manual verification note in PR).

- [ ] **Step 5: Commit**

```bash
git commit -m "ci: cache bun/uv and path-filter PR/dev jobs"
```

---

### Task 6: Phase 2 — Prebuild Next in GitHub (staging first)

**Files:**
- Modify: `.github/workflows/pipeline.yml`
- Modify: `ops/deploy-release.sh`
- Modify: `ops/tests/deploy-release.sh`
- Modify: runbooks
- GitHub Environment vars: `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (+ any other public bake vars)

**Workflow sketch:**

```yaml
prebuild-next:
  if: github.ref_name == 'staging' || github.ref_name == 'main'
  needs: [frontend, bot, migrations, security, deploy-script]
  environment: ${{ github.ref_name == 'main' && 'production' || 'staging' }}
  runs-on: ubuntu-latest
  steps:
    - checkout
    - setup bun
    - bun install --frozen-lockfile
    - run: bun run build
      env:
        NEXT_TELEMETRY_DISABLED: "1"
        APP_URL: ${{ vars.APP_URL }}
        NEXT_PUBLIC_SITE_URL: ${{ vars.APP_URL }}
        NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: ${{ vars.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME }}
    - tar czf next-prebuild.tgz -C next .next
    - upload-artifact name: next-prebuild-${{ github.sha }}
```

Deploy job downloads artifact, scp’s `next-prebuild.tgz` + source archive; `deploy-release.sh`:

```bash
if [[ "${BEBEBENDLE_HOST_BUILD:-0}" != "1" && -f "$INCOMING/next-prebuild.tgz" ]]; then
  tar -xzf "$INCOMING/next-prebuild.tgz" -C "$RELEASE/next"
  # verify .next
  SKIP_NEXT_BUILD=1
  PREBUILT=1
else
  # existing build path
fi
```

- [ ] **Step 1: Document required GH Environment variables** in runbook; set on **staging** first.

- [ ] **Step 2: Add `prebuild-next` job** + wire into deploy scp list.

- [ ] **Step 3: Host activate path** + fingerprint match (public env).

- [ ] **Step 4: Offline test** prebuild present ⇒ no `bun run build`.

- [ ] **Step 5: Staging soak** (manual): next-only deploy; confirm no compile spike; health green.

- [ ] **Step 6: Enable production Environment vars; ship.**

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(ci): prebuild Next in Actions; host activates artifact"
```

---

### Task 7: Runbook + AGENTS updates

**Files:**
- `docs/runbooks/deploy-and-rollback.md`
- `docs/runbooks/pm2-host-bootstrap.md`
- `AGENTS.md`

Document:

| Flag / topic | Meaning |
|--------------|---------|
| `BEBEBENDLE_FORCE_DB_BACKUP=1` | dump even if no migrate |
| `BEBEBENDLE_PM2_HARD_RESTART=1` | delete+start both |
| `BEBEBENDLE_HOST_BUILD=1` | force host Next compile |
| Dump policy | only on migrate (+ nightly) |
| Selective PM2 | next vs bot |
| Phase 2 prebuild | GH vars list, fallback |

- [ ] **Step 1: Edit runbooks** with operator checklist from spec §8.2.

- [ ] **Step 2: Short AGENTS.md bullet** under ops/CI.

- [ ] **Step 3: Commit**

```bash
git commit -m "docs: CI/CD load reduction flags and deploy behavior"
```

---

### Task 8 (optional / phase 3): Next standalone — only if needed

**Do not start unless phase 2 still leaves host disk/RAM painful.**

- Evaluate `output: 'standalone'` in `next.config`.
- Ensure migrate still runs (drizzle-kit from full install or separate migrate step in CI).
- Update deploy activate path.

---

## Verification gate (end-to-end)

```bash
bash ops/tests/deploy-release.sh   # or project’s offline entry
```

**Staging matrix (manual):**

1. Next-only push → no dump (if no mig); bot uptime unchanged; site healthy.  
2. Bot-only push → no next rebuild; next uptime unchanged.  
3. Migration push → dump created; migrate; healthy.  
4. Break health (staging) → auto-rollback.  
5. Phase 2: host logs show skip build / PREBUILT=1.

**Metrics:** compare `==> timing` lines before/after on identical change types.

---

## Spec coverage checklist

| Spec section | Task |
|--------------|------|
| §4.1 dump-if-migrate | 1 |
| §4.2 selective PM2 | 2 |
| §4.3 fingerprints | 3 |
| §4.4 timing logs | 1 |
| §4.5–4.6 CI cache/filters | 5 |
| §5 prebuild | 6 |
| §6 safety nets | all (constraints) |
| Nightly backup | 4 |
| Docs | 7 |
| Standalone | 8 optional |

---

## Execution notes

- Prefer **Task 1 → 2 → 3 → 5 → 4 → 7 → 6** (host relief first, then CI, then prebuild).  
- Test offline after every deploy-script change before relying on staging.  
- Production prebuild only after staging soak.  
- Do not commit Windows metadata noise.
