-- ============================================================================
-- GMV Max — CREATIVE EXPERIMENT TRACKER (Phase 4 / blueprint §16) — PREPARED, NOT APPLIED.
-- Fondasi Skill 7 + outcome learning: mencatat eksperimen kreatif (boost/test/
-- exclusion/dll) + checkpoint H+1/H+3/H+7 vs baseline yang DINYATAKAN.
--
-- ADITIF & aman: 1 tabel baru. TIDAK menyentuh kanonik/provenance/skill outputs.
-- Nomor 0031 (BUKAN 0028-0030) agar tak bentrok dengan branch provenance
-- (fix/gmvmax-canonical-provenance memakai 0028 audit, 0029 versioning, 0030 RPC).
-- Phase 3A memakai 0026/0027. Koordinasi nomor migrasi lintas-branch (blueprint §25.4).
--
-- checkpoints/conclusion NORMALNYA dihitung server (service_role) dari canonical
-- time-series; definisi eksperimen + stop dibuat owner (pola operasional seperti
-- gmvmax_notes). Owner CRUD miliknya sendiri; anon ditolak.
-- NOT APPLIED — jalankan MANUAL di SQL Editor setelah review.
-- ============================================================================

create table if not exists public.gmvmax_experiments (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  store_id            text not null,
  experiment_type     text not null check (experiment_type in
                        ('NEW_CREATIVE_TEST','ACCELERATE_TESTING','MANUAL_BOOST','CREATIVE_EXCLUSION',
                         'CONTENT_ANGLE_TEST','AFFILIATE_TEST','PRODUCT_CREATIVE_TEST','LIVE_CREATIVE_TEST','OTHER_APPROVED')),
  creative_video_id   text,                          -- kreatif yang diuji (nullable utk test level-produk/angle)
  affiliate_id        text,
  product_id          text,
  campaign_id         text,
  treatment           text,                          -- satu variabel utama (blueprint §16.5)
  start_at            timestamptz not null,
  baseline_start      date,                          -- baseline WAJIB dinyatakan; bila null → di-disclose logika
  baseline_end        date,
  status              text not null default 'RUNNING' check (status in ('RUNNING','CONCLUDED','STOPPED')),
  conclusion          text check (conclusion is null or conclusion in
                        ('SUSTAINABLE_WINNER','WINNER_CANDIDATE','TEMPORARY_SPIKE','INCONCLUSIVE','WEAK','STOPPED','DATA_INSUFFICIENT')),
  confidence          text check (confidence is null or confidence in ('HIGH','MEDIUM','LOW','DATA_INSUFFICIENT')),
  stop_condition      text,
  checkpoints         jsonb not null default '[]'::jsonb,   -- [{label:'H+1',date,measured...,delta_vs_baseline}]
  source_snapshot_ids jsonb not null default '[]'::jsonb,
  deterministic_signature text,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint gmvmax_experiments_checkpoints_arr check (jsonb_typeof(checkpoints) = 'array'),
  constraint gmvmax_experiments_src_arr         check (jsonb_typeof(source_snapshot_ids) = 'array')
);

create index if not exists gmvmax_experiments_ws_start_idx
  on public.gmvmax_experiments (workspace_id, store_id, start_at desc);
create index if not exists gmvmax_experiments_creative_idx
  on public.gmvmax_experiments (workspace_id, creative_video_id);
create index if not exists gmvmax_experiments_status_idx
  on public.gmvmax_experiments (workspace_id, status);

-- ── GRANTS: owner CRUD miliknya (record operasional); service_role kelola penuh ─
grant select, insert, update, delete on public.gmvmax_experiments to authenticated;
grant all on public.gmvmax_experiments to service_role;

alter table public.gmvmax_experiments enable row level security;

drop policy if exists gmvmax_experiments_owner_all on public.gmvmax_experiments;
create policy gmvmax_experiments_owner_all on public.gmvmax_experiments
  for all using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_experiments_admin_read on public.gmvmax_experiments;
create policy gmvmax_experiments_admin_read on public.gmvmax_experiments
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- anon tanpa grant → ditolak (RLS default-deny). Tak ada cross-workspace.
