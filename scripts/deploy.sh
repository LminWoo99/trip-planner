#!/usr/bin/env bash
# Run inside the VM: cd /opt/trip-planner && ./scripts/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

LOCK_BEFORE=$(md5sum package-lock.json 2>/dev/null || true)
git pull --ff-only
LOCK_AFTER=$(md5sum package-lock.json 2>/dev/null || true)

if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ] || [ ! -d node_modules ]; then
  echo "package-lock.json 변경 감지 — npm ci 실행"
  npm ci
fi

npm run build            # → pb_public/
# reload the config so new .env values (e.g. OPENAI_*) reach the process; migrations run on start
pm2 startOrRestart ecosystem.config.cjs --update-env
pm2 status trip-planner

sleep 2
if curl -fsS "http://127.0.0.1:${PORT:-8090}/api/health" >/dev/null; then
  echo "OK: trip-planner is healthy"
else
  echo "WARN: health check failed — pm2 logs trip-planner --lines 50" >&2
  exit 1
fi
