-- ============================================================================
-- Fase 3.1 — KEANGGOTAAN WORKSPACE (aditif; BELUM mengubah satu policy pun).
--
-- Hari ini satu workspace dimiliki tepat satu user (`workspaces.user_id`), dan
-- 68 policy di 34 tabel semuanya menanyakan hal yang sama:
--     exists (select 1 from public.workspaces w
--             where w.id = workspace_id and w.user_id = auth.uid())
-- Akibatnya "agency OS" cuma bisa dipakai satu orang per workspace.
--
-- Migrasi ini HANYA menyiapkan fondasinya:
--   - tabel workspace_members + backfill pemilik lama sebagai 'owner'
--   - tiga fungsi penentu akses yang nanti dipakai policy
-- TIDAK ada policy yang diubah di sini. Jadi setelah migrasi ini dijalankan,
-- perilaku sistem PERSIS SAMA — tak ada yang bisa rusak. Penggantian policy
-- dilakukan terpisah (0053) supaya kalau ada yang meleset, yang perlu dibalik
-- hanya satu migrasi, bukan dua hal sekaligus.
--
-- Sifat fungsi:
--   SECURITY DEFINER + stable → policy bisa memanggilnya tanpa rekursi RLS
--   (pola yang sama dipakai is_admin()/admin_can_view() sejak migrasi 0001).
--   search_path dipaku agar tak bisa dibajak lewat schema lain.
-- ============================================================================
begin;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id)        on delete cascade,
  role         text not null default 'editor'
                 check (role in ('owner', 'editor', 'viewer')),
  invited_by   uuid references auth.users (id),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx
  on public.workspace_members (user_id);

-- Backfill: setiap pemilik lama menjadi anggota ber-peran owner. Idempoten.
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.user_id, 'owner' from public.workspaces w
on conflict (workspace_id, user_id) do nothing;

-- ── Penentu akses ───────────────────────────────────────────────────────────
-- Anggota mana pun boleh MEMBACA.
create or replace function public.is_ws_member(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  )
$$;

-- Menulis: owner & editor. Viewer sengaja hanya membaca — kalau viewer boleh
-- menulis, perannya jadi bohong.
create or replace function public.can_ws_write(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and m.role in ('owner', 'editor')
  )
$$;

-- Hal yang tetap milik owner: koneksi TikTok, kelola anggota, hapus workspace.
create or replace function public.is_ws_owner(ws uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid() and m.role = 'owner'
  )
$$;

grant execute on function public.is_ws_member(uuid)  to authenticated;
grant execute on function public.can_ws_write(uuid)  to authenticated;
grant execute on function public.is_ws_owner(uuid)   to authenticated;

-- ── RLS tabel keanggotaan itu sendiri ───────────────────────────────────────
grant select on public.workspace_members to authenticated;
grant all    on public.workspace_members to service_role;
alter table public.workspace_members enable row level security;

-- Anggota boleh melihat sesama anggota di workspace yang sama.
drop policy if exists workspace_members_read on public.workspace_members;
create policy workspace_members_read on public.workspace_members
  for select to authenticated using (public.is_ws_member(workspace_id));

-- SENGAJA: tak ada policy tulis untuk authenticated. Menambah/mengeluarkan
-- anggota akan lewat jalur server (undangan ber-token), bukan tulis langsung
-- dari browser — supaya orang tak bisa memasukkan dirinya ke workspace lain.
commit;
