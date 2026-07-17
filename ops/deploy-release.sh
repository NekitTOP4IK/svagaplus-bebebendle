#!/usr/bin/env bash
# Atomic PM2 release deploy for Bebebendle.
#
# Secrets model:
#   - Application runtime secrets live ONLY in $ROOT/shared/.env on the host.
#   - CI/CD must never upload BOT_TOKEN, SESSION_SECRET, DB passwords, etc.
#   - GitHub Environment secrets are for deploy transport only
#     (DEPLOY_HOST/USER/PATH/SSH_KEY/KNOWN_HOSTS + vars.APP_URL).
#
# Usage (on host):
#   BEBEBENDLE_DEPLOY_ROOT=/opt/bebebendle \
#     bash ops/deploy-release.sh <40-char-sha> <staging|production> <app-url>
set -Eeuo pipefail

RELEASE_SHA="${1:?release sha is required}"
DEPLOY_ENV="${2:?staging or production is required}"
APP_URL="${3:?application URL is required}"

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

# Prefer an already-configured PATH (CI stubs, interactive shells), then user installs.
export PATH="${PATH}:${HOME}/.bun/bin:${HOME}/.local/bin:/usr/local/bin"

mkdir -p "$ROOT/releases" "$ROOT/shared/uploads" "$ROOT/shared/logs" "$BACKUP_DIR" "$INCOMING"
exec 9>"$ROOT/deploy.lock"
flock -n 9 || {
  echo "another deploy is active" >&2
  exit 1
}

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

for command in bun uv pm2 pg_dump curl tar flock sha256sum; do
  command -v "$command" >/dev/null || {
    echo "missing command: $command" >&2
    exit 1
  }
done

[[ -f "$ENV_FILE" ]] || {
  echo "missing shared env $ENV_FILE (create on host; never from CI)" >&2
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
  echo "missing env key in shared/.env: REDIS_URL or REDIS_HOST" >&2
  exit 1
fi

[[ "$APP_ENV" == "$DEPLOY_ENV" ]] || {
  echo "APP_ENV ($APP_ENV) does not match deploy environment ($DEPLOY_ENV)" >&2
  exit 1
}

AVAILABLE_KB=$(df -Pk "$ROOT" | awk 'NR==2 {print $4}')
[[ "$AVAILABLE_KB" -ge 1048576 ]] || {
  echo "less than 1 GiB free on deploy volume" >&2
  exit 1
}

rm -rf "$RELEASE"
mkdir -p "$RELEASE"
tar -xzf "$ARCHIVE" -C "$RELEASE"
ln -sfn "$ENV_FILE" "$RELEASE/.env"
rm -rf "$RELEASE/uploads"
ln -sfn "$ROOT/shared/uploads" "$RELEASE/uploads"
mkdir -p "$ROOT/shared/logs/next" "$ROOT/shared/logs/bot"
chmod +x "$RELEASE/scripts/run-next.sh" "$RELEASE/scripts/run-bot.sh" 2>/dev/null || true
chmod +x "$RELEASE/ops/deploy-release.sh" 2>/dev/null || true

cd "$RELEASE/next"
bun install --frozen-lockfile
bun run build

cd "$RELEASE/bot"
UV_PROJECT_ENVIRONMENT="$RELEASE/bot/.venv" uv sync --no-dev --frozen

BACKUP="$BACKUP_DIR/pre-$RELEASE_SHA-$(date -u +%Y%m%dT%H%M%SZ).dump"
pg_dump --format=custom --file="$BACKUP" "$DATABASE_URL"

cd "$RELEASE/next"
bunx drizzle-kit migrate

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

wait_for() {
  local url=$1
  for _ in $(seq 1 45); do
    if curl -fsS --max-time 3 "$url" >/dev/null; then
      return 0
    fi
    sleep 2
  done
  echo "health check failed: $url" >&2
  return 1
}

wait_for "http://127.0.0.1:${PORT:-3000}/api/health/live"
wait_for "http://127.0.0.1:${PORT:-3000}/api/health/ready"
wait_for "http://127.0.0.1:${BOT_HEALTH_PORT:-3011}/health"
# Public/app URL check (on-host). Use http://127.0.0.1:3000 until DNS/TLS exists.
wait_for "${APP_URL%/}/api/health/live"

SWITCHED=0
trap - ERR
rm -f "$ARCHIVE" "$CHECKSUM"

mapfile -t OLD_RELEASES < <(
  find "$ROOT/releases" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' |
    sort -rn |
    tail -n +6 |
    cut -d' ' -f2-
)
for old in "${OLD_RELEASES[@]:-}"; do
  [[ -n "$old" ]] || continue
  current_target="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
  previous_target="$(readlink -f "$ROOT/previous" 2>/dev/null || true)"
  if [[ "$old" != "$current_target" && "$old" != "$previous_target" ]]; then
    rm -rf "$old"
  fi
done

echo "deployed $RELEASE_SHA to $DEPLOY_ENV"
