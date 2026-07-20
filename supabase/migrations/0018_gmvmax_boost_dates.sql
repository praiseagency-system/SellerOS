-- ============================================================================
-- GMV Max — BOOST CENTER berjangka. Tambah tanggal MULAI & BERAKHIR boost ke
-- pipeline (gmvmax_boost) agar bisa: (a) tandai "sedang/pernah di-boost",
-- (b) status Berlangsung vs Selesai, (c) hitung performa sejak boost mulai.
--   boost_start = tanggal boost/iklan mulai tayang (di-set tim Ads).
--   boost_end   = tanggal boost berhenti (kosong = masih berlangsung).
-- Additive & idempoten. UI defensif bila migrasi belum dijalankan.
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.gmvmax_boost
  add column if not exists boost_start date,
  add column if not exists boost_end   date;
