#!/usr/bin/env bash
# One-time setup of a fresh Ubuntu arm64 OrbStack VM.
#   orb shell -m <vm>      # then, inside the VM:
#   curl -fsSL https://raw.githubusercontent.com/LminWoo99/trip-planner/main/scripts/setup-vm.sh | bash
# or copy this file in and run it. Safe to re-run.
set -euo pipefail

REPO="${REPO:-https://github.com/LminWoo99/trip-planner.git}"
APP_DIR="${APP_DIR:-/opt/trip-planner}"
BRANCH="${BRANCH:-main}"

echo "== packages"
sudo apt-get update -y
sudo apt-get install -y git curl unzip sqlite3 ca-certificates cron

if ! command -v node >/dev/null; then
  echo "== Node LTS"
  curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v

if ! command -v pm2 >/dev/null; then
  echo "== pm2"
  sudo npm install -g pm2
fi

echo "== repo → $APP_DIR"
sudo mkdir -p "$APP_DIR" /opt/trip-planner-backups
sudo chown -R "$USER":"$USER" "$APP_DIR" /opt/trip-planner-backups
if [ ! -d "$APP_DIR/.git" ]; then
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

echo "== PocketBase (linux arm64)"
./scripts/get-pocketbase.sh

echo "== build"
npm ci
npm run build

if [ ! -f .env ]; then
  read -r -p "입장 코드(MMDD 4자리): " CODE </dev/tty
  printf 'TRIP_GATE_CODE=%s\nPB_HTTP=0.0.0.0:8090\n' "$CODE" > .env
  chmod 600 .env
fi

echo "== pm2"
pm2 start ecosystem.config.cjs || pm2 restart trip-planner
pm2 save
# register pm2 to start on boot (prints and runs the systemd command)
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$USER" --hp "$HOME" >/dev/null
pm2 save

echo "== daily backup cron (04:00)"
MAC_HOME_GUESS="$(ls -d /Users/* 2>/dev/null | head -1 || true)"
CRON_LINE="0 4 * * * BACKUP_MAC_DIR=${MAC_HOME_GUESS:+$MAC_HOME_GUESS/trip-planner-backups} $APP_DIR/scripts/backup.sh >> /opt/trip-planner-backups/backup.log 2>&1"
( crontab -l 2>/dev/null | grep -v "scripts/backup.sh" ; echo "$CRON_LINE" ) | crontab -
crontab -l | grep backup.sh

echo
echo "done. next (first deploy only):"
echo "  1) ./pocketbase superuser upsert <email> <password> --dir=./pb_data"
echo "  2) seed import — README 참고"
