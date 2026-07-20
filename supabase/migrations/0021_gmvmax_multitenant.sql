-- ============================================================================
-- GMV Max — MULTI-TENANT Fase 0 (additive, aman; tak mengubah jalur produksi).
-- (1) tiktok_connections: tambah store_id/store_name → worker bisa data-driven
--     (ambil store dari koneksi, bukan registry hardcode advertisers.mjs).
--     GMV Max butuh store_id utk filter campaign. Backfill 2 workspace yg ada.
-- (2) gmvmax_sync_runs: audit per-run per-workspace (siapa sukses/gagal + error),
--     dasar halaman "Sync Status" & alert. Append-log (tanpa unique) — 1 hari bisa
--     banyak run (dry-run + commit + retry).
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

-- (1) ── store pada koneksi ────────────────────────────────────────────────
alter table public.tiktok_connections add column if not exists store_id   text;
alter table public.tiktok_connections add column if not exists store_name  text;

-- Backfill 2 workspace terdaftar (id store dari advertisers.mjs; nama best-known).
update public.tiktok_connections
   set store_id = '7495201716088572081', store_name = coalesce(store_name, 'AsterixSty')
 where workspace_id = '10280d7b-2994-4a40-b639-2d88e0e2018b' and store_id is null;
update public.tiktok_connections
   set store_id = '7494949073431268328', store_name = coalesce(store_name, 'Dasfelix Parfum')
 where workspace_id = 'c420074f-d4a6-4e6d-bf8e-2d0234b575d7' and store_id is null;

-- (2) ── audit run ──────────────────────────────────────────────────────────
create table if not exists public.gmvmax_sync_runs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  advertiser_id  text,
  snapshot_date  date not null,
  run_id         text,
  mode           text,                         -- commit | commit-dryrun
  status         text not null,                -- SUCCESS | FAILED | LOCKED | AUTH_BLOCKING | TOKEN_FAILED
  row_count      integer,
  cost           numeric,
  revenue        numeric,
  orders         integer,
  parity         text,                         -- MATCH | MISMATCH | NO_OLD_BASELINE
  import_id      uuid,
  error          text,
  duration_ms    integer,
  run_at         timestamptz not null default now(),
  created_at     timestamptz not null default now()
);

create index if not exists gmvmax_sync_runs_ws_date_idx
  on public.gmvmax_sync_runs (workspace_id, snapshot_date desc, run_at desc);
create index if not exists gmvmax_sync_runs_date_idx
  on public.gmvmax_sync_runs (snapshot_date desc, run_at desc);

alter table public.gmvmax_sync_runs enable row level security;

grant select, insert, update, delete on public.gmvmax_sync_runs to authenticated;
grant all on public.gmvmax_sync_runs to service_role;

-- Pemilik workspace: baca run miliknya (selaras pola gmvmax_* lain).
drop policy if exists gmvmax_sync_runs_owner_all on public.gmvmax_sync_runs;
create policy gmvmax_sync_runs_owner_all on public.gmvmax_sync_runs
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

-- Admin (consent-based) boleh baca semua — dasar halaman "Sync Status".
drop policy if exists gmvmax_sync_runs_admin_read on public.gmvmax_sync_runs;
create policy gmvmax_sync_runs_admin_read on public.gmvmax_sync_runs
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
