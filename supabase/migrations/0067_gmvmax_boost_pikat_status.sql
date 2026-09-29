-- ============================================================================
-- Pipeline boost: status permintaan di Pikat per video (30 Sep 2026).
--
-- Setelah "Minta kode", Pikat membalas nasib tiap video: ditagih ke kreator,
-- sudah berkode, sudah terikat, kodenya ditolak (ditagih ulang), atau BUKAN kreator
-- Pikat (harus diminta manual). Tanpa kolom ini tim Ads tak bisa membedakan
-- "sedang ditagih Pikat" dari "tak akan pernah ditagih".
-- Ditulis server (service_role) saat action 'harvest'; browser cukup membaca —
-- GRANT tabel dari 0066 sudah mencakup kolom baru. Idempoten.
-- ============================================================================
alter table public.gmvmax_boost
  add column if not exists pikat_status     text,        -- bukan_pikat | berkode | ditagih | terikat | ditagih_ulang | lain
  add column if not exists pikat_kreator    text,        -- username kreator di Pikat (bila ada)
  add column if not exists pikat_checked_at timestamptz;
