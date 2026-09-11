-- ============================================================================
-- 0059 — AI Assistant: riwayat percakapan per user per workspace.
--
-- Meniru AiConversation di Pikat (praise-affiliate-os): satu baris = satu
-- thread, isi pesan disimpan sebagai array JSON {role, content}. Thread itu
-- MILIK ORANG, bukan milik workspace: anggota lain di workspace yang sama tidak
-- boleh membaca percakapan rekan setimnya. Karena itu policy memakai DUA syarat
-- — keanggotaan workspace (pola 0053) DAN user_id = auth.uid().
--
-- Tulis hanya untuk owner/editor (can_ws_write): viewer tetap boleh bertanya
-- ke asisten, tapi percakapannya tidak disimpan. Konsisten dengan gerbang
-- isolasi (supabase/tests/proof_isolation.sql) yang menuntut viewer tak bisa
-- mengubah/menghapus apa pun.
--
-- Fungsi serverless api/assistant/* menulis ke tabel ini MEMAKAI JWT pemanggil
-- (bukan service_role), jadi policy di sinilah satu-satunya pagar.
-- ============================================================================
begin;

create table if not exists public.ai_conversations (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null default '',
  messages     jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ai_conversations_messages_is_array check (jsonb_typeof(messages) = 'array')
);

-- Daftar sidebar: thread milik user di workspace aktif, terbaru dulu.
create index if not exists ai_conversations_ws_user_updated_idx
  on public.ai_conversations (workspace_id, user_id, updated_at desc);

alter table public.ai_conversations enable row level security;

drop policy if exists ai_conversations_member_read on public.ai_conversations;
create policy ai_conversations_member_read on public.ai_conversations
  for select to authenticated
  using (public.is_ws_member(workspace_id) and user_id = auth.uid());

drop policy if exists ai_conversations_member_write on public.ai_conversations;
create policy ai_conversations_member_write on public.ai_conversations
  for all to authenticated
  using (public.can_ws_write(workspace_id) and user_id = auth.uid())
  with check (public.can_ws_write(workspace_id) and user_id = auth.uid());

grant select, insert, update, delete on public.ai_conversations to authenticated;
grant all on public.ai_conversations to service_role;

commit;
