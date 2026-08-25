-- ============================================================================
-- GMV Max EXECUTE LAYER — Fase E0: antrean approval + setelan eksekusi.
-- Cetak biru: docs/gmvmax-skills/94_EXECUTION_AND_APPROVAL_BOUNDARIES.md.
-- E0 TIDAK memanggil endpoint tulis TikTok — tabel ini hanya antrean niat
-- (before→after + bukti) dan saklar pengaman. Eksekusi nyata = Fase E1+.
-- APPEND-heavy: baris approval tak pernah di-reuse; keputusan/eksekusi mengisi
-- kolomnya sendiri. RLS owner-all + admin read (pola 0014 action_log).
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.gmvmax_approvals (
  id               uuid primary key default gen_random_uuid(),
  workspace_id     uuid not null references public.workspaces (id) on delete cascade,
  action_type      text not null check (action_type in
                     ('TEST','SPARK_BIND','SPARK_UNBIND','BUDGET_UPDATE','ROI_UPDATE',
                      'STATUS_UPDATE','CREATIVE_EXCLUDE','SESSION_CREATE','SESSION_DELETE')),
  -- Sasaran aksi: {campaign_id?, campaign_name?, video_id?, video_title?, codes?[], advertiser_id?}
  target           jsonb,
  current_value    jsonb,                     -- nilai SEBELUM (wajib tampil di kartu)
  proposed_value   jsonb,                     -- nilai SESUDAH yang diusulkan
  reason           text,                      -- "kenapa" — dari skill/operator
  evidence         jsonb,                     -- angka pendukung {roas_7d?, rec_budget?, ...}
  source           text not null default 'MANUAL'
                     check (source in ('MANUAL','SKILL','SPARK_CENTER','AI_INSIGHT')),
  risk             text not null default 'LOW' check (risk in ('LOW','MEDIUM','HIGH')),
  status           text not null default 'PENDING'
                     check (status in ('PENDING','APPROVED','REJECTED','EXPIRED','EXECUTED','FAILED')),
  requested_by     uuid,                      -- auth.uid pembuat
  decided_by       uuid,
  decided_at       timestamptz,
  executed_at      timestamptz,
  execution_result jsonb,                     -- hasil read-back verifikasi (E1+)
  expires_at       timestamptz not null default (now() + interval '24 hours'),
  created_at       timestamptz not null default now()
);

create index if not exists gmvmax_approvals_ws_status_idx
  on public.gmvmax_approvals (workspace_id, status, created_at desc);
create index if not exists gmvmax_approvals_ws_idx
  on public.gmvmax_approvals (workspace_id, created_at desc);

alter table public.gmvmax_approvals enable row level security;

-- GRANT WAJIB: policy RLS tidak memberi privilege (pelajaran migrasi 0019 —
-- tanpa grant, klien authenticated kena "permission denied for table").
grant select, insert, update, delete on public.gmvmax_approvals to authenticated;
grant all on public.gmvmax_approvals to service_role;

drop policy if exists gmvmax_approvals_owner_all on public.gmvmax_approvals;
create policy gmvmax_approvals_owner_all on public.gmvmax_approvals
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_approvals_admin_read on public.gmvmax_approvals;
create policy gmvmax_approvals_admin_read on public.gmvmax_approvals
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- PERBAIKAN LAMA: gmvmax_action_log (migrasi 0014) tak pernah diberi GRANT →
-- semua insert dari browser ditolak diam-diam (jurnal kosong sejak dibuat).
-- Log otomatis approval menulis ke tabel ini, jadi grant-nya wajib.
grant select, insert, update, delete on public.gmvmax_action_log to authenticated;
grant all on public.gmvmax_action_log to service_role;

-- ── Setelan eksekusi per workspace: kill switch + bounds + cooldown ─────────
-- enabled=false = KILL SWITCH: semua jalur eksekusi (UI & proxy) wajib menolak.
create table if not exists public.gmvmax_execution_settings (
  workspace_id            uuid primary key references public.workspaces (id) on delete cascade,
  enabled                 boolean not null default true,
  max_budget_increase_pct integer not null default 50  check (max_budget_increase_pct between 0 and 500),
  cooldown_minutes        integer not null default 360 check (cooldown_minutes between 0 and 10080),
  approval_ttl_hours      integer not null default 24  check (approval_ttl_hours between 1 and 168),
  updated_at              timestamptz not null default now()
);

alter table public.gmvmax_execution_settings enable row level security;

grant select, insert, update, delete on public.gmvmax_execution_settings to authenticated;
grant all on public.gmvmax_execution_settings to service_role;

drop policy if exists gmvmax_exec_settings_owner_all on public.gmvmax_execution_settings;
create policy gmvmax_exec_settings_owner_all on public.gmvmax_execution_settings
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_exec_settings_admin_read on public.gmvmax_execution_settings;
create policy gmvmax_exec_settings_admin_read on public.gmvmax_execution_settings
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
