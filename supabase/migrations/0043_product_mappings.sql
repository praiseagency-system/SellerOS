-- ============================================================================
-- Canonical product mapping — satu produk nyata yang punya listing berbeda di
-- tiap marketplace. Menggantikan penggabungan berbasis kemiripan nama.
--
-- ADITIF SEPENUHNYA: tabel baru, tak ada kolom/tabel lama yang diubah atau
-- dihapus. Aplikasi tetap jalan tanpa tabel ini (mapping dianggap kosong →
-- pencocokan otomatis by SKU/nama seperti sebelumnya), jadi urutan deploy
-- bebas. Jalankan di Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.product_mappings (
  id                    uuid primary key default gen_random_uuid(),
  workspace_id          uuid not null references public.workspaces (id) on delete cascade,
  canonical_product_id  text not null,
  canonical_product_name text not null default '',
  shopee_product_id     text,
  tiktok_product_id     text,
  shopee_product_name   text,
  tiktok_product_name   text,
  product_type          text,
  variant               text,
  size                  text,
  bundle_composition    jsonb not null default '[]'::jsonb,
  mapping_status        text not null default 'needs_review',   -- verified | auto_matched | needs_review | unmatched
  mapping_confidence    numeric,
  mapping_source        text,                                    -- manual | product_id | sku | normalized_name | historical_mapping
  notes                 text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists idx_product_mappings_ws on public.product_mappings (workspace_id);
-- Satu listing hanya boleh menempel ke satu canonical product.
create unique index if not exists idx_product_mappings_shopee
  on public.product_mappings (workspace_id, shopee_product_id) where shopee_product_id is not null;
create unique index if not exists idx_product_mappings_tiktok
  on public.product_mappings (workspace_id, tiktok_product_id) where tiktok_product_id is not null;

grant select, insert, update, delete on public.product_mappings to authenticated;

alter table public.product_mappings enable row level security;

drop policy if exists product_mappings_owner_all on public.product_mappings;
create policy product_mappings_owner_all on public.product_mappings
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists product_mappings_admin_read on public.product_mappings;
create policy product_mappings_admin_read on public.product_mappings
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- Riwayat perubahan mapping (siapa mengubah apa). Append-only.
create table if not exists public.product_mapping_log (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  canonical_product_id text not null,
  action       text not null,          -- confirm | reject | merge | unmerge | create
  detail       jsonb not null default '{}'::jsonb,
  by_email     text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_product_mapping_log_ws on public.product_mapping_log (workspace_id, created_at desc);

grant select, insert on public.product_mapping_log to authenticated;

alter table public.product_mapping_log enable row level security;

drop policy if exists product_mapping_log_owner_all on public.product_mapping_log;
create policy product_mapping_log_owner_all on public.product_mapping_log
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );
