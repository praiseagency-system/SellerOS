-- ============================================================================
-- GMV Max — MULTI-ADVERTISER membership MODEL (Phase 2B). SCHEMA-ONLY.
--
-- Model reusable: satu workspace/store -> satu connection_group -> 1..N advertiser
-- source. Menangani store yang dilaporkan >1 advertiser (mis. migrasi akun ads:
-- PRIMARY baru + LEGACY lama, store & token SAMA). TIDAK ada seed produksi di sini
-- (konfigurasi tenant hidup di ops/seed_gmvmax_tenant_advertisers.sql).
--
-- Additif, idempoten, backward-compatible (workspace tanpa baris -> worker tetap
-- single-advertiser dari tiktok_connections). Tak menyimpan token/payload.
-- RLS: owner READ-ONLY; tulis HANYA service_role/ops (bukan browser). anon ditolak.
-- Jalankan di Supabase Dashboard -> SQL Editor.
-- ============================================================================

-- Target FK komposit: id sudah PK (unik), tapi Postgres butuh unique EKSPLISIT
-- pada (id, workspace_id) agar bisa jadi target FK komposit. Additif & idempoten;
-- (id, workspace_id) tak pernah bentrok karena id PK.
create unique index if not exists tiktok_connections_id_workspace_uk
  on public.tiktok_connections (id, workspace_id);

create table if not exists public.gmvmax_tenant_advertisers (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  store_id             text not null,
  -- grup logis (1 hasil tenant). Default = workspace_id::text; boleh dipisah bila
  -- satu workspace punya >1 store/tenant terpisah.
  connection_group_id  text not null,
  -- sumber token/provider utk advertiser ini. Boleh SAMA utk banyak advertiser
  -- (satu token mengotorisasi beberapa advertiser) -> tak butuh koneksi baru.
  -- NULL diizinkan (belum ada koneksi); FK komposit di bawah (MATCH SIMPLE)
  -- otomatis tak dicek bila NULL (backward-compatible).
  source_connection_id uuid,
  advertiser_id        text not null,
  advertiser_role      text not null default 'PRIMARY'
                         check (advertiser_role in ('PRIMARY', 'LEGACY', 'SECONDARY')),
  is_active            boolean not null default true,
  priority             integer not null default 100 check (priority >= 0 and priority <= 100000),
  metadata             jsonb,               -- {advertiser_name, note, ...} — non-rahasia
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- Req 3/4: satu advertiser tercatat sekali per workspace (cegah duplikat aktif).
  -- Implikasi: satu advertiser hanya boleh milik SATU sumber logis dalam workspace.
  unique (workspace_id, advertiser_id),
  -- INVARIAN OWNERSHIP: source_connection_id WAJIB milik workspace yang sama.
  -- FK komposit ke (id, workspace_id) — FK single-kolom saja TAK cukup. Menolak
  -- membership yang menunjuk koneksi milik workspace lain (lintas-workspace).
  -- ON DELETE NO ACTION (portable, tak butuh PG15): hapus koneksi ter-referensi
  -- diblok → kosongkan source_connection_id membership dulu, atau hapus membership.
  -- Hapus workspace tetap aman (cascade menghapus koneksi & membership bersama).
  constraint gmvmax_tenant_adv_conn_same_ws
    foreign key (source_connection_id, workspace_id)
    references public.tiktok_connections (id, workspace_id) on delete no action
);

-- Req 5: MAKS SATU advertiser PRIMARY aktif per grup — DI-SCOPE ke workspace agar
-- dua workspace berbeda tak bertabrakan bila kebetulan pakai connection_group_id
-- sama (kolom bebas-teks; default = workspace_id::text tapi tak dijamin global).
create unique index if not exists gmvmax_tenant_adv_one_active_primary
  on public.gmvmax_tenant_advertisers (workspace_id, connection_group_id)
  where (advertiser_role = 'PRIMARY' and is_active = true);

-- Req 8: index penunjang.
create index if not exists gmvmax_tenant_adv_ws_active_idx  on public.gmvmax_tenant_advertisers (workspace_id, is_active);
create index if not exists gmvmax_tenant_adv_group_idx      on public.gmvmax_tenant_advertisers (connection_group_id);
create index if not exists gmvmax_tenant_adv_store_idx      on public.gmvmax_tenant_advertisers (store_id);
create index if not exists gmvmax_tenant_adv_conn_idx       on public.gmvmax_tenant_advertisers (source_connection_id);
create index if not exists gmvmax_tenant_adv_advertiser_idx on public.gmvmax_tenant_advertisers (advertiser_id);

alter table public.gmvmax_tenant_advertisers enable row level security;

-- GRANT: owner (authenticated) hanya SELECT; tak ada insert/update/delete grant ->
-- browser TAK bisa menulis membership. service_role kelola penuh (ops/worker).
grant select on public.gmvmax_tenant_advertisers to authenticated;
grant all    on public.gmvmax_tenant_advertisers to service_role;

-- Owner boleh BACA membership workspace-nya sendiri (bukan lintas-workspace).
drop policy if exists gmvmax_tenant_advertisers_owner_read on public.gmvmax_tenant_advertisers;
create policy gmvmax_tenant_advertisers_owner_read on public.gmvmax_tenant_advertisers
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

-- Admin (consent-based) boleh baca — selaras kebijakan admin lain.
drop policy if exists gmvmax_tenant_advertisers_admin_read on public.gmvmax_tenant_advertisers;
create policy gmvmax_tenant_advertisers_admin_read on public.gmvmax_tenant_advertisers
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- SENGAJA: TIDAK ada policy insert/update/delete utk authenticated -> owner tak
-- bisa menulis membership dari browser (RLS default-deny). Tulis via service_role.
