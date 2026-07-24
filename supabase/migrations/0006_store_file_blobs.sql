-- ============================================================================
-- Tabel store_file_blobs — dataset Performa Toko, SATU BARIS PER FILE.
-- Menggantikan 1 blob raksasa di store_datasets (0005). Dengan 1 baris per file:
--   • hapus 1 file  = DELETE 1 baris (murah, tak menyentuh file lain)
--   • import 1 file = upsert 1 baris (payload kecil, aman dari batas ukuran)
-- Blob lama di store_datasets dimigrasi otomatis oleh app saat load pertama,
-- lalu barisnya dihapus. RLS consent-based (sama pola 0005).
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.store_file_blobs (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  file_name    text not null,
  source       text,
  months       jsonb not null default '[]'::jsonb,
  count        integer not null default 0,
  lines        jsonb not null default '[]'::jsonb,
  saved_at     timestamptz not null default now(),
  primary key (workspace_id, file_name)
);

create index if not exists store_file_blobs_ws_idx on public.store_file_blobs (workspace_id);

grant select, insert, update, delete on public.store_file_blobs to authenticated;

alter table public.store_file_blobs enable row level security;

drop policy if exists store_file_blobs_owner_all on public.store_file_blobs;
create policy store_file_blobs_owner_all on public.store_file_blobs
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists store_file_blobs_admin_read on public.store_file_blobs;
create policy store_file_blobs_admin_read on public.store_file_blobs
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
