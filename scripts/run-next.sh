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
export PATH="${HOME}/.bun/bin:${PATH}"
cd "$ROOT/next"
exec bun run start
