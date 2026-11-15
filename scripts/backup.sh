#!/usr/bin/env bash
# Daily pb_data snapshot (cron, 04:00). Keeps the last 7 in the VM and copies each one to the Mac,
# so a lost VM doesn't lose the trip. OrbStack mounts the Mac home at the same path inside the VM.
set -euo pipefail
cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/opt/trip-planner-backups}"
MAC_DIR="${BACKUP_MAC_DIR:-}"   # e.g. /Users/minu/trip-planner-backups
KEEP="${KEEP:-7}"
STAMP="$(date +%Y%m%d-%H%M)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mkdir -p "$BACKUP_DIR" "$TMP/pb_data"
# online-safe copies (the server keeps running)
for db in data.db auxiliary.db; do
  [ -f "pb_data/$db" ] && sqlite3 "pb_data/$db" ".backup '$TMP/pb_data/$db'"
done
[ -d pb_data/storage ] && cp -a pb_data/storage "$TMP/pb_data/"

OUT="$BACKUP_DIR/pb_data-$STAMP.tar.gz"
tar -czf "$OUT" -C "$TMP" pb_data
ls -1t "$BACKUP_DIR"/pb_data-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f

if [ -n "$MAC_DIR" ]; then
  mkdir -p "$MAC_DIR"
  cp "$OUT" "$MAC_DIR/"
  ls -1t "$MAC_DIR"/pb_data-*.tar.gz | tail -n +$((KEEP + 1)) | xargs -r rm -f
fi

ITEMS=$(sqlite3 "$TMP/pb_data/data.db" "select count(*) from items")
echo "$(date '+%F %T') backup ok: $OUT (items=$ITEMS)"
