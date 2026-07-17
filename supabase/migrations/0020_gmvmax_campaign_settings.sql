-- ============================================================================
-- GMV Max — SNAPSHOT SETTING CAMPAIGN harian (budget, bid, auto-budget, status).
-- Sumber: MCP `campaign_gmv_max_info_get` (belum pernah ditarik sebelumnya).
-- 1 baris per (workspace, tanggal, campaign) → riwayat harian. Perubahan
-- (mis. "budget 100rb→150rb") DITURUNKAN dgn membandingkan 2 hari berurutan,
-- jadi tak perlu tabel changelog terpisah.
--
-- BUKAN tabel kanonik GMV Max (bukan snapshot creative) → aman ditulis worker
-- shadow tanpa melanggar barrier shadow-only.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.gmvmax_campaign_settings (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  snapshot_date  date not null,
  campaign_id    text not null,
  campaign_name  text,
  promotion_type text,                          -- PRODUCT_GMV_MAX | LIVE_GMV_MAX
  -- Uang & bidding
  budget         numeric,                       -- budget harian
  roas_bid       numeric,                       -- target ROAS
  deep_bid_type  text,                          -- mis. VO_MIN_ROAS
  optimization_goal text,
  billing_event  text,
  auto_budget    jsonb,                         -- {current_budget,maximum_budget,next_increase,increase_limit,remained_times,auto_budget_enabled,budget_increase_percentage}
  -- Status & jadwal
  operation_status  text,                       -- ENABLE | DISABLE
  secondary_status  text,
  schedule_start_time timestamptz,
  schedule_end_time   timestamptz,
  roi_protection_enabled boolean,
  -- Konteks
  store_id       text,
  item_group_ids jsonb,                         -- produk yang dipromosikan
  shopping_ads_type text,
  modify_time    timestamptz,                   -- kapan TikTok mencatat perubahan terakhir
  create_time    timestamptz,
  raw            jsonb,                         -- respons penuh (tahan perubahan skema API)
  created_at     timestamptz not null default now(),
  unique (workspace_id, snapshot_date, campaign_id)
);

create index if not exists gmvmax_campaign_settings_ws_date_idx
  on public.gmvmax_campaign_settings (workspace_id, snapshot_date desc);
create index if not exists gmvmax_campaign_settings_campaign_idx
  on public.gmvmax_campaign_settings (workspace_id, campaign_id, snapshot_date desc);

alter table public.gmvmax_campaign_settings enable row level security;

-- GRANT: RLS mengatur baris, role API tetap butuh privilege tabel.
grant select, insert, update, delete on public.gmvmax_campaign_settings to authenticated;
grant all on public.gmvmax_campaign_settings to service_role;

-- Pemilik workspace: akses penuh (selaras pola gmvmax_* lain).
drop policy if exists gmvmax_campaign_settings_owner_all on public.gmvmax_campaign_settings;
create policy gmvmax_campaign_settings_owner_all on public.gmvmax_campaign_settings
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

-- Admin (consent-based) boleh baca — selaras 0011/0015.
drop policy if exists gmvmax_campaign_settings_admin_read on public.gmvmax_campaign_settings;
create policy gmvmax_campaign_settings_admin_read on public.gmvmax_campaign_settings
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
