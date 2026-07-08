-- ============================================================================
-- GMV Max — BOOST CENTER (kode boost / spark code untuk video jempolan).
-- Alur: Specialist minta kode boost ke kreator → simpan kode → tim Ads pasang.
-- Satu baris per video dalam pipeline (kunci = workspace + video_id). Status:
--   diminta → ada_kode → terpasang (atau skip). RLS consent-based selaras 0011.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.gmvmax_boost (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  video_id       text not null,
  video_title    text,
  tiktok_account text,
  status         text not null default 'diminta',  -- diminta | ada_kode | terpasang | skip
  boost_code     text,                             -- kode/spark code dari kreator
  note           text,
  roas           numeric,                          -- ROAS saat dimasukkan pipeline (jejak)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, video_id)
);

create index if not exists gmvmax_boost_ws_idx
  on public.gmvmax_boost (workspace_id, updated_at desc);

alter table public.gmvmax_boost enable row level security;

drop policy if exists gmvmax_boost_owner_all on public.gmvmax_boost;
create policy gmvmax_boost_owner_all on public.gmvmax_boost
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_boost_admin_read on public.gmvmax_boost;
create policy gmvmax_boost_admin_read on public.gmvmax_boost
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
