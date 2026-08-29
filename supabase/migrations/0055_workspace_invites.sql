-- ============================================================================
-- Fase 3.3 — UNDANGAN ANGGOTA WORKSPACE.
--
-- 0052 sengaja tidak memberi browser hak menulis workspace_members: kalau bisa,
-- siapa pun tinggal menyisipkan dirinya ke workspace orang lain. Maka satu-
-- satunya jalan menambah anggota adalah lewat server, dan tabel ini yang
-- menjadi jembatannya.
--
-- LEWAT TAUTAN, BUKAN EMAIL. SMTP proyek ini masih bawaan Supabase yang
-- dibatasi beberapa email per jam — tak sanggup jadi tulang punggung undangan.
-- Owner membuat undangan, menyalin tautannya, mengirimnya lewat WhatsApp.
-- Kalau nanti SMTP sendiri sudah ada (Fase 2.3), pengiriman email tinggal
-- ditambahkan di atas tabel yang sama.
--
-- TERIKAT EMAIL: undangan hanya bisa diterima oleh pemilik email yang dituju.
-- Tautan yang bocor ke grup WA tidak memberi akses kepada orang lain.
-- ============================================================================
begin;

create table if not exists public.workspace_invites (
  token        uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null,
  role         text not null default 'editor' check (role in ('editor', 'viewer')),
  invited_by   uuid references auth.users (id),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users (id),
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);

-- Peran 'owner' sengaja TIDAK bisa diundang: kepemilikan dipindahkan lewat
-- jalur tersendiri, bukan lewat tautan yang beredar di chat.

create index if not exists workspace_invites_ws_idx
  on public.workspace_invites (workspace_id, created_at desc);
create index if not exists workspace_invites_email_idx
  on public.workspace_invites (lower(email));

grant all on public.workspace_invites to service_role;
alter table public.workspace_invites enable row level security;

-- Anggota boleh MELIHAT daftar undangan workspace-nya (untuk UI Team), tapi
-- tak ada policy tulis untuk authenticated — pembuatan & penerimaan undangan
-- hanya lewat server (api/team/*), sama alasannya dengan workspace_members.
grant select on public.workspace_invites to authenticated;
drop policy if exists workspace_invites_member_read on public.workspace_invites;
create policy workspace_invites_member_read on public.workspace_invites
  for select to authenticated using (public.is_ws_member(workspace_id));

commit;
