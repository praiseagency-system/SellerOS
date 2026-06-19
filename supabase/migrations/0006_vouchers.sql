-- ============================================================================
-- Tabel vouchers — voucher seller yang bisa dikaitkan ke beberapa produk
-- Kalkulator (public.calc_products). Biaya voucher (yang ditanggung seller)
-- otomatis jadi komponen biaya pada produk yang berlaku.
--   discount_type : 'percent' | 'nominal'
--   discount_value: nilai diskon (% bila percent, Rp bila nominal)
--   max_discount  : batas maksimum potongan (cap) — hanya relevan utk percent
--   min_purchase  : minimum pembelian agar voucher berlaku (syarat eligibility)
--   product_ids   : daftar id calc_products yang berlaku (jsonb array)
-- RLS consent-based seperti tabel lain. Jalankan di Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.vouchers (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  name           text not null,
  discount_type  text not null default 'percent',
  discount_value numeric not null default 0,
  max_discount   numeric,
  min_purchase   numeric,
  product_ids    jsonb not null default '[]'::jsonb,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_vouchers_workspace on public.vouchers (workspace_id);

grant select, insert, update, delete on public.vouchers to authenticated;

alter table public.vouchers enable row level security;

drop policy if exists vouchers_owner_all on public.vouchers;
create policy vouchers_owner_all on public.vouchers
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists vouchers_admin_read on public.vouchers;
create policy vouchers_admin_read on public.vouchers
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
