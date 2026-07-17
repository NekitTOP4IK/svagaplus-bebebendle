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
  export PATH="${HOME}/.bun/bin:${HOME}/bin:/usr/local/bin:${PATH}"
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
SKIP_NEXT_BUILD=0
if [[ -n "$PREV_RELEASE" && -d "$PREV_RELEASE/next/.next" ]]; then
  PREV_NEXT_SRC="$(dir_hash "$PREV_RELEASE/next")"
  if [[ "$NEW_NEXT_SRC" == "$PREV_NEXT_SRC" && "$NEW_NEXT_SRC" != "missing" ]]; then
    echo "    next sources unchanged — reusing .next"
    clone_tree "$PREV_RELEASE/next/.next" "$RELEASE/next/.next"
    SKIP_NEXT_BUILD=1
  fi
fi
if [[ "$SKIP_NEXT_BUILD" -eq 0 ]]; then
  run_low_prio bun run build
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

echo "==> pre-migrate db backup"
BACKUP="$BACKUP_DIR/pre-$RELEASE_SHA-$(date -u +%Y%m%dT%H%M%SZ).dump"
run_low_prio pg_dump --format=custom --file="$BACKUP" "$DATABASE_URL"

echo "==> migrate"
NEW_MIG_HASH="$(dir_hash "$RELEASE/next/db/migrations")"
SKIP_MIGRATE=0
if [[ -n "$PREV_RELEASE" && -d "$PREV_RELEASE/next/db/migrations" ]]; then
  PREV_MIG_HASH="$(dir_hash "$PREV_RELEASE/next/db/migrations")"
  if [[ "$NEW_MIG_HASH" == "$PREV_MIG_HASH" ]]; then
    echo "    migrations unchanged — skip"
    SKIP_MIGRATE=1
  fi
fi
if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  cd "$RELEASE/next"
  if [[ -x "$RELEASE/next/node_modules/.bin/drizzle-kit" ]]; then
    "$RELEASE/next/node_modules/.bin/drizzle-kit" migrate
  elif [[ -f "$RELEASE/next/package.json" ]] && grep -q '"db:migrate"' "$RELEASE/next/package.json"; then
    bun run db:migrate
  else
    bun x drizzle-kit migrate
  fi
fi

OLD_RELEASE="$PREV_RELEASE"
SWITCHED=0

rollback() {
  local exit_code=$?
  echo "deploy failed (exit $exit_code); rolling back app symlink" >&2
  if [[ "$SWITCHED" -eq 1 && -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]]; then
    ln -sfn "$OLD_RELEASE" "$ROOT/current.rollback"
    mv -Tf "$ROOT/current.rollback" "$ROOT/current"
    pm2 delete bebebendle-next bebebendle-bot >/dev/null 2>&1 || true
    pm2 start "$ROOT/current/ecosystem.config.cjs" || true
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
export PATH="${HOME}/.bun/bin:${HOME}/bin:/usr/local/bin:${PATH}"
pm2 delete bebebendle-next bebebendle-bot >/dev/null 2>&1 || true
pm2 start "$ROOT/current/ecosystem.config.cjs"
pm2 save

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

echo "==> health"
wait_for "http://127.0.0.1:${PORT:-3000}/api/health/live"
wait_for "http://127.0.0.1:${PORT:-3000}/api/health/ready"
wait_for "http://127.0.0.1:${BOT_HEALTH_PORT:-3011}/health"
wait_for "${APP_URL%/}/api/health/live"

SWITCHED=0
trap - ERR
rm -f "$ARCHIVE" "$CHECKSUM"

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
