#!/usr/bin/env bash
# STAGE 3.11 — retensi bukti shadow. Hapus HANYA file run/<...>.json lebih tua dari
# RETENTION_DAYS (default 90, minimum 30 dijaga). PRESERVASI index.jsonl (ringkasan
# append-only untuk audit tren/parity 14-hari) & _last_batch.json. Laporkan disk.
# Jalankan via timer terpisah (mingguan) atau cron. Tak menyentuh tabel kanonik.
set -euo pipefail
STATE="${GMVMAX_SHADOW_DIR:-/var/lib/selleros/gmvmax-shadow}"
DAYS="${RETENTION_DAYS:-90}"
if [ "$DAYS" -lt 30 ]; then echo "RETENTION_DAYS<30 ditolak (min 30 untuk gate 14-hari)"; exit 1; fi

RUNS="$STATE/runs"
[ -d "$RUNS" ] || { echo "state dir tak ada: $RUNS"; exit 0; }

echo "== retensi shadow: hapus runs/*.json > ${DAYS} hari (preservasi index.jsonl) =="
before=$(du -sh "$STATE" 2>/dev/null | cut -f1 || echo '?')
deleted=$(find "$RUNS" -type f -name '*.json' -mtime +"$DAYS" -print -delete | wc -l | tr -d ' ')
after=$(du -sh "$STATE" 2>/dev/null | cut -f1 || echo '?')
runcount=$(find "$RUNS" -type f -name '*.json' | wc -l | tr -d ' ')
avg=$(find "$RUNS" -type f -name '*.json' -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
echo "  dihapus: ${deleted} file | tersisa: ${runcount} run | disk: ${before} -> ${after}"
echo "  proyeksi: ~${avg:-0} byte total saat ini; ~1 run/hari → 90 hari ≈ sangat kecil (KB-an)."
