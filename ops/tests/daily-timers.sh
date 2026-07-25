#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

require_file() {
  local file=$1
  [[ -f "$file" ]] || {
    echo "FAIL: missing $file" >&2
    exit 1
  }
}

require_line() {
  local expected=$1
  local file=$2
  grep -Fqx "$expected" "$file" || {
    echo "FAIL: expected $expected in $file" >&2
    exit 1
  }
}

for job in daily competitive; do
  timer="$ROOT/ops/systemd/bebebendle-$job.timer"
  service="$ROOT/ops/systemd/bebebendle-$job.service"
  require_file "$timer"
  require_file "$service"
  require_line 'OnCalendar=*-*-* 00:00:00 Europe/Moscow' "$timer"
  require_line 'Persistent=true' "$timer"
  require_line 'User=deploy' "$service"
  require_line 'WorkingDirectory=/opt/bebebendle/current' "$service"
  require_line "ExecStart=/opt/bebebendle/current/ops/cron-generate-$job.sh" "$service"
  require_line "StandardOutput=append:/opt/bebebendle/shared/logs/$job-cron.log" "$service"
  require_line "StandardError=append:/opt/bebebendle/shared/logs/$job-cron.log" "$service"
done

installer="$ROOT/ops/install-daily-timers.sh"
require_file "$installer"

run_install_as_unprivileged() {
  if [[ "$EUID" -ne 0 ]]; then
    bash "$installer" install
    return
  fi

  if command -v runuser >/dev/null 2>&1 && getent passwd nobody >/dev/null 2>&1; then
    runuser -u nobody -- bash "$installer" install
    return
  fi

  if command -v setpriv >/dev/null 2>&1; then
    setpriv --reuid=65534 --regid=65534 --clear-groups bash "$installer" install
    return
  fi

  echo 'SKIP: cannot execute the installer as an unprivileged identity' >&2
  return 77
}

set +e
install_output="$(run_install_as_unprivileged 2>&1)"
install_status=$?
set -e

if [[ "$install_status" -eq 77 ]]; then
  echo "$install_output" >&2
  echo 'daily timer tests passed (non-root guard skipped)'
  exit 0
fi

if [[ "$install_status" -eq 0 ]]; then
  echo "FAIL: non-root install unexpectedly succeeded" >&2
  exit 1
fi

if ! grep -Fq 'install requires root; run: sudo bash /opt/bebebendle/current/ops/install-daily-timers.sh install' <<<"$install_output"; then
  echo 'FAIL: non-root install did not print the root remediation command' >&2
  echo "$install_output" >&2
  exit 1
fi

echo 'daily timer tests passed'
