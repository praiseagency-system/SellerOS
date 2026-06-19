-- ============================================================================
-- Storage bucket untuk foto produk Kalkulator.
-- Bucket publik (URL foto bisa dibaca siapa saja); tulis/hapus oleh user yang
-- login (authenticated). Foto disimpan di folder per workspace
-- (`{workspace_id}/...`) oleh aplikasi. URL foto disimpan di kolom data jsonb
-- produk (calc_products.data.image). Jalankan di Supabase → SQL Editor.
-- CATATAN: scoping per-folder (storage.foldername) sengaja TIDAK dipakai —
-- di RLS storage sering rapuh & menolak insert yang sah. Untuk internal tool
-- (tim sendiri, baca publik) cukup batasi tulis ke bucket ini bagi authenticated.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

-- Baca publik (foto tampil via URL publik tanpa auth).
drop policy if exists "product_images_public_read" on storage.objects;
create policy "product_images_public_read" on storage.objects
  for select using (bucket_id = 'product-images');

-- Tulis/perbarui/hapus oleh user yang login.
drop policy if exists "product_images_auth_insert" on storage.objects;
create policy "product_images_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'product-images');

drop policy if exists "product_images_auth_update" on storage.objects;
create policy "product_images_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'product-images');

drop policy if exists "product_images_auth_delete" on storage.objects;
create policy "product_images_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'product-images');

-- Bersihkan policy lama berbasis folder bila pernah dijalankan.
drop policy if exists "product_images_owner_insert" on storage.objects;
drop policy if exists "product_images_owner_update" on storage.objects;
drop policy if exists "product_images_owner_delete" on storage.objects;
