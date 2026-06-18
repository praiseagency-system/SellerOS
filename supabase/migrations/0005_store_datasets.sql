-- ============================================================================
-- Tabel store_datasets — dataset Performa Toko per workspace (1 row/workspace).
-- Menyimpan blob {files, lines} hasil ingest sebagai jsonb. Supabase (TOAST)
-- menampung dataset jauh lebih besar dari batas localStorage. RLS consent-based.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

create table if not exists public.store_datasets (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  data         jsonb not null default '{"files":[],"lines":[]}'::jsonb,
  updated_at   timestamptz not null default now()
);

grant select, insert, update, delete on public.store_datasets to authenticated;

alter table public.store_datasets enable row level security;

drop policy if exists store_datasets_owner_all on public.store_datasets;
create policy store_datasets_owner_all on public.store_datasets
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists store_datasets_admin_read on public.store_datasets;
create policy store_datasets_admin_read on public.store_datasets
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
