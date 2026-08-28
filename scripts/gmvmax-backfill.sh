#!/bin/zsh
# Backfill N hari terakhir (default 30), satu tanggal per run, terbaru dulu.
# Sequential + unattended. Idempoten per tanggal (aman diulang/dilanjut).
# Pakai: zsh scripts/gmvmax-backfill.sh 30
PROJ=/Users/macbook/claude
REPO="$PROJ/tools/shopee-quadrant"
BLOG="$REPO/logs/gmvmax-backfill.log"
SLOG="$REPO/logs/gmvmax-sync.log"
CLAUDE=/Users/macbook/.local/bin/claude
N=${1:-30}

mkdir -p "$REPO/logs"
cd "$PROJ" || exit 1
echo "===== $(date '+%F %T') BACKFILL $N hari mulai =====" >> "$BLOG"
for i in $(seq 1 "$N"); do
  D=$(date -v-${i}d +%F)
  echo "[$(date '+%F %T')] [$i/$N] $D START" >> "$BLOG"
  GMVMAX_SYNC_DATE=$D "$CLAUDE" -p "$(cat "$REPO/scripts/gmvmax-sync-runbook.md")" \
    --dangerously-skip-permissions >> "$SLOG" 2>&1
  echo "[$(date '+%F %T')] [$i/$N] $D DONE (exit $?)" >> "$BLOG"
done
echo "===== $(date '+%F %T') BACKFILL selesai =====" >> "$BLOG"
