-- ============================================================================
-- Fase 2.1 — PROFIL & BRAND PINDAH DARI localStorage KE DATABASE.
--
-- Sampai sekarang nama/telepon/foto profil dan nama/logo brand hanya ada di
-- localStorage PER-PERANGKAT (src/data/localIdentity.js). Selama satu workspace
-- dimiliki satu orang, itu tak terasa bedanya.
--
-- Sejak keanggotaan jadi nyata (0052/0053/0055) bedanya menjadi nyata juga:
-- anggota yang diundang masuk dan melihat workspace TANPA nama brand dan TANPA
-- logo, karena semuanya hanya ada di browser si pengundang. Kolom di bawah yang
-- menutup itu.
--
-- GAMBAR DISIMPAN SEBAGAI data URL (text), bukan Supabase Storage. Alasannya:
-- klien sudah menyusutkan gambar ke 256px JPEG (~20-40 KB) sebelum disimpan,
-- jadi ukurannya wajar untuk satu kolom; sementara Storage menambah bucket,
-- policy sendiri, dan URL bertanda tangan yang kedaluwarsa. Kalau nanti perlu
-- gambar besar, tinggal pindah — pembacanya cuma satu tempat.
-- Konsekuensinya SATU: jangan pernah `select *` pada profiles/workspaces di
-- jalur panas; ambil kolom gambar hanya saat memang ditampilkan.
--
-- Aditif murni: tak ada kolom/po­licy yang diubah, jadi tak ada yang bisa rusak.
-- ============================================================================
begin;

alter table public.profiles
  add column if not exists full_name  text,
  add column if not exists phone      text,
  add column if not exists avatar_url text;

alter table public.workspaces
  add column if not exists brand_name text,
  add column if not exists brand_logo text;

-- profiles: user hanya boleh mengubah barisnya sendiri. Policy
-- `profiles_update` (0001) sudah `id = auth.uid()`, jadi kolom baru otomatis
-- ikut terlindungi. Trigger `profiles_guard_update` juga sudah mencegah user
-- menaikkan role/mengubah id & email — kolom baru tak menyentuh itu.

-- workspaces: brand adalah identitas workspace, jadi ikut aturan yang sama
-- dengan mengubah workspace — hanya owner (policy `ws_owner_modify` dari 0053).
-- Anggota tetap BISA MEMBACA-nya lewat `ws_member_read`, dan itu memang inti
-- perbaikan ini: brand akhirnya terlihat oleh seluruh anggota.

commit;
