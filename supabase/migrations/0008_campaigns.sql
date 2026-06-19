-- ============================================================================
-- Tabel campaigns — event campaign (mis. 6.6, Payday Sale) yang mengelompokkan
-- beberapa produk + window tanggal. Proyeksi margin dihitung dari Harga
-- Campaign tiap produk (calc_products.data.state.jualCampaign).
--   start_date / end_date : window campaign (untuk monitoring Phase 3)
--   product_ids           : daftar id calc_products yang ikut (jsonb array)
-- RLS consent-based seperti tabel lain. Jalankan di Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.campaigns (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  start_date   date,
  end_date     date,
  product_ids  jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_campaigns_workspace on public.campaigns (workspace_id);

grant select, insert, update, delete on public.campaigns to authenticated;

alter table public.campaigns enable row level security;

drop policy if exists campaigns_owner_all on public.campaigns;
create policy campaigns_owner_all on public.campaigns
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists campaigns_admin_read on public.campaigns;
create policy campaigns_admin_read on public.campaigns
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
