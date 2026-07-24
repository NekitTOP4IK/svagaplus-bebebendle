#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

export HOME="$TMP/home"
# Mirror prod: bun in ~/.bun/bin, uv in ~/.local/bin (not on default non-login PATH).
mkdir -p "$HOME/.bun/bin" "$HOME/.local/bin" "$HOME/bin" "$HOME/.nvm"
export PATH="/usr/bin:/bin"

cat >"$HOME/.bun/bin/bun" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$HOME/bin/node" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-p" ]]; then echo 20; exit 0; fi
exit 0
EOF
cat >"$HOME/.local/bin/uv" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$HOME/bin/pm2" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$HOME/bin/pg_dump" <<'EOF'
#!/usr/bin/env bash
out=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --file) out=$2; shift 2 ;;
    --file=*) out=${1#--file=}; shift ;;
    *) shift ;;
  esac
done
[[ -n "$out" ]] && : >"$out"
exit 0
EOF
cat >"$HOME/bin/curl" <<'EOF'
#!/usr/bin/env bash
if [[ -f "${BEBEBENDLE_TEST_HEALTH_OK:-/tmp/bebe-health-ok}" ]]; then exit 0; fi
exit 1
EOF
chmod +x "$HOME/.bun/bin"/* "$HOME/.local/bin"/* "$HOME/bin"/*

DEPLOY_ROOT="$TMP/deploy"
mkdir -p "$DEPLOY_ROOT"/{incoming,releases,shared/uploads,shared/logs,backups}
cat >"$DEPLOY_ROOT/shared/.env" <<'EOF'
APP_ENV=staging
SESSION_SECRET=test-session-secret-32chars-minimum!!
DATABASE_URL=postgresql://bebebendle:x@127.0.0.1:5432/bebebendle_staging
REDIS_HOST=127.0.0.1
BOT_TOKEN=000000:TEST
BEBEBENDLE_INTERNAL_SECRET=bot-internal
SVAGAPLUS_INTERNAL_URL=http://127.0.0.1:5016
SVAGAPLUS_INTERNAL_SECRET=svaga-internal
SVAGA_TARGET_USER_ID=f0d5662b-0ca2-4d8b-bde4-5e5897f36549
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=test_bot
UPLOADS_DIR=/opt/bebebendle/shared/uploads
PORT=3000
BOT_HEALTH_PORT=3011
EOF

SHA="$(python3 - <<'PY'
print("a"*40)
PY
)"
WORK="$TMP/src"
mkdir -p "$WORK"/{next,bot/src,scripts,ops}
printf '%s\n' '{"name":"x","scripts":{"build":"true","db:migrate":"true"}}' >"$WORK/next/package.json"
echo 'lock-content-v1' >"$WORK/next/bun.lock"
mkdir -p "$WORK/next/node_modules/.bin"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$WORK/next/node_modules/.bin/drizzle-kit"
chmod +x "$WORK/next/node_modules/.bin/drizzle-kit"
echo '[project]
name="b"
version="0.1.0"
requires-python=">=3.11"
dependencies=[]' >"$WORK/bot/pyproject.toml"
echo 'uv-lock-v1' >"$WORK/bot/uv.lock"
echo '#!/usr/bin/env bash' >"$WORK/scripts/run-next.sh"
echo '#!/usr/bin/env bash' >"$WORK/scripts/run-bot.sh"
echo 'module.exports={apps:[]}' >"$WORK/ecosystem.config.cjs"
cp "$ROOT/ops/deploy-release.sh" "$WORK/ops/deploy-release.sh"

ARCHIVE_MASTER="$TMP/bebebendle-master.tar.gz"
tar -czf "$ARCHIVE_MASTER" -C "$WORK" .
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA.tar.gz"
(cd "$DEPLOY_ROOT/incoming" && sha256sum "bebebendle-$SHA.tar.gz" >"bebebendle-$SHA.tar.gz.sha256")

rm -f /tmp/bebe-health-ok
( sleep 1; touch /tmp/bebe-health-ok ) &

export BEBEBENDLE_DEPLOY_ROOT="$DEPLOY_ROOT"
export BEBEBENDLE_TEST_HEALTH_OK=/tmp/bebe-health-ok
export BEBEBENDLE_KEEP_RELEASES=3

# First deploy creates cold caches
bash "$ROOT/ops/deploy-release.sh" "$SHA" staging "http://127.0.0.1:3000"
[[ -L "$DEPLOY_ROOT/current" ]]
[[ -L "$DEPLOY_ROOT/current/bot/.venv" ]]

# Second deploy same locks should reuse caches (still success)
SHA2="$(python3 - <<'PY'
print("b"*40)
PY
)"
# new archive with same locks
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA2.tar.gz"
(cd "$DEPLOY_ROOT/incoming" && sha256sum "bebebendle-$SHA2.tar.gz" >"bebebendle-$SHA2.tar.gz.sha256")
rm -f /tmp/bebe-health-ok
( sleep 1; touch /tmp/bebe-health-ok ) &
bash "$ROOT/ops/deploy-release.sh" "$SHA2" staging "http://127.0.0.1:3000"

# App-only second deploy: migrations unchanged → no extra pre-migrate dump
DUMP_COUNT="$(find "$DEPLOY_ROOT/backups" -maxdepth 1 -type f -name 'pre-*.dump' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$DUMP_COUNT" -ne 1 ]]; then
  echo "FAIL: expected 1 pre-migrate dump after second (no-mig) deploy, got $DUMP_COUNT"
  exit 1
fi

# Force dump even when migrate skipped
rm -f /tmp/bebe-health-ok
( sleep 1; touch /tmp/bebe-health-ok ) &
SHA2B="$(python3 - <<'PY'
print("d"*40)
PY
)"
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA2B.tar.gz"
(cd "$DEPLOY_ROOT/incoming" && sha256sum "bebebendle-$SHA2B.tar.gz" >"bebebendle-$SHA2B.tar.gz.sha256")
BEBEBENDLE_FORCE_DB_BACKUP=1 bash "$ROOT/ops/deploy-release.sh" "$SHA2B" staging "http://127.0.0.1:3000"
DUMP_COUNT_FORCE="$(find "$DEPLOY_ROOT/backups" -maxdepth 1 -type f -name 'pre-*.dump' 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$DUMP_COUNT_FORCE" -ne 2 ]]; then
  echo "FAIL: expected 2 dumps after BEBEBENDLE_FORCE_DB_BACKUP=1, got $DUMP_COUNT_FORCE"
  exit 1
fi

# Bad checksum
SHA3="$(python3 - <<'PY'
print("c"*40)
PY
)"
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA3.tar.gz"
echo "0000000000000000000000000000000000000000000000000000000000000000  bebebendle-$SHA3.tar.gz" \
  >"$DEPLOY_ROOT/incoming/bebebendle-$SHA3.tar.gz.sha256"
if bash "$ROOT/ops/deploy-release.sh" "$SHA3" staging "http://127.0.0.1:3000"; then
  echo "FAIL: bad checksum should fail"
  exit 1
fi

echo "deploy-release tests passed"
