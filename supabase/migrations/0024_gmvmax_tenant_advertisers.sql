-- ============================================================================
-- GMV Max — MULTI-ADVERTISER per tenant (Phase 2B). ADITIF & aman.
--
-- Masalah: satu store bisa dilaporkan oleh >1 advertiser (mis. Dasfelix migrasi
-- akun ads 7214 lama -> 7663 baru, STORE SAMA). Canonical production sudah
-- menjumlahkan keduanya (registry advertisers.mjs), tapi jalur data-driven
-- (tiktok_connections) hanya menyimpan 1 advertiser -> shadow parity tak lengkap.
--
-- Solusi: tabel keanggotaan EKSPLISIT (bukan hardcode di worker). Satu logical
-- tenant = satu workspace (+store); punya 1..N advertiser, masing-masing merujuk
-- connection (sumber token) sendiri. Backward-compatible: workspace TANPA baris di
-- sini tetap jalan single-advertiser dari tiktok_connections (AsterixSty tak berubah).
--
-- RLS owner-only + admin_can_view (selaras gmvmax_* lain). Tak ada token di sini.
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- ============================================================================

create table if not exists public.gmvmax_tenant_advertisers (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  -- sumber token/provider utk advertiser ini (biasanya sama utk 1 workspace, tapi
  -- boleh beda bila advertiser diotorisasi token lain). NULL -> pakai koneksi
  -- utama workspace di tiktok_connections.
  connection_id   uuid references public.tiktok_connections (id) on delete set null,
  store_id        text not null,
  advertiser_id   text not null,
  advertiser_name text,
  role            text,                       -- 'primary' | 'legacy' | 'secondary' (lineage)
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (workspace_id, advertiser_id)
);

create index if not exists gmvmax_tenant_advertisers_ws_idx
  on public.gmvmax_tenant_advertisers (workspace_id, active);

alter table public.gmvmax_tenant_advertisers enable row level security;

grant select, insert, update, delete on public.gmvmax_tenant_advertisers to authenticated;
grant all on public.gmvmax_tenant_advertisers to service_role;

drop policy if exists gmvmax_tenant_advertisers_owner_all on public.gmvmax_tenant_advertisers;
create policy gmvmax_tenant_advertisers_owner_all on public.gmvmax_tenant_advertisers
  for all using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_tenant_advertisers_admin_read on public.gmvmax_tenant_advertisers;
create policy gmvmax_tenant_advertisers_admin_read on public.gmvmax_tenant_advertisers
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- ── SEED konfigurasi tenant saat ini (config, BUKAN hardcode di worker) ──────
-- Dasfelix: DUA advertiser pada store 7494949073431268328 (akun bermigrasi).
insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, advertiser_id, advertiser_name, role, active)
values
  ('c420074f-d4a6-4e6d-bf8e-2d0234b575d7', '7494949073431268328', '7663429402298089480', 'Dasfelix (akun baru)',   'primary', true),
  ('c420074f-d4a6-4e6d-bf8e-2d0234b575d7', '7494949073431268328', '7214793879483170817', 'Dasfelix Store (lama)',   'legacy',  true)
on conflict (workspace_id, advertiser_id) do update
  set store_id = excluded.store_id, advertiser_name = excluded.advertiser_name, role = excluded.role, active = excluded.active, updated_at = now();

-- AsterixSty: SATU advertiser (eksplisit; tetap identik dgn fallback single).
insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, advertiser_id, advertiser_name, role, active)
values
  ('10280d7b-2994-4a40-b639-2d88e0e2018b', '7495201716088572081', '7313535999831769090', 'AsterixSty', 'primary', true)
on conflict (workspace_id, advertiser_id) do update
  set store_id = excluded.store_id, advertiser_name = excluded.advertiser_name, role = excluded.role, active = excluded.active, updated_at = now();
