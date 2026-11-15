#!/usr/bin/env bash
# Fresh seeded DB → build → serve → Playwright. Usage: qa/run.sh [playwright args]
set -euo pipefail
cd "$(dirname "$0")/.."
SEEDED="${QA_SEEDED_DB:-/tmp/pb_seeded}"
[ -d "$SEEDED" ] || { echo "seeded DB not found at $SEEDED (seed once, then copy pb_data there)"; exit 1; }

pkill -f "pocketbase serve --http=127.0.0.1:8090" || true
rm -rf /tmp/pb_qa && cp -R "$SEEDED" /tmp/pb_qa
npm run build >/dev/null
TRIP_GATE_CODE="${TRIP_GATE_CODE:-1234}" ./pocketbase serve --http=127.0.0.1:8090 --dir=/tmp/pb_qa --hooksDir=./pb_hooks --migrationsDir=./pb_migrations --publicDir=./pb_public >/tmp/pb_qa.log 2>&1 &
PB_PID=$!
trap 'kill $PB_PID 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do curl -sf http://127.0.0.1:8090/api/health >/dev/null && break; sleep 0.3; done
mkdir -p qa-screens
TRIP_GATE_CODE="${TRIP_GATE_CODE:-1234}" npx playwright test "$@"
