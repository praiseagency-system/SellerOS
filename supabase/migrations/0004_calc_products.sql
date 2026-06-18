-- ============================================================================
-- Tabel calc_products — produk tersimpan dari Kalkulator (terpisah dari tabel
-- `products` yang menyimpan produk per-periode kuadran). Field kalkulator
-- disimpan utuh di `data` jsonb. RLS consent-based seperti tabel lain.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.calc_products (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_calc_products_workspace on public.calc_products (workspace_id);

grant select, insert, update, delete on public.calc_products to authenticated;

alter table public.calc_products enable row level security;

drop policy if exists calc_products_owner_all on public.calc_products;
create policy calc_products_owner_all on public.calc_products
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists calc_products_admin_read on public.calc_products;
create policy calc_products_admin_read on public.calc_products
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
