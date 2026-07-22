-- ============================================================================
-- Campaign link — URL halaman campaign di marketplace (mis. halaman detail
-- co-funded voucher di Seller Center) yang wajib dicantumkan sebagai rujukan.
-- Nullable + tanpa default agar campaign lama tetap valid. Jalankan di
-- Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists link text;
