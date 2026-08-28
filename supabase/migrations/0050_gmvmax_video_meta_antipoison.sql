-- ============================================================================
-- GMV Max — kunci cache global gmvmax_video_meta dari penimpaan sembarangan.
--
-- MASALAH (0012:21-22): policy `for all ... using (true) with check (true)`.
-- Tabel ini SATU-SATUNYA tabel yang dibagi lintas tenant (cache username hasil
-- oEmbed publik). Dengan policy lama, user login mana pun bisa MENIMPA baris
-- mana pun — nama akun yang tampil di dashboard tenant lain bisa diubah orang
-- luar. Bukan kebocoran data privat, tapi tak layak dibiarkan saat produk
-- dibuka ke publik.
--
-- YANG DIUBAH:
--   - UPDATE hanya boleh pada baris yang BELUM berhasil di-resolve
--     (status <> 'ok'). Baris yang sudah 'ok' jadi tak bisa ditimpa.
--     Aman untuk klien: src/contexts/GmvMaxContext.jsx:371 hanya menarik ulang
--     video yang belum ter-cache atau berstatus 'error' — tak pernah menulis
--     ulang baris 'ok'.
--   - INSERT dibatasi pada video_id berbentuk masuk akal (angka), supaya tabel
--     bersama tak bisa dijadikan tempat menumpuk baris sampah.
--   - DELETE tetap tak diberikan ke authenticated (tak ada grant delete).
--
-- SISA RISIKO (disengaja, dicatat supaya tidak terlupa): user login masih bisa
-- MENGISI video yang belum ter-cache dengan nama karangan. Menutup ini menuntut
-- enrichment pindah ke server (kini di browser karena oEmbed mengizinkan CORS)
-- — di luar cakupan Fase 1.
--
-- Idempoten (drop policy if exists). Terapkan di Supabase SQL Editor.
--
-- DIBUNGKUS SATU TRANSAKSI (konvensi yang sama dengan migrasi 0017): migrasi ini
-- MENGHAPUS policy lama sebelum membuat penggantinya. Tanpa BEGIN/COMMIT, gagal
-- di tengah akan meninggalkan tabel TANPA policy tulis sama sekali → enrichment
-- mati diam-diam. All-or-nothing.
-- ============================================================================
begin;

-- Policy lama yang serba-boleh.
drop policy if exists gmvmax_video_meta_rw on public.gmvmax_video_meta;

-- Baca: bebas untuk semua user login (memang data publik & dipakai lintas tenant).
drop policy if exists gmvmax_video_meta_read on public.gmvmax_video_meta;
create policy gmvmax_video_meta_read on public.gmvmax_video_meta
  for select to authenticated using (true);

-- Tambah baris baru: hanya video_id berbentuk angka (ID TikTok = snowflake numerik).
drop policy if exists gmvmax_video_meta_insert on public.gmvmax_video_meta;
create policy gmvmax_video_meta_insert on public.gmvmax_video_meta
  for insert to authenticated
  with check (video_id ~ '^[0-9]{5,25}$');

-- Perbarui: hanya baris yang belum 'ok' (retry lookup gagal). Baris 'ok' beku.
drop policy if exists gmvmax_video_meta_update on public.gmvmax_video_meta;
create policy gmvmax_video_meta_update on public.gmvmax_video_meta
  for update to authenticated
  using (status is distinct from 'ok')
  with check (video_id ~ '^[0-9]{5,25}$');

commit;
