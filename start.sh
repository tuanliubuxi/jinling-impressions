#!/bin/sh
set -eu

cd "$(CDPATH= cd -P "$(dirname "$0")" && pwd)"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo '[ERROR] Install Node.js 22.16 or newer with npm, then restart this terminal.' >&2
  exit 1
fi
if ! node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||a===22&&b>=16?0:1)"; then
  echo '[ERROR] Node.js 22.16 or newer is required.' >&2
  exit 1
fi

JINLING_PORT="${JINLING_PORT:-3000}"
export JINLING_PORT
if ! node -e 'const p=process.env.JINLING_PORT;process.exit(/^\d+$/.test(p)&&Number(p)>=1&&Number(p)<=65535?0:1)'; then
  echo '[ERROR] JINLING_PORT must be an integer between 1 and 65535.' >&2
  exit 1
fi

if [ ! -f .env.local ]; then
  cp .env.example .env.local
  echo '[INFO] Created .env.local. Set AI_API_KEY there to enable AI planning.'
fi
if [ ! -f node_modules/.bin/next ]; then
  echo '[INFO] Installing dependencies...'
  npm ci
fi

echo '[INFO] Building the production application...'
npm run build
echo "[INFO] Starting http://localhost:$JINLING_PORT - press Ctrl+C to stop."
exec npm start -- --hostname 0.0.0.0 --port "$JINLING_PORT"
