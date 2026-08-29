-- ============================================================================
-- TikTok: token jadi SEPENUHNYA milik server (langkah terakhir 1.2).
--
-- Sampai sekarang `authenticated` punya SELECT/INSERT/UPDATE atas SELURUH
-- tabel, termasuk access_token & refresh_token. RLS membatasi BARIS (hanya
-- milik sendiri) tapi TIDAK membatasi KOLOM — jadi pemilik workspace masih bisa
-- membaca token mentahnya dari browser. Migrasi ini menutupnya secara
-- struktural, bukan sekadar "aplikasi tak memintanya".
--
-- PRASYARAT (harus sudah live sebelum dijalankan):
--   1. Token diambil server (PR #60) — terverifikasi di produksi 2026-08-29
--      lewat Perbarui token, daftar advertiser, dan daftar video ter-otorisasi.
--   2. Penyimpanan koneksi saat OAuth connect juga pindah ke server.
--      Ini WAJIB: upsert versi browser menulis
--        on conflict do update set access_token = excluded.access_token
--      dan referensi `excluded.access_token` itu MEMBACA kolomnya. Terbukti di
--      Postgres bersih: dengan hak baca dicabut, upsert itu gagal
--      "permission denied" → sambung-ulang OAuth mati. Karena itu penyimpanan
--      dipindah ke server lebih dulu (api/_lib/tiktokToken.js).
--
-- Migrasi ini MENGHAPUS kemampuan (kebalikan 0049 yang menambah), jadi urutan
-- deploy-nya juga terbalik: KODE DULU, baru migrasi.
--
-- SESUDAH migrasi, yang masih boleh dilakukan browser:
--   SELECT kolom non-rahasia  → menampilkan status koneksi & advertiser
--   UPDATE advertiser/store   → memilih akun/toko
--   DELETE                    → memutus koneksi
-- INSERT dicabut sepenuhnya: satu-satunya penulis baris koneksi kini server.
-- service_role (worker VPS) TIDAK tersentuh — punya `grant all` terpisah.
--
-- Dibungkus satu transaksi (konvensi 0017): revoke dan grant harus menyala
-- bersama, kalau tidak tabel bisa tertinggal tanpa hak apa pun.
-- ============================================================================
begin;

revoke select, insert, update on public.tiktok_connections from authenticated;

grant select (
  id, workspace_id, advertiser_id, advertiser_name, store_id, store_name,
  client_id, scope, token_type, expires_at, connected_by, created_at, updated_at
) on public.tiktok_connections to authenticated;

-- Hanya pemilihan akun/toko. Kolom token tak termasuk → browser tak bisa
-- menulisnya pun.
grant update (advertiser_id, advertiser_name, store_id, store_name, updated_at)
  on public.tiktok_connections to authenticated;

-- DELETE sengaja dibiarkan: tombol "Putuskan" masih milik user.

commit;
