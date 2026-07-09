#!/bin/zsh
# Worker sinkron harian GMV Max → Supabase. Dipanggil launchd (atau manual).
# Menjalankan Claude Code headless dari project-scope MCP (/Users/macbook/claude)
# agar server `tiktok-ads` termuat; Claude Code yang mengurus token MCP.
set -o pipefail
PROJ=/Users/macbook/claude
REPO="$PROJ/tools/shopee-quadrant"
LOG="$REPO/logs/gmvmax-sync.log"
CLAUDE=/Users/macbook/.local/bin/claude

mkdir -p "$REPO/logs"
cd "$PROJ" || exit 1
{
  echo "===== $(date '+%F %T') mulai sinkron GMV Max ====="
  "$CLAUDE" -p "$(cat "$REPO/scripts/gmvmax-sync-runbook.md")" \
    --dangerously-skip-permissions
  echo "===== $(date '+%F %T') selesai (exit $?) ====="
} >> "$LOG" 2>&1
