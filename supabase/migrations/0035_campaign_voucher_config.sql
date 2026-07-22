-- ============================================================================
-- Campaign voucher config — jenis campaign + detail voucher (co-funded).
--   voucher_config jsonb: {
--     kind: 'normal' | 'cofunded',
--     vouchers: [ { discPct, maxDisc, minOrder, sellerPct, sellerCap } ]
--   }
-- 'normal'   → diskon ditanggung platform (sellerPct 0); hanya untuk melihat
--              harga yang diterima customer, margin penjual tak terpengaruh.
-- 'cofunded' → voucher berjenjang, biaya dibagi platform/penjual. Beban penjual
--              per-unit masuk ke perhitungan margin (asumsi cart 1 varian sampai
--              lolos min. pesanan → juga menghasilkan "pcs untuk dapat voucher").
-- Kolom nullable + default '{}' agar campaign lama tetap valid (dianggap normal
-- tanpa voucher). Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists voucher_config jsonb not null default '{}'::jsonb;
