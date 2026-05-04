#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/.run-logs"

stop_from_pidfile() {
  local name="$1"
  local pid_file="$2"

  if [[ ! -f "$pid_file" ]]; then
    echo "$name is not running."
    return
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
    kill "$pid" >/dev/null 2>&1 || true
    echo "Stopped $name (pid $pid)."
  else
    echo "$name was not running."
  fi

  rm -f "$pid_file"
}

stop_from_pidfile "backend" "$LOG_DIR/backend.pid"
stop_from_pidfile "frontend" "$LOG_DIR/frontend.pid"
stop_from_pidfile "widget" "$LOG_DIR/widget.pid"
