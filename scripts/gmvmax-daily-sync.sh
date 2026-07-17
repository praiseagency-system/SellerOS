#!/bin/zsh
# Worker sinkron harian GMV Max → Supabase (OLD, canonical). Dipanggil launchd/manual.
# HARDENING (2026-07-11): gagal-KERAS, bukan silent-miss.
#   (1) pre-check kesegaran token MCP tt-ads → expired/terlalu dekat = exit non-zero.
#   (2) runbook exit code dijaga → runbook gagal TAK PERNAH jadi wrapper SUCCESS.
#   (3) verifikasi pasca-tulis snapshot target → SUCCESS hanya bila terverifikasi di DB.
# Tak pernah mencetak token. Runbook (LLM) TIDAK diubah. node abs-path (PATH launchd minim).
set -o pipefail
PROJ=/Users/macbook/claude
REPO="$PROJ/tools/shopee-quadrant"
LOG="$REPO/logs/gmvmax-sync.log"
CLAUDE=/Users/macbook/.local/bin/claude
NODE=/usr/local/bin/node

mkdir -p "$REPO/logs"
cd "$PROJ" || exit 1

TARGET="${GMVMAX_SYNC_DATE:-$(date -v-1d +%F)}"      # kemarin waktu lokal (WIB) = tgl runbook
RUN_START_MS=$(( $(date +%s) * 1000 ))

exec >> "$LOG" 2>&1
echo "===== $(date '+%F %T') START gmvmaxsync target=$TARGET ====="

# (1) PRE-CHECK token — gagal-keras bila expired/terlalu dekat (default margin 120m).
if ! "$NODE" "$REPO/scripts/gmvmax-sync-preflight.mjs"; then
  echo "===== $(date '+%F %T') FAILED gmvmaxsync target=$TARGET reason=TOKEN_PREFLIGHT exit=4 ====="
  exit 4
fi

# (2) RUN runbook OLD (tak diubah); TANGKAP exit code segera.
"$CLAUDE" -p "$(cat "$REPO/scripts/gmvmax-sync-runbook.md")" --dangerously-skip-permissions
RUNBOOK_EXIT=$?
echo "----- $(date '+%F %T') runbook exit=$RUNBOOK_EXIT -----"

# (3) VERIFIKASI pasca-tulis — selalu jalan (kumpulkan bukti), meski runbook non-zero.
"$NODE" "$REPO/scripts/gmvmax-sync-verify.mjs" "$TARGET" "$RUN_START_MS"
VERIFY_EXIT=$?

# (4) Keputusan akhir: runbook non-zero TAK PERNAH boleh jadi SUCCESS (verify OK tak menutupi).
if [ "$RUNBOOK_EXIT" -ne 0 ]; then
  echo "===== $(date '+%F %T') FAILED gmvmaxsync target=$TARGET reason=RUNBOOK_EXIT_NONZERO runbook_exit=$RUNBOOK_EXIT verify_exit=$VERIFY_EXIT ====="
  exit 10
fi
if [ "$VERIFY_EXIT" -ne 0 ]; then
  echo "===== $(date '+%F %T') FAILED gmvmaxsync target=$TARGET reason=VERIFY verify_exit=$VERIFY_EXIT ====="
  exit $VERIFY_EXIT
fi
echo "===== $(date '+%F %T') SUCCESS gmvmaxsync target=$TARGET runbook_exit=0 verify=OK ====="
# (5) Sinkron token segar ke VPS shadow — NON-FATAL ke OLD (kegagalan sync tak menggagalkan OLD).
GMVMAX_SYNC_DATE="$TARGET" "$REPO/scripts/gmvmax-token-sync.sh" || echo "----- token-sync exit=$? (NON-FATAL ke OLD) -----"

# (6) Picu shadow VPS SEGERA setelah OLD sukses → parity WAKTU-SAMA (jeda ~menit).
# Ini yang bikin gate sahih: membandingkan shadow vs OLD yang ditulis berjam-jam
# lalu SELALU MISMATCH karena TikTok memperbarui angka retroaktif (drift).
# HANYA untuk run harian normal (TARGET = kemarin); backfill tanggal lain dilewati
# karena unit shadow memakai `--date yesterday`. NON-FATAL ke OLD.
if [ "$TARGET" = "$(date -v-1d +%F)" ]; then
  if ssh -o BatchMode=yes -o ConnectTimeout=15 selleros-vps 'sudo -n systemctl start gmvmax-shadow.service' 2>/dev/null; then
    echo "----- shadow VPS dipicu → parity waktu-sama (target=$TARGET) -----"
  else
    echo "----- trigger shadow GAGAL exit=$? (NON-FATAL ke OLD) -----"
  fi
else
  echo "----- trigger shadow dilewati (backfill target=$TARGET ≠ kemarin) -----"
fi
exit 0
