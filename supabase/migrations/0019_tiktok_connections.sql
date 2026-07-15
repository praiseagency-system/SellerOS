-- ============================================================================
-- TikTok Ads MCP — KONEKSI OAUTH per workspace.
-- Menyimpan token hasil "Connect TikTok" (Authorization Code + PKCE, public
-- client tanpa secret) agar worker GMV Max bisa self-refresh & menarik data
-- tanpa Keychain/Claude Code. Satu koneksi per workspace.
--
-- KEAMANAN: token = rahasia. RLS OWNER-ONLY (tak ada admin-read seperti tabel
-- lain) — hanya pemilik workspace yang boleh baca/tulis tokennya. Worker
-- server-side memakai service_role (bypass RLS).
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.tiktok_connections (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  -- Identitas akun (diisi setelah connect / panggilan pertama; opsional awalnya)
  advertiser_id  text,
  advertiser_name text,
  -- OAuth
  client_id      text not null,
  scope          text,
  token_type     text default 'Bearer',
  access_token   text not null,
  refresh_token  text,
  expires_at     timestamptz not null,          -- kedaluwarsa access_token
  -- Jejak
  connected_by   uuid references auth.users (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id)                          -- 1 koneksi TikTok / workspace
);

create index if not exists tiktok_connections_ws_idx
  on public.tiktok_connections (workspace_id);

alter table public.tiktok_connections enable row level security;

-- OWNER-ONLY: hanya pemilik workspace. TIDAK ada policy admin-read (token sensitif).
drop policy if exists tiktok_connections_owner_all on public.tiktok_connections;
create policy tiktok_connections_owner_all on public.tiktok_connections
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );
