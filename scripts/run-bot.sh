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
cd "$ROOT/bot"
if [[ -x "$ROOT/bot/.venv/bin/python" ]]; then
  exec "$ROOT/bot/.venv/bin/python" src/main.py
fi
exec uv run python src/main.py
