-- ============================================================================
-- SellerOS — Skema awal: profiles, workspaces, periods, products
-- + RLS consent-based (admin hanya bisa lihat data user yang opt-in)
-- + trigger auto-buat profile saat signup
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

-- ─── TABEL ──────────────────────────────────────────────────────────────────

create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,
  role             text not null default 'user' check (role in ('user', 'admin')),
  share_with_admin boolean not null default false,
  created_at       timestamptz not null default now()
);

create table if not exists public.workspaces (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.periods (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  start_date   date,
  end_date     date,
  created_at   timestamptz not null default now()
);

create table if not exists public.products (
  id               uuid primary key default gen_random_uuid(),
  period_id        uuid not null references public.periods (id) on delete cascade,
  name             text not null,
  traffic_value    numeric,
  conversion_value numeric,
  quadrant         text,
  raw_data         jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists idx_workspaces_user   on public.workspaces (user_id);
create index if not exists idx_periods_workspace on public.periods (workspace_id);
create index if not exists idx_products_period    on public.products (period_id);

-- ─── HELPER (SECURITY DEFINER agar tidak rekursi dengan RLS profiles) ─────────

-- Apakah user yang login saat ini admin?
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Bolehkah admin melihat data milik `owner`? Hanya jika owner sudah opt-in.
create or replace function public.admin_can_view(owner uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_admin() and exists (
    select 1 from public.profiles
    where id = owner and share_with_admin = true
  );
$$;

-- ─── TRIGGER: auto-buat profile saat signup ──────────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, role, share_with_admin)
  values (new.id, new.email, 'user', false)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── TRIGGER: cegah user biasa mengubah role/identitas sendiri ───────────────
-- User hanya boleh mengubah `share_with_admin`. Perubahan role dilakukan lewat
-- SQL Editor (auth.uid() null = service role) atau oleh admin.

create or replace function public.profiles_guard_update()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role)
     and auth.uid() is not null
     and not public.is_admin() then
    new.role := old.role;   -- batalkan upaya eskalasi
  end if;
  new.id         := old.id;
  new.email      := old.email;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard_update();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.profiles   enable row level security;
alter table public.workspaces enable row level security;
alter table public.periods    enable row level security;
alter table public.products   enable row level security;

-- profiles ------------------------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or (public.is_admin() and share_with_admin = true)
  );

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- workspaces ----------------------------------------------------------------
drop policy if exists ws_owner_all on public.workspaces;
create policy ws_owner_all on public.workspaces
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists ws_admin_read on public.workspaces;
create policy ws_admin_read on public.workspaces
  for select using (public.admin_can_view(user_id));

-- periods -------------------------------------------------------------------
drop policy if exists periods_owner_all on public.periods;
create policy periods_owner_all on public.periods
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists periods_admin_read on public.periods;
create policy periods_admin_read on public.periods
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- products ------------------------------------------------------------------
drop policy if exists products_owner_all on public.products;
create policy products_owner_all on public.products
  for all using (
    exists (
      select 1 from public.periods p
      join public.workspaces w on w.id = p.workspace_id
      where p.id = period_id and w.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.periods p
      join public.workspaces w on w.id = p.workspace_id
      where p.id = period_id and w.user_id = auth.uid()
    )
  );

drop policy if exists products_admin_read on public.products;
create policy products_admin_read on public.products
  for select using (
    exists (
      select 1 from public.periods p
      join public.workspaces w on w.id = p.workspace_id
      where p.id = period_id and public.admin_can_view(w.user_id)
    )
  );

-- ============================================================================
-- Cara menjadikan user sebagai admin (jalankan setelah user signup):
--   update public.profiles set role = 'admin' where email = 'kamu@contoh.com';
-- ============================================================================
