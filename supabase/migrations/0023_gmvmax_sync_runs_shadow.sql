-- ============================================================================
-- GMV Max — SYNC RUNS: kolom observability untuk MULTI-TENANT SHADOW (Phase 2).
-- ADITIF & aman: hanya `add column if not exists` pada tabel existing
-- `gmvmax_sync_runs` (migrasi 0021). Tak ada DROP/rename/perubahan tipe.
-- Tak mengubah RLS/grant (diwarisi dari 0021). Idempoten (rerun aman).
--
-- Konteks: worker shadow multi-tenant (mode='SHADOW') mencatat hasil per-tenant.
-- `recordShadowRun()` menulis kolom-kolom ini bila ADA; bila migrasi ini BELUM
-- di-apply, writer otomatis fallback ke kolom dasar 0021 (tak error).
--
-- BELUM WAJIB di-apply untuk Phase 2 PREP (shadow off-by-default). Apply hanya
-- bila ingin audit shadow yang kaya. Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

alter table public.gmvmax_sync_runs
  add column if not exists eligibility_status  text,
  add column if not exists campaigns_found     integer,
  add column if not exists campaigns_processed integer,
  add column if not exists creative_rows       integer,
  add column if not exists live_rows           integer,
  add column if not exists product_rows        integer,
  add column if not exists registry_rows       integer,
  add column if not exists pages_fetched       integer,
  add column if not exists warnings            integer,
  add column if not exists error_code          text,
  add column if not exists provider            text,
  add column if not exists worker_version      text,
  add column if not exists started_at          timestamptz,
  add column if not exists completed_at        timestamptz,
  add column if not exists details             jsonb;

-- Index bantu untuk halaman "Sync Status" (filter mode shadow + terbaru).
create index if not exists gmvmax_sync_runs_mode_idx
  on public.gmvmax_sync_runs (mode, snapshot_date desc, run_at desc);
