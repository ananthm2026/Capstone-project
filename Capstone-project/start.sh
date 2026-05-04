#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/Translate-agent"
WIDGET_DIR="$ROOT_DIR/desktop-widget"
WIDGET_PORT="27182"
LOG_DIR="$ROOT_DIR/.run-logs"

mkdir -p "$LOG_DIR"

echo "Starting backend and frontend with Docker Compose..."
cd "$APP_DIR"
docker compose up -d --build

echo "Checking desktop widget..."
if lsof -iTCP:"$WIDGET_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Desktop widget is already running on port $WIDGET_PORT."
else
  echo "Launching desktop widget..."
  cd "$WIDGET_DIR"
  nohup npm start > "$LOG_DIR/widget.log" 2>&1 &
  sleep 3
fi

echo "Enabling desktop widget bubble..."
node -e "fetch('http://127.0.0.1:$WIDGET_PORT/enable').then(r=>r.text()).then(console.log).catch(()=>process.exit(1))"

echo
echo "App URLs:"
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:8000/docs"
echo
echo "Widget:"
echo "  Control server: http://127.0.0.1:$WIDGET_PORT"
echo "  Shortcut: Cmd+Shift+Space"
