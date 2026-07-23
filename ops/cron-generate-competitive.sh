#!/usr/bin/env bash
# Trigger competitive season transitions + daily generation via /api/cron/competitive.
# Same CRON_SECRET as casual daily. Safe when competitive is disabled (API returns skipped).
# Install (00:00 Europe/Moscow, after or with casual daily):
#   0 0 * * * TZ=Europe/Moscow /opt/bebebendle/current/ops/cron-generate-competitive.sh >> /opt/bebebendle/shared/logs/competitive-cron.log 2>&1
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
URL="${BASE_URL}/api/cron/competitive"

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) GET $URL"
HTTP_CODE="$(
  curl -sS -o /tmp/bebebendle-competitive-cron-body.$$ -w "%{http_code}" \
    -H "Authorization: Bearer ${CRON_SECRET}" \
    "$URL" || true
)"
BODY="$(cat /tmp/bebebendle-competitive-cron-body.$$ 2>/dev/null || true)"
rm -f /tmp/bebebendle-competitive-cron-body.$$

echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) status=$HTTP_CODE body=$BODY"

# 200 = created / already exists / skipped (disabled or no playable season)
if [[ "$HTTP_CODE" == "200" ]]; then
  exit 0
fi
exit 1
