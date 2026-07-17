#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Isolate HOME so deploy-release prepends empty ~/.bun/bin, not the real bun.
export HOME="$TMP/home"
mkdir -p "$HOME/.bun/bin" "$HOME/bin" "$HOME/.nvm"
STUBS="$HOME/.bun/bin"
export PATH="$STUBS:$HOME/bin:/usr/bin:/bin"

cat >"$STUBS/bun" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
cat >"$HOME/bin/node" <<'EOF'
#!/usr/bin/env bash
if [[ "${1:-}" == "-p" ]]; then
  echo 20
  exit 0
fi
exit 0
EOF
cat >"$STUBS/uv" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF
# uv is looked up on PATH after bun dir — put in HOME/bin too
cp "$STUBS/uv" "$HOME/bin/uv"
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
if [[ -f "${BEBEBENDLE_TEST_HEALTH_OK:-/tmp/bebe-health-ok}" ]]; then
  exit 0
fi
exit 1
EOF
chmod +x "$STUBS"/* "$HOME/bin"/*

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
printf '%s\n' '{"name":"x","scripts":{"db:migrate":"true"}}' >"$WORK/next/package.json"
mkdir -p "$WORK/next/node_modules/.bin"
printf '%s\n' '#!/usr/bin/env bash' 'exit 0' >"$WORK/next/node_modules/.bin/drizzle-kit"
chmod +x "$WORK/next/node_modules/.bin/drizzle-kit"
echo 'lock' >"$WORK/next/bun.lock"
echo '[project]
name="b"
version="0.1.0"
requires-python=">=3.11"
dependencies=[]' >"$WORK/bot/pyproject.toml"
touch "$WORK/bot/uv.lock"
echo '#!/usr/bin/env bash' >"$WORK/scripts/run-next.sh"
echo '#!/usr/bin/env bash' >"$WORK/scripts/run-bot.sh"
echo 'module.exports={apps:[]}' >"$WORK/ecosystem.config.cjs"
cp "$ROOT/ops/deploy-release.sh" "$WORK/ops/deploy-release.sh"

ARCHIVE_MASTER="$TMP/bebebendle-master.tar.gz"
tar -czf "$ARCHIVE_MASTER" -C "$WORK" .
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA.tar.gz"
(cd "$DEPLOY_ROOT/incoming" && sha256sum "bebebendle-$SHA.tar.gz" >"bebebendle-$SHA.tar.gz.sha256")

rm -f /tmp/bebe-health-ok
(
  sleep 1
  touch /tmp/bebe-health-ok
) &

export BEBEBENDLE_DEPLOY_ROOT="$DEPLOY_ROOT"
export BEBEBENDLE_TEST_HEALTH_OK=/tmp/bebe-health-ok

bash "$ROOT/ops/deploy-release.sh" "$SHA" staging "http://127.0.0.1:3000"

[[ -L "$DEPLOY_ROOT/current" ]] || {
  echo "FAIL: current symlink missing"
  exit 1
}
target="$(readlink -f "$DEPLOY_ROOT/current")"
[[ "$target" == "$DEPLOY_ROOT/releases/$SHA" ]] || {
  echo "FAIL: current points to $target"
  exit 1
}

SHA2="$(python3 - <<'PY'
print("b"*40)
PY
)"
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA2.tar.gz"
echo "0000000000000000000000000000000000000000000000000000000000000000  bebebendle-$SHA2.tar.gz" \
  >"$DEPLOY_ROOT/incoming/bebebendle-$SHA2.tar.gz.sha256"
if bash "$ROOT/ops/deploy-release.sh" "$SHA2" staging "http://127.0.0.1:3000"; then
  echo "FAIL: bad checksum should fail"
  exit 1
fi

mv "$DEPLOY_ROOT/shared/.env" "$DEPLOY_ROOT/shared/.env.bak"
echo "APP_ENV=staging" >"$DEPLOY_ROOT/shared/.env"
SHA3="$(python3 - <<'PY'
print("c"*40)
PY
)"
cp "$ARCHIVE_MASTER" "$DEPLOY_ROOT/incoming/bebebendle-$SHA3.tar.gz"
(cd "$DEPLOY_ROOT/incoming" && sha256sum "bebebendle-$SHA3.tar.gz" >"bebebendle-$SHA3.tar.gz.sha256")
if bash "$ROOT/ops/deploy-release.sh" "$SHA3" staging "http://127.0.0.1:3000"; then
  echo "FAIL: missing env should fail"
  exit 1
fi
mv "$DEPLOY_ROOT/shared/.env.bak" "$DEPLOY_ROOT/shared/.env"

echo "deploy-release tests passed"
