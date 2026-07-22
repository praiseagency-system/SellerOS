-- ============================================================================
-- GMV Max — CANONICAL IMPORT VERSIONING + LINEAGE (provenance hardening).
-- Data-model A + C (rekomendasi): imports jadi VERSIONED & immutable, plus tabel
-- lineage yang mengikat sync_run ↔ import version ↔ versi sebelumnya.
--
-- PREPARED — NOT APPLIED. Jalankan MANUAL di Supabase SQL Editor SETELAH review &
-- persetujuan. Branch fix/gmvmax-canonical-provenance (BUKAN Phase 3A).
--
-- TUJUAN: hentikan hilangnya provenance saat snapshot diganti. Alih-alih
-- delete+insert (UUID baru, riwayat hilang, sync_run dangling), writer NANTI akan:
--   - konten identik  → NO-OP (pertahankan import id + versi + provenance),
--   - konten berubah  → tandai versi lama superseded, sisipkan versi baru current,
--   - tulis lineage + sync_run DALAM SATU transaksi.
-- Migrasi ini menyiapkan SKEMA-nya saja. Writer produksi TIDAK diubah oleh file ini.
--
-- KOMPATIBEL dengan writer lama: kolom ber-DEFAULT; partial-unique menjaga invariant
-- "satu current per (workspace, snapshot_date)". Writer lama yang delete+insert tetap
-- menghasilkan tepat 1 baris current (perilaku status quo, tanpa regresi).
--
-- BUKAN murni additive: melepas unique(workspace_id, snapshot_date) lama dan
-- menggantinya dengan unique(...,version) + partial-unique current. Backfill aman
-- & idempoten. TANPA token/secret/payload mentah.
-- ============================================================================

-- 1) Kolom versioning aditif.
alter table public.gmvmax_imports
  add column if not exists version           int         not null default 1,
  add column if not exists is_current        boolean     not null default true,
  add column if not exists content_signature text,
  add column if not exists superseded_at     timestamptz,
  add column if not exists superseded_by     uuid;

-- 2) Backfill baris lama (idempoten): versi 1, current.
update public.gmvmax_imports set version    = 1    where version    is distinct from 1 and version    is null;
update public.gmvmax_imports set is_current = true where is_current is null;

-- 3) Identitas versioned: lepas unique lama → unique(ws,date,version) + partial current.
alter table public.gmvmax_imports drop constraint if exists gmvmax_imports_ws_date_uniq;
create unique index if not exists gmvmax_imports_ws_date_version_uniq
  on public.gmvmax_imports (workspace_id, snapshot_date, version);
-- INVARIANT: tepat satu import current per (workspace, snapshot_date).
create unique index if not exists gmvmax_imports_ws_date_current_uniq
  on public.gmvmax_imports (workspace_id, snapshot_date) where is_current;
create index if not exists gmvmax_imports_current_idx
  on public.gmvmax_imports (workspace_id, snapshot_date, is_current);

-- 4) LINEAGE (C): rekaman intensional per versi snapshot, ditulis writer DALAM
--    transaksi commit (nanti). Mengikat run ↔ import version ↔ versi sebelumnya.
--    import_id/previous_import_id sengaja TANPA FK agar lineage tetap utuh bila
--    versi lama di-prune (append-only history). sync_run_id FK SET NULL (aman).
create table if not exists public.gmvmax_snapshot_lineage (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  snapshot_date      date not null,
  import_id          uuid not null,                 -- versi ini
  version            int  not null,
  previous_import_id uuid,                           -- versi sebelumnya (null = versi pertama)
  previous_version   int,
  content_signature  text,
  content_changed    boolean,                        -- false = no-op (konten identik versi sebelumnya)
  writer_kind        text not null check (writer_kind in ('COMMIT','BACKFILL','MANUAL','OTHER')),
  writer_version     text,
  run_id             text,
  sync_run_id        uuid references public.gmvmax_sync_runs (id) on delete set null,
  actor_role         text,                           -- current_user saat commit
  created_at         timestamptz not null default now(),
  unique (workspace_id, snapshot_date, version)
);
create index if not exists gmvmax_snapshot_lineage_ws_date_idx
  on public.gmvmax_snapshot_lineage (workspace_id, snapshot_date, version desc);
create index if not exists gmvmax_snapshot_lineage_import_idx
  on public.gmvmax_snapshot_lineage (import_id);

-- ── GRANTS & RLS (owner read-only; service manage; anon denied) ───────────────
grant select on public.gmvmax_snapshot_lineage to authenticated;
grant all    on public.gmvmax_snapshot_lineage to service_role;

alter table public.gmvmax_snapshot_lineage enable row level security;

drop policy if exists gmvmax_snapshot_lineage_owner_read on public.gmvmax_snapshot_lineage;
create policy gmvmax_snapshot_lineage_owner_read on public.gmvmax_snapshot_lineage
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_snapshot_lineage_admin_read on public.gmvmax_snapshot_lineage;
create policy gmvmax_snapshot_lineage_admin_read on public.gmvmax_snapshot_lineage
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- SENGAJA: tak ada policy/grant insert/update/delete utk authenticated → browser
-- read-only. anon ditolak. Lineage ditulis hanya via service_role (writer commit).
