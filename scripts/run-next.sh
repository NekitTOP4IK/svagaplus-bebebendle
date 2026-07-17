#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
set -a
# Prefer release-local symlink to shared env; fall back to repo-root .env for local runs.
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
