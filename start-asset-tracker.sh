#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed. Install Node.js 18+ and run this launcher again."
  read -r -p "Press Enter to exit..."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies (first run only)..."
  npm install
fi

PORT="${PORT:-3000}"

if command -v xdg-open >/dev/null 2>&1; then
  (
    sleep 2
    xdg-open "http://localhost:${PORT}" >/dev/null 2>&1 || true
  ) &
fi

echo "Starting Asset Tracker at http://localhost:${PORT}"
exec npm start
