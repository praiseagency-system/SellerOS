-- Kerangka minimal yang meniru Supabase, HANYA untuk memvalidasi migrasi
-- 0049 & 0050 di Postgres sekali pakai. Bukan bagian produk.
create role anon;
create role authenticated;
create role service_role;

create schema if not exists auth;
create table auth.users (id uuid primary key);
-- Di Supabase auth.uid() membaca klaim JWT; di sini cukup GUC agar bisa diatur.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

-- Tabel yang disentuh migrasi (bentuk sesuai 0001 / 0011 / 0012 / 0029).
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text
);

create table public.gmvmax_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text, period_month date, snapshot_date date, start_date date, end_date date,
  currency text default 'IDR', source_filename text, totals jsonb, settings jsonb,
  version int not null default 1, is_current boolean not null default true,
  content_signature text, superseded_at timestamptz, superseded_by uuid,
  created_at timestamptz not null default now()
);

create table public.gmvmax_creatives (
  id bigserial primary key,
  import_id uuid not null references public.gmvmax_imports(id) on delete cascade,
  video_id text, campaign_name text, campaign_id text, product_id text,
  creative_type text, video_title text, tiktok_account text, time_posted timestamptz,
  status text, auth_type text, cost numeric, sku_orders numeric, cost_per_order numeric,
  gross_revenue numeric, roas numeric, impressions numeric, clicks numeric,
  ctr numeric, cvr numeric, vr_2s numeric, vr_6s numeric, vr_25 numeric,
  vr_50 numeric, vr_75 numeric, vr_100 numeric, hook_tag text, raw_data jsonb
);

create table public.gmvmax_snapshot_lineage (
  id bigserial primary key,
  workspace_id uuid not null, snapshot_date date not null,
  import_id uuid, version int not null, previous_import_id uuid, previous_version int,
  content_signature text, content_changed boolean, writer_kind text, writer_version text,
  run_id text, sync_run_id uuid, actor_role text,
  created_at timestamptz not null default now(),
  unique (workspace_id, snapshot_date, version)
);

-- 0012 apa adanya (kondisi SEBELUM 0050).
create table public.gmvmax_video_meta (
  video_id text primary key, username text, author_name text, status text,
  fetched_at timestamptz not null default now()
);
grant select, insert, update on public.gmvmax_video_meta to authenticated;
alter table public.gmvmax_video_meta enable row level security;
create policy gmvmax_video_meta_rw on public.gmvmax_video_meta
  for all to authenticated using (true) with check (true);

-- RLS pemilik untuk imports/creatives (bentuk sama seperti 0011).
alter table public.gmvmax_imports enable row level security;
create policy gmvmax_imports_owner_all on public.gmvmax_imports
  for all using (exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid()));
alter table public.gmvmax_creatives enable row level security;
create policy gmvmax_creatives_owner_all on public.gmvmax_creatives
  for all using (exists (select 1 from public.gmvmax_imports i join public.workspaces w on w.id = i.workspace_id
                         where i.id = import_id and w.user_id = auth.uid()))
  with check (exists (select 1 from public.gmvmax_imports i join public.workspaces w on w.id = i.workspace_id
                      where i.id = import_id and w.user_id = auth.uid()));
grant select, insert, update, delete on public.gmvmax_imports, public.gmvmax_creatives to authenticated;
grant select on public.workspaces to authenticated;
