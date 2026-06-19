-- ============================================================================
-- Tambah kolom `items` ke campaigns: harga campaign per VARIAN (editable per
-- campaign, default dari Harga Campaign price list). Bentuk tiap item:
--   { productId, varIdx, sku, name, price }
-- `product_ids` lama tetap ada (diisi dari distinct productId items) agar
-- pembacaan lama tidak rusak. Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists items jsonb not null default '[]'::jsonb;
