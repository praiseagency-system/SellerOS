-- ============================================================================
-- Modul GMV Max Ads — pelacakan performa iklan TikTok Shop GMV Max per video.
-- Meniru pola periods/products: tiap upload = 1 row `gmvmax_imports`; tiap baris
-- export (video/product card) = 1 row `gmvmax_creatives` (CASCADE). Ditambah
-- `gmvmax_notes` (Note/Log per video, lintas periode) & `gmvmax_settings`
-- (threshold ROAS per workspace). RLS consent-based selaras skema 0001.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

-- ─── TABEL ──────────────────────────────────────────────────────────────────

-- Satu import = satu file export untuk satu periode (mis. Juni 2026).
create table if not exists public.gmvmax_imports (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  name           text not null,                 -- label periode, mis. "Jun 2026"
  period_month   date,                          -- bulan periode (tgl 1)
  start_date     date,
  end_date       date,
  currency       text default 'IDR',
  source_filename text,
  totals         jsonb,                         -- ringkas: {cost, revenue, orders, roas}
  settings       jsonb,                         -- snapshot threshold saat import
  created_at     timestamptz not null default now()
);

-- Satu baris kreatif dari export (26 kolom ternormalisasi + raw_data utuh).
create table if not exists public.gmvmax_creatives (
  id             uuid primary key default gen_random_uuid(),
  import_id      uuid not null references public.gmvmax_imports (id) on delete cascade,
  video_id       text,                          -- 'N/A' untuk Product card
  campaign_name  text,
  campaign_id    text,
  product_id     text,
  creative_type  text,                          -- 'Video' | 'Product card'
  video_title    text,
  tiktok_account text,
  time_posted    timestamptz,
  status         text,                          -- Delivering, Not active, dst.
  auth_type      text,
  cost           numeric,
  sku_orders     numeric,
  cost_per_order numeric,
  gross_revenue  numeric,
  roas           numeric,
  impressions    numeric,
  clicks         numeric,
  ctr            numeric,
  cvr            numeric,
  vr_2s          numeric,
  vr_6s          numeric,
  vr_25          numeric,
  vr_50          numeric,
  vr_75          numeric,
  vr_100         numeric,
  hook_tag       text,                          -- diturunkan dari judul video
  raw_data       jsonb,
  created_at     timestamptz not null default now()
);

-- Catatan/aksi per video, hidup lintas periode (kunci = workspace + video_id).
create table if not exists public.gmvmax_notes (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  video_id     text not null,
  body         text,
  action_tag   text,                            -- Scale | Boost | Refresh | Kill | Watch
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Threshold ROAS per workspace (1 row/workspace).
create table if not exists public.gmvmax_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  roas_good    numeric not null default 6,      -- >= good  → Bagus (Tinggi)
  roas_bad     numeric not null default 4,      -- <  bad   → Buruk (Rendah)
  roas_great   numeric not null default 8,      -- >= great → Sangat Bagus
  spend_floor  numeric not null default 50000,  -- lantai spend agar ROAS tak "artefak"
  updated_at   timestamptz not null default now()
);

create index if not exists idx_gmvmax_imports_workspace on public.gmvmax_imports (workspace_id);
create index if not exists idx_gmvmax_creatives_import   on public.gmvmax_creatives (import_id);
create index if not exists idx_gmvmax_creatives_video    on public.gmvmax_creatives (video_id);
create index if not exists idx_gmvmax_notes_workspace    on public.gmvmax_notes (workspace_id, video_id);

-- ─── GRANTS ──────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.gmvmax_imports   to authenticated;
grant select, insert, update, delete on public.gmvmax_creatives to authenticated;
grant select, insert, update, delete on public.gmvmax_notes     to authenticated;
grant select, insert, update, delete on public.gmvmax_settings  to authenticated;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table public.gmvmax_imports   enable row level security;
alter table public.gmvmax_creatives enable row level security;
alter table public.gmvmax_notes     enable row level security;
alter table public.gmvmax_settings  enable row level security;

-- gmvmax_imports ------------------------------------------------------------
drop policy if exists gmvmax_imports_owner_all on public.gmvmax_imports;
create policy gmvmax_imports_owner_all on public.gmvmax_imports
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_imports_admin_read on public.gmvmax_imports;
create policy gmvmax_imports_admin_read on public.gmvmax_imports
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- gmvmax_creatives ----------------------------------------------------------
drop policy if exists gmvmax_creatives_owner_all on public.gmvmax_creatives;
create policy gmvmax_creatives_owner_all on public.gmvmax_creatives
  for all using (
    exists (
      select 1 from public.gmvmax_imports i
      join public.workspaces w on w.id = i.workspace_id
      where i.id = import_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.gmvmax_imports i
      join public.workspaces w on w.id = i.workspace_id
      where i.id = import_id and w.user_id = auth.uid()
    )
  );

drop policy if exists gmvmax_creatives_admin_read on public.gmvmax_creatives;
create policy gmvmax_creatives_admin_read on public.gmvmax_creatives
  for select using (
    exists (
      select 1 from public.gmvmax_imports i
      join public.workspaces w on w.id = i.workspace_id
      where i.id = import_id and public.admin_can_view(w.user_id)
    )
  );

-- gmvmax_notes --------------------------------------------------------------
drop policy if exists gmvmax_notes_owner_all on public.gmvmax_notes;
create policy gmvmax_notes_owner_all on public.gmvmax_notes
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_notes_admin_read on public.gmvmax_notes;
create policy gmvmax_notes_admin_read on public.gmvmax_notes
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- gmvmax_settings -----------------------------------------------------------
drop policy if exists gmvmax_settings_owner_all on public.gmvmax_settings;
create policy gmvmax_settings_owner_all on public.gmvmax_settings
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_settings_admin_read on public.gmvmax_settings;
create policy gmvmax_settings_admin_read on public.gmvmax_settings
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
