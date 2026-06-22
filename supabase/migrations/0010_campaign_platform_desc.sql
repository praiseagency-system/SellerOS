-- Tambah kolom platform & deskripsi ke tabel campaigns.
-- platform: 'tiktok' | 'shopee' — marketplace campaign ini dijalankan.
-- description: catatan bebas (manfaat campaign, detail potongan, dsb).
-- Jalankan di Supabase → SQL Editor.

alter table public.campaigns
  add column if not exists platform    text not null default 'tiktok',
  add column if not exists description text not null default '';
