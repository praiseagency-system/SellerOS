-- ============================================================================
-- GMV Max — ASAL-USUL EKSPERIMEN DARI SESI BOOST (Jembatan 2).
--
-- LATAR: sampai sekarang eksperimen HANYA lahir dari approval yang EXECUTED
-- (kolom source_approval_id, migrasi 0048). Creative Boost yang dikerjakan
-- langsung di Seller Centre tak pernah membuat approval, jadi tak pernah
-- terukur — padahal itu aksi yang paling sering dipakai. Sumber keduanya adalah
-- potret harian gmvmax_boost_sessions (migrasi 0048).
--
-- source_session_id: sesi boost asal eksperimen ini. UNIK → pembuka idempoten,
-- run ulang tidak menggandakan. Sesi yang sama muncul di TIAP potret harian
-- selama ia berjalan, jadi tanpa kunci ini satu boost bisa jadi puluhan baris.
--
-- ADITIF & aman: 1 kolom + 1 index. Tidak menyentuh kanonik.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

alter table public.gmvmax_experiments
  add column if not exists source_session_id text;

create unique index if not exists gmvmax_experiments_source_session_uniq
  on public.gmvmax_experiments (workspace_id, source_session_id)
  where source_session_id is not null;

comment on column public.gmvmax_experiments.source_session_id is
  'session_id sesi boost (gmvmax_boost_sessions) yang memicu eksperimen ini — aksi di luar aplikasi. NULL = berasal dari approval atau dibuat manual.';
