#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/Translate-agent"
WIDGET_PORT="27182"

echo "Stopping backend and frontend..."
cd "$APP_DIR"
docker compose down

echo "Stopping desktop widget..."
PIDS="$(lsof -tiTCP:"$WIDGET_PORT" -sTCP:LISTEN || true)"
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill
else
  echo "Desktop widget is not running."
fi
