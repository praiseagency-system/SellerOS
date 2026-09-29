-- ============================================================================
-- Pipeline Boost Center (gmvmax_boost) tak bisa ditulis browser di produksi.
--
-- Tombol "Minta kode" gagal dengan:
--   permission denied for table gmvmax_boost (42501)
-- Tabel ini (0015) tak pernah memberi GRANT eksplisit dan di produksi ternyata
-- tak mendapat default privileges Supabase — jadi RLS-nya (0053: anggota baca,
-- owner/editor tulis) tak pernah sempat dievaluasi; semua penulisan ditolak di
-- tingkat hak tabel. Sejak itu pipeline boost selalu kosong.
--
-- GRANT di bawah hanya membuka hak TABEL; siapa boleh baca/tulis baris tetap
-- ditentukan policy 0053 (is_ws_member / can_ws_write). Idempoten.
-- ============================================================================
grant select, insert, update, delete on public.gmvmax_boost to authenticated;
grant all on public.gmvmax_boost to service_role;
