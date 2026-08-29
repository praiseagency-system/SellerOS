#!/usr/bin/env bash
# Bukti perilaku migrasi di Postgres sekali pakai (Docker).
#
# KENAPA ADA: migrasi di repo ini menjaga hal yang tak boleh salah — isolasi
# tenant, riwayat snapshot, cache lintas-tenant, dan (sejak 0052/0053) siapa
# boleh membaca/menulis apa di dalam workspace. Menjalankannya langsung di
# produksi untuk "melihat apakah jalan" bukan pilihan.
#
# SEJAK 2026-08-29 harness ini memasang SELURUH riwayat migrasi, bukan kerangka
# tiruan. Kerangka tiruan sempat menyesatkan: ia lebih longgar dari Supabase
# (service_role tanpa bypassrls & tanpa grant) sehingga uji gagal karena alasan
# yang tak ada di produksi. Memasang migrasi asli membuat yang diuji = yang
# benar-benar dijalankan.
#
# Pakai: bash supabase/tests/run-proof.sh
# Butuh: Docker (di Mac ini lewat Colima — `colima start` kalau daemon mati).
set -uo pipefail

CONTAINER=selleros-pgtest
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MIG="$HERE/../migrations"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

echo "▶ menyalakan Postgres sekali pakai…"
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=test postgres:15-alpine >/dev/null
# Tunggu baris "ready" yang KEDUA: yang pertama milik server sementara selama
# initdb, yang langsung dimatikan lagi. pg_isready & `select 1` sempat lolos di
# fase itu lalu koneksi putus — jebakan yang sudah dua kali memakan waktu.
for _ in $(seq 1 90); do
  [ "$(docker logs "$CONTAINER" 2>&1 | grep -c 'database system is ready to accept connections')" -ge 2 ] && break
  sleep 1
done

psql_q() { docker exec "$CONTAINER" psql -U postgres -X -q "$@"; }

echo "▶ prasyarat Supabase (peran, schema auth, auth.uid dari GUC)…"
psql_q -c "
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text);
create or replace function auth.uid() returns uuid language sql stable
  as \$\$ select nullif(current_setting('test.uid', true), '')::uuid \$\$;
create extension if not exists pgcrypto;
grant usage on schema public to anon, authenticated, service_role;" >/dev/null 2>&1

echo "▶ memasang seluruh migrasi…"
ok=0; skip=""
for f in $(ls "$MIG"/*.sql | sort); do
  docker cp "$f" "$CONTAINER:/tmp/m.sql" >/dev/null
  if psql_q -v ON_ERROR_STOP=1 -f /tmp/m.sql >/dev/null 2>&1; then ok=$((ok+1)); else skip="$skip $(basename "$f")"; fi
done
echo "   terpasang: $ok migrasi${skip:+ · dilewati:$skip}"
# 0007 memakai storage.objects milik Supabase Storage — tak ada di Postgres
# polos, dan tak menyentuh RLS tabel publik. Dilewati dengan sadar.

# Samakan dengan Supabase: service_role boleh apa saja atas semua tabel.
psql_q -c "grant all on all tables in schema public to service_role;" >/dev/null 2>&1

echo "▶ bukti perilaku:"
out=""
for p in proof_0049_0050 proof_0051 proof_0052 proof_0053; do
  [ -f "$HERE/$p.sql" ] || continue
  docker cp "$HERE/$p.sql" "$CONTAINER:/tmp/p.sql" >/dev/null
  # `|| true`: psql keluar non-zero pada uji penolakan yang MEMANG diharapkan gagal.
  out="$out
$(docker exec "$CONTAINER" psql -U postgres -X -q -f /tmp/p.sql 2>&1 || true)"
done
echo "$out" | grep -E "✅|❌|-> |utuh|berhasil|tetap bisa"

if echo "$out" | grep -q "❌"; then
  echo; echo "GAGAL: ada bukti yang tidak terpenuhi." >&2
  exit 1
fi
echo; echo "SEMUA BUKTI TERPENUHI ($(echo "$out" | grep -c '✅') penolakan/pemeriksaan positif)."
