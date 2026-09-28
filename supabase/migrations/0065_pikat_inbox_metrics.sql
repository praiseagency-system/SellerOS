-- ============================================================================
-- Kode dari Pikat — metrik per video (28 Sep 2026).
--
-- Kotak "Kode dari Pikat" kini bisa diikat per video dan diurutkan dari GMV
-- organik tertinggi, jadi feed Pikat ikut membawa engagement & GMV afiliasi.
-- Ditulis server saat tarikan (service_role); browser cukup membaca — hak
-- SELECT tabel (0064) sudah mencakup kolom baru.
--
-- Aman dijalankan sebelum/sesudah kode baru: server mencoba ulang tanpa kolom
-- ini bila belum ada, jadi urutannya bebas.
-- ============================================================================
alter table public.pikat_spark_inbox
  add column if not exists likes       bigint,
  add column if not exists comments    bigint,
  add column if not exists shares      bigint,
  add column if not exists gmv_organic numeric;
