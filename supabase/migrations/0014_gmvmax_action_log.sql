-- ============================================================================
-- GMV Max — LOG OPTIMASI (jurnal aksi ber-timestamp).
-- gmvmax_notes menyimpan 1 catatan "aktif" per video (ditimpa). Untuk merekam
-- SETIAP tindakan optimasi lintas waktu ("8 Jul naikkan budget", "11 Jul refresh
-- hook"), tabel ini bersifat APPEND — 1 row per aksi. RLS consent-based selaras
-- skema 0001/0011. Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.gmvmax_action_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  video_id      text,                          -- video terkait (boleh null = aksi umum)
  video_title   text,                          -- snapshot judul saat aksi (agar log mandiri)
  tiktok_account text,
  action_tag    text,                          -- Scale | Boost | Refresh | Watch | Kill
  body          text,
  snapshot_date date,                          -- konteks periode saat aksi diambil
  roas          numeric,                       -- ROAS video saat aksi (jejak keputusan)
  created_at    timestamptz not null default now()
);

create index if not exists gmvmax_action_log_ws_idx
  on public.gmvmax_action_log (workspace_id, created_at desc);
create index if not exists gmvmax_action_log_video_idx
  on public.gmvmax_action_log (workspace_id, video_id);

alter table public.gmvmax_action_log enable row level security;

drop policy if exists gmvmax_action_log_owner_all on public.gmvmax_action_log;
create policy gmvmax_action_log_owner_all on public.gmvmax_action_log
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_action_log_admin_read on public.gmvmax_action_log;
create policy gmvmax_action_log_admin_read on public.gmvmax_action_log
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
