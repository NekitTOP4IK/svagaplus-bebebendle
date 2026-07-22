#!/usr/bin/env bash
# Trigger daily generation via /api/cron/daily.
# Install (00:00 Europe/Moscow):
#   0 0 * * * TZ=Europe/Moscow /opt/bebebendle/current/ops/cron-generate-daily.sh >> /opt/bebebendle/shared/logs/daily-cron.log 2>&1
set -Eeuo pipefail

ROOT="${BEBEBENDLE_DEPLOY_ROOT:-/opt/bebebendle}"
ENV_FILE="${ROOT}/shared/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) missing $ENV_FILE" >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) CRON_SECRET not set" >&2
  exit 1
fi

BASE_URL="${BEBEBENDLE_INTERNAL_URL:-http://127.0.0.1:3000}"
BASE_URL="${BASE_URL%/}"
URL="${BASE_URL}/api/cron/daily"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) GET $URL"
HTTP_CODE="$(
  curl -sS -o /tmp/bebebendle-daily-cron-body.$$ -w "%{http_code}" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "$URL" || true
)"
BODY="$(cat /tmp/bebebendle-daily-cron-body.$$ 2>/dev/null || true)"
rm -f /tmp/bebebendle-daily-cron-body.$$

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) status=$HTTP_CODE body=$BODY"

# 200 = created, 409 path returns 200 with "already exist" from route, 403/400 = config/pool
if [[ "$HTTP_CODE" == "200" ]]; then
  exit 0
fi
exit 1
