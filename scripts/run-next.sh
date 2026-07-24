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

# PM2 is a non-login shell: load nvm/Node 20 and user-local bun explicitly.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ ! -s "${NVM_DIR}/nvm.sh" && -s /home/deploy/.nvm/nvm.sh ]]; then
  NVM_DIR=/home/deploy/.nvm
fi
if [[ -s "${NVM_DIR}/nvm.sh" ]]; then
  # shellcheck disable=SC1091
  . "${NVM_DIR}/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || nvm use default >/dev/null 2>&1 || true
fi

export PATH="${HOME}/.bun/bin:/home/deploy/.bun/bin:${HOME}/.local/bin:/usr/local/bin:${PATH}"

# Prefer Node 20 binaries ahead of distro Node 18 if nvm put them on PATH.
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]" 2>/dev/null || echo 0)"
  if [[ "${NODE_MAJOR}" -lt 20 ]]; then
    echo "Node.js >= 20.9 required for Next (found $(node -v 2>/dev/null || echo none)). Install nvm node 20 for the PM2 user." >&2
    exit 1
  fi
fi

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
