#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
if [[ -f "$ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/.env"
elif [[ -f "$ROOT/shared/.env" ]]; then
  # shellcheck disable=SC1091
  source "$ROOT/shared/.env"
fi
set +a
# PM2 non-login shells often lack login PATH; prefer user-local bun.
export PATH="${HOME}/.bun/bin:/home/deploy/.bun/bin:${HOME}/.local/bin:/usr/local/bin:${PATH}"
cd "$ROOT/next"
BUN_BIN="$(command -v bun 2>/dev/null || true)"
if [[ -z "$BUN_BIN" ]]; then
  for candidate in "${HOME}/.bun/bin/bun" /home/deploy/.bun/bin/bun /usr/local/bin/bun; do
    if [[ -x "$candidate" ]]; then
      BUN_BIN="$candidate"
      break
    fi
  done
fi
if [[ -z "$BUN_BIN" ]]; then
  echo "bun not found (install for the PM2 user: curl -fsSL https://bun.sh/install | bash)" >&2
  exit 127
fi
exec "$BUN_BIN" run start
