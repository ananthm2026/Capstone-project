#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/react-frontend"
WIDGET_DIR="$ROOT_DIR/desktop-widget"
LOG_DIR="$ROOT_DIR/.run-logs"

BACKEND_LOG="$LOG_DIR/backend.log"
FRONTEND_LOG="$LOG_DIR/frontend.log"
WIDGET_LOG="$LOG_DIR/widget.log"

BACKEND_PID_FILE="$LOG_DIR/backend.pid"
FRONTEND_PID_FILE="$LOG_DIR/frontend.pid"
WIDGET_PID_FILE="$LOG_DIR/widget.pid"

mkdir -p "$LOG_DIR"

is_pid_running() {
  local pid_file="$1"
  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(cat "$pid_file" 2>/dev/null || true)"
    if [[ -n "${pid:-}" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

start_backend() {
  if is_pid_running "$BACKEND_PID_FILE"; then
    echo "Backend already running (pid $(cat "$BACKEND_PID_FILE"))."
    return
  fi

  echo "Starting backend on http://127.0.0.1:8000 ..."
  (
    cd "$BACKEND_DIR"
    source venv/bin/activate
    nohup uvicorn main:app --reload --port 8000 > "$BACKEND_LOG" 2>&1 &
    echo $! > "$BACKEND_PID_FILE"
  )
}

start_frontend() {
  if is_pid_running "$FRONTEND_PID_FILE"; then
    echo "Frontend already running (pid $(cat "$FRONTEND_PID_FILE"))."
    return
  fi

  echo "Starting frontend on http://localhost:5173 ..."
  (
    cd "$FRONTEND_DIR"
    nohup npm run dev > "$FRONTEND_LOG" 2>&1 &
    echo $! > "$FRONTEND_PID_FILE"
  )
}

start_widget() {
  if is_pid_running "$WIDGET_PID_FILE"; then
    echo "Desktop widget already running (pid $(cat "$WIDGET_PID_FILE"))."
    return
  fi

  echo "Starting desktop widget on http://127.0.0.1:27182 ..."
  (
    cd "$WIDGET_DIR"
    nohup npm start > "$WIDGET_LOG" 2>&1 &
    echo $! > "$WIDGET_PID_FILE"
  )
}

start_backend
start_frontend
start_widget

echo
echo "All services launched."
echo "Frontend: http://localhost:5173"
echo "Backend:  http://127.0.0.1:8000"
echo "Widget:   http://127.0.0.1:27182"
echo
echo "Logs:"
echo "  $BACKEND_LOG"
echo "  $FRONTEND_LOG"
echo "  $WIDGET_LOG"
