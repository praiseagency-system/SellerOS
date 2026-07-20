-- ============================================================================
-- GMV Max — SYNC RUNS traceability + multi-advertiser lineage (Phase 2B).
-- ADITIF & idempoten: hanya `add column if not exists` pada gmvmax_sync_runs
-- (migrasi 0021/0023). Tak ada DROP/rename. RLS/grant diwarisi.
--
-- Tujuan: telusuri run shadow ke commit/rilis persis, dan catat lineage
-- multi-advertiser (berapa sumber advertiser diharapkan vs berhasil diproses).
-- Tak menyimpan token/secret/payload MCP — hanya metadata & ID advertiser
-- (yang bukan rahasia; disimpan penuh utk audit, redaksi hanya di LOG).
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- ============================================================================

alter table public.gmvmax_sync_runs
  add column if not exists git_sha              text,
  add column if not exists release_id           text,
  add column if not exists bundle_checksum      text,
  add column if not exists connection_group_id  text,
  add column if not exists advertiser_sources_expected  integer,
  add column if not exists advertiser_sources_succeeded integer,
  add column if not exists advertiser_sources_failed    integer,
  add column if not exists advertiser_lineage   jsonb,   -- [{advertiser_id, role, status, pages, rows}]
  add column if not exists merge_summary        jsonb;   -- {duplicates_removed, distinct_rows, combined_totals}
