#!/usr/bin/env bash
set -Eeuo pipefail

RELEASE_SHA="${1:?release sha is required}"
DEPLOY_ENV="${2:?staging or production is required}"
APP_URL="${3:?application URL is required}"
KEEP_RELEASES="${BEBEBENDLE_KEEP_RELEASES:-3}"
KEEP_DB_BACKUPS="${BEBEBENDLE_KEEP_DB_BACKUPS:-3}"

[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ ]] || {
  echo "invalid release sha" >&2
  exit 2
}
[[ "$DEPLOY_ENV" == "staging" || "$DEPLOY_ENV" == "production" ]] || {
  echo "DEPLOY_ENV must be staging or production" >&2
  exit 2
}

ROOT="${BEBEBENDLE_DEPLOY_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INCOMING="$ROOT/incoming"
ARCHIVE="$INCOMING/bebebendle-$RELEASE_SHA.tar.gz"
CHECKSUM="$ARCHIVE.sha256"
RELEASE="$ROOT/releases/$RELEASE_SHA"
ENV_FILE="$ROOT/shared/.env"
BACKUP_DIR="$ROOT/backups"
CACHE_DIR="$ROOT/shared/cache"
VENVS_DIR="$ROOT/shared/venvs"

setup_path() {
  export NVM_DIR="${HOME}/.nvm"
  if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    . "${NVM_DIR}/nvm.sh"
    nvm use default >/dev/null 2>&1 || nvm use 20 >/dev/null 2>&1 || true
  fi
  # User-local tools: bun installer, uv (pipx/cargo/curl), optional ~/bin wrappers.
  # Non-interactive SSH does not source .profile, so PATH must be explicit here.
  export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${HOME}/bin:/usr/local/bin:${PATH}"
}

require_cmd() {
  command -v "$1" >/dev/null || {
    echo "missing command: $1" >&2
    exit 1
  }
}

file_hash() {
  sha256sum "$1" | awk '{print $1}'
}

dir_hash() {
  local dir=$1
  if [[ ! -d "$dir" ]]; then
    echo "missing"
    return 0
  fi
  (
    cd "$dir"
    find . -type f \
      ! -path './node_modules/*' \
      ! -path './.next/*' \
      ! -path './.venv/*' \
      ! -path './.git/*' \
      -print0 2>/dev/null |
      sort -z |
      xargs -0 sha256sum 2>/dev/null |
      sha256sum |
      awk '{print $1}'
  )
}

force_rm() {
  local path=$1
  [[ -e "$path" || -L "$path" ]] || return 0
  if [[ -L "$path" ]]; then
    rm -f "$path" 2>/dev/null || true
    return 0
  fi
  # Drop nested symlinks first so we never chmod/rm into shared venvs via link.
  find "$path" -xdev -type l -delete 2>/dev/null || true
  chmod -R u+w "$path" 2>/dev/null || true
  if rm -rf "$path" 2>/dev/null; then
    return 0
  fi
  if command -v sudo >/dev/null && sudo -n true 2>/dev/null; then
    sudo -n rm -rf "$path" 2>/dev/null || true
  fi
  if [[ -e "$path" ]]; then
    echo "warn: could not remove $path (likely root-owned; run: sudo chown -R deploy:deploy /opt/bebebendle)" >&2
  fi
  return 0
}

clone_tree() {
  local src=$1
  local dst=$2
  force_rm "$dst"
  if cp -al "$src" "$dst" 2>/dev/null; then
    return 0
  fi
  cp -a "$src" "$dst"
}

run_low_prio() {
  if command -v nice >/dev/null && command -v ionice >/dev/null; then
    nice -n 10 ionice -c2 -n7 "$@"
  elif command -v nice >/dev/null; then
    nice -n 10 "$@"
  else
    "$@"
  fi
}

setup_path

mkdir -p "$ROOT/releases" "$ROOT/shared/uploads" "$ROOT/shared/logs" "$BACKUP_DIR" "$INCOMING" \
  "$CACHE_DIR/bun" "$CACHE_DIR/uv" "$CACHE_DIR/node_modules" "$VENVS_DIR"
exec 9>"$ROOT/deploy.lock"
flock -n 9 || {
  echo "another deploy is active" >&2
  exit 1
}

export BUN_INSTALL_CACHE_DIR="${BUN_INSTALL_CACHE_DIR:-$CACHE_DIR/bun}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-$CACHE_DIR/uv}"
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=1024}"

cd "$INCOMING"
[[ -f "$ARCHIVE" ]] || {
  echo "missing archive: $ARCHIVE" >&2
  exit 1
}
[[ -f "$CHECKSUM" ]] || {
  echo "missing checksum: $CHECKSUM" >&2
  exit 1
}
sha256sum -c "$(basename "$CHECKSUM")"

for cmd in bun node uv pm2 pg_dump curl tar flock sha256sum; do
  require_cmd "$cmd"
done

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js >= 20.9 required (found $(node -v 2>/dev/null || echo none))" >&2
  exit 1
fi

[[ -f "$ENV_FILE" ]] || {
  echo "missing $ENV_FILE" >&2
  exit 1
}

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

require_key() {
  local key=$1
  [[ -n "${!key:-}" ]] || {
    echo "missing env key in shared/.env: $key" >&2
    exit 1
  }
}

require_key APP_ENV
require_key SESSION_SECRET
require_key DATABASE_URL
require_key BOT_TOKEN
require_key BEBEBENDLE_INTERNAL_SECRET
require_key SVAGAPLUS_INTERNAL_URL
require_key SVAGAPLUS_INTERNAL_SECRET
require_key SVAGA_TARGET_USER_ID
require_key NEXT_PUBLIC_TELEGRAM_BOT_USERNAME
require_key UPLOADS_DIR

if [[ -z "${REDIS_URL:-}" && -z "${REDIS_HOST:-}" ]]; then
  echo "missing REDIS_URL or REDIS_HOST in shared/.env" >&2
  exit 1
fi

[[ "$APP_ENV" == "$DEPLOY_ENV" ]] || {
  echo "APP_ENV ($APP_ENV) != deploy env ($DEPLOY_ENV)" >&2
  exit 1
}

# Public URL for share links / absolute client URLs.
# GitHub Environment var APP_URL is the third CLI arg — always bake into Next build
# (overrides stale NEXT_PUBLIC_* in shared/.env so share text tracks deploy APP_URL).
APP_URL="${APP_URL%/}"
export NEXT_PUBLIC_SITE_URL="$APP_URL"
export NEXT_PUBLIC_APP_URL="$APP_URL"
echo "==> public site URL (NEXT_PUBLIC_SITE_URL)=$NEXT_PUBLIC_SITE_URL"

# Keep shared/.env in sync so local tooling and restarts see the same public URL
# (does not rewrite if already equal; never prints secrets).
upsert_env_key() {
  local key=$1
  local value=$2
  local file=$3
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    local cur
    cur="$(grep "^${key}=" "$file" | head -1 | cut -d= -f2-)"
    if [[ "$cur" == "$value" ]]; then
      return 0
    fi
    # portable in-place replace without sed -i differences
    local tmp
    tmp="$(mktemp)"
    awk -v k="$key" -v v="$value" 'BEGIN{FS=OFS="="} $1==k {$0=k"="v} {print}' "$file" >"$tmp"
    cat "$tmp" >"$file"
    rm -f "$tmp"
  else
    printf '\n%s=%s\n' "$key" "$value" >>"$file"
  fi
}
upsert_env_key "NEXT_PUBLIC_SITE_URL" "$NEXT_PUBLIC_SITE_URL" "$ENV_FILE"
upsert_env_key "NEXT_PUBLIC_APP_URL" "$NEXT_PUBLIC_APP_URL" "$ENV_FILE"
# re-source so child processes see updated keys
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
export NEXT_PUBLIC_SITE_URL NEXT_PUBLIC_APP_URL

AVAILABLE_KB=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
[[ "$AVAILABLE_KB" -ge 1048576 ]] || {
  echo "less than 1 GiB free" >&2
  exit 1
}

PREV_RELEASE=""
[[ -L "$ROOT/current" ]] && PREV_RELEASE="$(readlink -f "$ROOT/current")"

force_rm "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
ln -sfn "$ENV_FILE" "$RELEASE/.env"
force_rm "$RELEASE/uploads"
ln -sfn "$ROOT/shared/uploads" "$RELEASE/uploads"
mkdir -p "$ROOT/shared/logs/next" "$ROOT/shared/logs/bot"
chmod +x "$RELEASE/scripts/run-next.sh" "$RELEASE/scripts/run-bot.sh" 2>/dev/null || true
chmod +x "$RELEASE/ops/install-daily-timers.sh" 2>/dev/null || true

PREBUILT=0
if [[ -f "$RELEASE/next/.next/BUILD_ID" && -d "$RELEASE/next/node_modules" && -f "$RELEASE/next/.bebebendle-public-env" ]]; then
  PREBUILT=1
fi

PUBLIC_ENV_FP="$(
  printf '%s\0' \
    "${NEXT_PUBLIC_SITE_URL:-}" \
    "${NEXT_PUBLIC_APP_URL:-}" \
    "${NEXT_PUBLIC_TELEGRAM_BOT_USERNAME:-}" |
    sha256sum | awk '{print $1}'
)"

if [[ "$PREBUILT" -eq 1 ]]; then
  echo "==> next: prebuilt artifact from CI"
  SHIPPED_FP="$(cat "$RELEASE/next/.bebebendle-public-env" 2>/dev/null || true)"
  if [[ "$SHIPPED_FP" != "$PUBLIC_ENV_FP" ]]; then
    echo "ERROR: prebuilt .next was built with different NEXT_PUBLIC_* values" >&2
    echo "       shipped fingerprint: $SHIPPED_FP" >&2
    echo "       host fingerprint:    $PUBLIC_ENV_FP" >&2
    echo "       fix: re-run the release pipeline (APP_URL / NEXT_PUBLIC_TELEGRAM_BOT_USERNAME changed since build)" >&2
    exit 1
  fi
  SKIP_NEXT_BUILD=1
else
  echo "==> next dependencies"
  NEXT_LOCK_HASH="$(
    {
      file_hash "$RELEASE/next/package.json"
      file_hash "$RELEASE/next/bun.lock"
    } | sha256sum | awk '{print $1}'
  )"
  NEXT_NM_CACHE="$CACHE_DIR/node_modules/$NEXT_LOCK_HASH"
  cd "$RELEASE/next"
  if [[ -d "$NEXT_NM_CACHE" ]]; then
    echo "    reusing node_modules $NEXT_LOCK_HASH"
    clone_tree "$NEXT_NM_CACHE" "$RELEASE/next/node_modules"
  else
    echo "    bun install (cold)"
    run_low_prio bun install --frozen-lockfile
    mkdir -p "$CACHE_DIR/node_modules"
    force_rm "$NEXT_NM_CACHE"
    clone_tree "$RELEASE/next/node_modules" "$NEXT_NM_CACHE"
  fi

  echo "==> next build"
  NEW_NEXT_SRC="$(dir_hash "$RELEASE/next")"
  # NEXT_PUBLIC_* is inlined at build time — env change must invalidate .next reuse
  SKIP_NEXT_BUILD=0
  if [[ -n "$PREV_RELEASE" && -d "$PREV_RELEASE/next/.next" ]]; then
    PREV_NEXT_SRC="$(dir_hash "$PREV_RELEASE/next")"
    PREV_PUBLIC_ENV_FP=""
    if [[ -f "$PREV_RELEASE/next/.bebebendle-public-env" ]]; then
      PREV_PUBLIC_ENV_FP="$(cat "$PREV_RELEASE/next/.bebebendle-public-env")"
    fi
    if [[ "$NEW_NEXT_SRC" == "$PREV_NEXT_SRC" && "$NEW_NEXT_SRC" != "missing" && "$PUBLIC_ENV_FP" == "$PREV_PUBLIC_ENV_FP" ]]; then
      echo "    next sources + public env unchanged — reusing .next"
      clone_tree "$PREV_RELEASE/next/.next" "$RELEASE/next/.next"
      printf '%s\n' "$PUBLIC_ENV_FP" >"$RELEASE/next/.bebebendle-public-env"
      SKIP_NEXT_BUILD=1
    elif [[ "$PUBLIC_ENV_FP" != "$PREV_PUBLIC_ENV_FP" ]]; then
      echo "    public env fingerprint changed — rebuilding next"
    fi
  fi
  if [[ "$SKIP_NEXT_BUILD" -eq 0 ]]; then
    run_low_prio env \
      NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" \
      NEXT_PUBLIC_APP_URL="$NEXT_PUBLIC_APP_URL" \
      bun run build
    printf '%s\n' "$PUBLIC_ENV_FP" >"$RELEASE/next/.bebebendle-public-env"
  fi
fi

echo "==> bot dependencies"
BOT_LOCK_HASH="$(file_hash "$RELEASE/bot/uv.lock")"
BOT_VENV="$VENVS_DIR/bot-$BOT_LOCK_HASH"
cd "$RELEASE/bot"
if [[ -x "$BOT_VENV/bin/python" ]]; then
  echo "    reusing bot venv $BOT_LOCK_HASH"
else
  echo "    uv sync (cold) -> $BOT_VENV"
  force_rm "$BOT_VENV"
  run_low_prio env UV_PROJECT_ENVIRONMENT="$BOT_VENV" uv sync --no-dev --frozen
fi
force_rm "$RELEASE/bot/.venv"
ln -sfn "$BOT_VENV" "$RELEASE/bot/.venv"

echo "==> prune unused bot venvs"
PREV_BOT_HASH=""
if [[ -n "$PREV_RELEASE" && -f "$PREV_RELEASE/bot/uv.lock" ]]; then
  PREV_BOT_HASH="$(file_hash "$PREV_RELEASE/bot/uv.lock" 2>/dev/null || true)"
fi
shopt -s nullglob
for venv_path in "$VENVS_DIR"/bot-*; do
  base="$(basename "$venv_path")"
  hash="${base#bot-}"
  if [[ "$hash" == "$BOT_LOCK_HASH" || ( -n "$PREV_BOT_HASH" && "$hash" == "$PREV_BOT_HASH" ) ]]; then
    continue
  fi
  echo "    remove $base"
  force_rm "$venv_path"
done
shopt -u nullglob

# Compute migrate skip before optional dump (dump only protects schema changes).
echo "==> migrate decision"
NEW_MIG_HASH="$(dir_hash "$RELEASE/next/db/migrations")"
SKIP_MIGRATE=0
if [[ -n "$PREV_RELEASE" ]]; then
  # dir_hash returns "missing" when the tree is absent — treat equal hashes as no-op.
  PREV_MIG_HASH="$(dir_hash "$PREV_RELEASE/next/db/migrations")"
  if [[ "$NEW_MIG_HASH" == "$PREV_MIG_HASH" ]]; then
    echo "    migrations unchanged — skip migrate"
    SKIP_MIGRATE=1
  fi
fi

SKIP_DB_BACKUP=0
if [[ "$SKIP_MIGRATE" -eq 1 && "${BEBEBENDLE_FORCE_DB_BACKUP:-0}" != "1" ]]; then
  SKIP_DB_BACKUP=1
fi

t_dump_start=$SECONDS
if [[ "$SKIP_DB_BACKUP" -eq 0 ]]; then
  echo "==> pre-migrate db backup"
  BACKUP="$BACKUP_DIR/pre-$RELEASE_SHA-$(date -u +%Y%m%dT%H%M%SZ).dump"
  run_low_prio pg_dump --format=custom --file="$BACKUP" "$DATABASE_URL"
else
  echo "==> skip pg_dump (no migrate; set BEBEBENDLE_FORCE_DB_BACKUP=1 to force)"
fi
t_dump=$((SECONDS - t_dump_start))

t_migrate_start=$SECONDS
if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  echo "==> migrate"
  cd "$RELEASE/next"
  if [[ -x "$RELEASE/next/node_modules/.bin/drizzle-kit" ]]; then
    "$RELEASE/next/node_modules/.bin/drizzle-kit" migrate
  elif [[ -f "$RELEASE/next/package.json" ]] && grep -q '"db:migrate"' "$RELEASE/next/package.json"; then
    bun run db:migrate
  else
    bun x drizzle-kit migrate
  fi
else
  echo "==> migrate skipped"
fi
t_migrate=$((SECONDS - t_migrate_start))

OLD_RELEASE="$PREV_RELEASE"
SWITCHED=0

pm2_hard_start_both() {
  pm2 delete bebebendle-next bebebendle-bot >/dev/null 2>&1 || true
  pm2 start "$ROOT/current/ecosystem.config.cjs" || true
}

rollback() {
  local exit_code=$?
  echo "deploy failed (exit $exit_code); rolling back app symlink" >&2
  if [[ "$SWITCHED" -eq 1 && -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
    ln -sfn "$OLD_RELEASE" "$ROOT/current.rollback"
    mv -Tf "$ROOT/current.rollback" "$ROOT/current"
    pm2_hard_start_both
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

echo "==> pm2 reload"
export PATH="${HOME}/.bun/bin:${HOME}/.local/bin:${HOME}/bin:/usr/local/bin:${PATH}"

# Selective restart: only touch processes whose inputs changed.
RESTART_NEXT=0
RESTART_BOT=0
if [[ -z "$PREV_RELEASE" || "${BEBEBENDLE_PM2_HARD_RESTART:-0}" == "1" ]]; then
  RESTART_NEXT=1
  RESTART_BOT=1
  echo "    hard restart both (first deploy or BEBEBENDLE_PM2_HARD_RESTART=1)"
else
  if [[ "$SKIP_NEXT_BUILD" -eq 0 || "$PREBUILT" -eq 1 ]]; then
    RESTART_NEXT=1
  fi
  # Bot process inputs: lock (venv) or bot source tree.
  NEW_BOT_SRC="$(dir_hash "$RELEASE/bot")"
  PREV_BOT_SRC="missing"
  if [[ -d "$PREV_RELEASE/bot" ]]; then
    PREV_BOT_SRC="$(dir_hash "$PREV_RELEASE/bot")"
  fi
  if [[ "$BOT_LOCK_HASH" != "${PREV_BOT_HASH:-}" || "$NEW_BOT_SRC" != "$PREV_BOT_SRC" ]]; then
    RESTART_BOT=1
  fi
  # Shared process wiring always restarts both.
  for wiring in ecosystem.config.cjs scripts/run-next.sh scripts/run-bot.sh; do
    if [[ -f "$RELEASE/$wiring" ]]; then
      if [[ ! -f "$PREV_RELEASE/$wiring" ]] ||
        [[ "$(file_hash "$RELEASE/$wiring")" != "$(file_hash "$PREV_RELEASE/$wiring")" ]]; then
        RESTART_NEXT=1
        RESTART_BOT=1
        echo "    wiring changed: $wiring — restart both"
        break
      fi
    fi
  done
fi

t_pm2_start=$SECONDS
if [[ "$RESTART_NEXT" -eq 1 && "$RESTART_BOT" -eq 1 ]]; then
  echo "    restart both apps"
  pm2 delete bebebendle-next bebebendle-bot >/dev/null 2>&1 || true
  pm2 start "$ROOT/current/ecosystem.config.cjs"
elif [[ "$RESTART_NEXT" -eq 1 ]]; then
  echo "    restart bebebendle-next only"
  if pm2 describe bebebendle-next >/dev/null 2>&1; then
    pm2 restart bebebendle-next --update-env
  else
    pm2 start "$ROOT/current/ecosystem.config.cjs" --only bebebendle-next
  fi
elif [[ "$RESTART_BOT" -eq 1 ]]; then
  echo "    restart bebebendle-bot only"
  if pm2 describe bebebendle-bot >/dev/null 2>&1; then
    pm2 restart bebebendle-bot --update-env
  else
    pm2 start "$ROOT/current/ecosystem.config.cjs" --only bebebendle-bot
  fi
else
  echo "    no process restart required (app inputs unchanged)"
fi
pm2 save
t_pm2=$((SECONDS - t_pm2_start))

wait_for() {
  local url=$1
  local i
  for i in $(seq 1 45); do
    if curl -fsS --max-time 3 "$url" >/dev/null; then
      echo "ok $url"
      return 0
    fi
    sleep 2
  done
  echo "health check failed: $url" >&2
  return 1
}

t_health_start=$SECONDS
echo "==> health"
wait_for "http://127.0.0.1:${PORT:-3000}/api/health/live"
wait_for "http://127.0.0.1:${PORT:-3000}/api/health/ready"
wait_for "http://127.0.0.1:${BOT_HEALTH_PORT:-3011}/health"
wait_for "${APP_URL%/}/api/health/live"
t_health=$((SECONDS - t_health_start))

TIMER_STATUS="$ROOT/current/ops/install-daily-timers.sh"
if [[ -x "$TIMER_STATUS" ]] && ! "$TIMER_STATUS" status; then
  echo "warn: systemd timer status check failed; repair with: sudo bash /opt/bebebendle/current/ops/install-daily-timers.sh install" >&2
fi

SWITCHED=0
trap - ERR
rm -f "$ARCHIVE" "$CHECKSUM"

RESTART_LABEL="none"
if [[ "$RESTART_NEXT" -eq 1 && "$RESTART_BOT" -eq 1 ]]; then
  RESTART_LABEL="both"
elif [[ "$RESTART_NEXT" -eq 1 ]]; then
  RESTART_LABEL="next"
elif [[ "$RESTART_BOT" -eq 1 ]]; then
  RESTART_LABEL="bot"
fi
echo "==> flags: PREBUILT=$PREBUILT SKIP_NEXT_BUILD=$SKIP_NEXT_BUILD SKIP_MIGRATE=$SKIP_MIGRATE SKIP_DB_BACKUP=$SKIP_DB_BACKUP RESTART=$RESTART_LABEL"
echo "==> timing: dump_s=${t_dump} migrate_s=${t_migrate} pm2_s=${t_pm2} health_s=${t_health}"

echo "==> prune old releases (keep $KEEP_RELEASES)"
mapfile -t OLD_RELEASES < <(
  find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
    sort -rn |
    tail -n "+$((KEEP_RELEASES + 1))" |
    cut -d' ' -f2-
)
for old in "${OLD_RELEASES[@]:-}"; do
  [[ -n "$old" ]] || continue
  current_target="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
  previous_target="$(readlink -f "$ROOT/previous" 2>/dev/null || true)"
  if [[ "$old" != "$current_target" && "$old" != "$previous_target" ]]; then
    echo "    remove $(basename "$old")"
    force_rm "$old"
  fi
done

echo "==> prune pre-migrate dumps (keep $KEEP_DB_BACKUPS)"
mapfile -t OLD_DUMPS < <(
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'pre-*.dump' -printf '%T@ %p\n' 2>/dev/null |
    sort -rn |
    tail -n "+$((KEEP_DB_BACKUPS + 1))" |
    cut -d' ' -f2-
)
for dump in "${OLD_DUMPS[@]:-}"; do
  [[ -n "$dump" ]] || continue
  echo "    remove $(basename "$dump")"
  rm -f "$dump"
done

echo "==> prune node_modules caches"
mapfile -t OLD_NM < <(
  find "$CACHE_DIR/node_modules" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null |
    sort -rn |
    tail -n +4 |
    cut -d' ' -f2-
)
for nm in "${OLD_NM[@]:-}"; do
  [[ -n "$nm" ]] || continue
  echo "    remove $(basename "$nm")"
  force_rm "$nm"
done

echo "deployed $RELEASE_SHA to $DEPLOY_ENV"
