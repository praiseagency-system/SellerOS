#!/usr/bin/env bash
# Bukti perilaku migrasi 0049 & 0050 di Postgres sekali pakai (Docker).
#
# KENAPA ADA: kedua migrasi ini menjaga hal yang tak boleh salah — isolasi
# tenant di jalur unggah, riwayat snapshot yang tak boleh hilang, dan cache
# lintas-tenant yang tak boleh dibajak. Menjalankan langsung di produksi untuk
# "melihat apakah jalan" bukan pilihan, jadi dibuktikan di sini dulu.
#
# Pakai: bash supabase/tests/run-proof.sh
# Butuh: Docker (di Mac ini lewat Colima — `colima start` kalau daemon mati).
#
# Kerangka scaffold.sql MENIRU Supabase seperlunya (peran authenticated,
# auth.uid() dari GUC, tabel terkait). Bukan replika penuh: yang diuji adalah
# perilaku policy & fungsi, bukan seluruh skema.
set -euo pipefail

CONTAINER=selleros-pgtest
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "▶ menyalakan Postgres sekali pakai…"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test postgres:15-alpine >/dev/null
for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready >/dev/null 2>&1 && break
  sleep 1
done

run() { docker cp "$1" "$CONTAINER:/tmp/x.sql" >/dev/null; docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -X -q -f /tmp/x.sql; }

echo "▶ kerangka + migrasi…"
run "$HERE/scaffold.sql"
run "$MIG/0030_gmvmax_write_versioned_snapshot.sql"
run "$MIG/0049_gmvmax_browser_upload_rpc.sql"
run "$MIG/0050_gmvmax_video_meta_antipoison.sql"

echo "▶ bukti perilaku:"
docker cp "$HERE/proof_0049_0050.sql" "$CONTAINER:/tmp/p.sql" >/dev/null
out=$(docker exec "$CONTAINER" psql -U postgres -X -q -f /tmp/p.sql 2>&1)
echo "$out" | grep -E "✅|❌|->|="

if echo "$out" | grep -q "❌"; then
  echo; echo "GAGAL: ada bukti yang tidak terpenuhi." >&2
  exit 1
fi
echo; echo "SEMUA BUKTI TERPENUHI."
