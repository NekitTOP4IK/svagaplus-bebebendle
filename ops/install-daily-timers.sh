#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UNIT_DIR=/etc/systemd/system
UNITS=(
  bebebendle-daily.service
  bebebendle-daily.timer
  bebebendle-competitive.service
  bebebendle-competitive.timer
)

usage() {
  echo "usage: $0 {install|status}" >&2
  exit 2
}

require_systemd() {
  command -v systemctl >/dev/null 2>&1 || {
    echo "systemctl is unavailable; run this command on the systemd host" >&2
    return 1
  }
}

require_root() {
  [[ "${EUID}" -eq 0 ]] || {
    echo "install requires root; run: sudo bash /opt/bebebendle/current/ops/install-daily-timers.sh install" >&2
    exit 1
  }
}

install_units() {
  require_root
  require_systemd

  local unit source
  for unit in "${UNITS[@]}"; do
    source="$ROOT/systemd/$unit"
    [[ -f "$source" ]] || {
      echo "missing unit template: $source" >&2
      exit 1
    }
    systemd-analyze verify "$source"
  done

  install -d -m 0755 "$UNIT_DIR"
  for unit in "${UNITS[@]}"; do
    install -m 0644 "$ROOT/systemd/$unit" "$UNIT_DIR/$unit"
  done
  systemctl daemon-reload
  systemctl enable --now bebebendle-daily.timer bebebendle-competitive.timer
  status_units
}

status_units() {
  require_systemd

  local timer enabled active failed=0
  for timer in bebebendle-daily.timer bebebendle-competitive.timer; do
    enabled=disabled
    active=inactive
    systemctl is-enabled --quiet "$timer" && enabled=enabled || failed=1
    systemctl is-active --quiet "$timer" && active=active || failed=1
    echo "$timer: $enabled, $active"
  done

  if [[ "$failed" -ne 0 ]]; then
    echo "Timers are not both enabled and active. Repair with: sudo bash /opt/bebebendle/current/ops/install-daily-timers.sh install" >&2
    return 1
  fi
}

case "${1:-}" in
  install) install_units ;;
  status) status_units ;;
  *) usage ;;
esac
