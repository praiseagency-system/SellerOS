-- ============================================================================
-- GMV Max — CANONICAL IMPORT AUDIT (provenance hardening) — PREPARED, NOT APPLIED.
--
-- TUJUAN: jejak APPEND-ONLY setiap penulisan/penghapusan gmvmax_imports agar
-- penggantian OUT-OF-BAND berikutnya TERTANGKAP (aktor yang sekarang UNKNOWN →
-- menjadi catchable: session role + JWT claims + application_name + client IP +
-- waktu presisi + import lama/baru). Menutup akar masalah observability yang
-- membuat RCA AsterixSty 2026-07-20 buntu.
--
-- SIFAT: ADITIF & aman. Menambah 1 tabel + 1 fungsi trigger + 1 trigger AFTER
-- INSERT/DELETE pada gmvmax_imports. TIDAK mengubah kolom gmvmax_imports/creatives,
-- TIDAK mengubah writer, TIDAK memblokir penulisan, TIDAK menghapus apa pun.
-- Idempoten. TANPA token/secret/payload mentah. Independen dari 0026/0027.
--
-- KRITIS — SECURITY DEFINER: fungsi trigger BERJALAN sebagai owner (postgres) agar
-- insert audit SELALU berhasil, termasuk saat import ditulis oleh role `authenticated`
-- (upload UI) yang TIDAK punya grant tulis ke tabel audit. Tanpa DEFINER, upload UI
-- akan GAGAL. Karena DEFINER membuat current_user = owner, aktor asli direkam via
-- session_user + request.jwt.claims + application_name + inet_client_addr().
-- search_path dikunci utk cegah hijack. Fungsi tak pernah melempar (kolom NOT NULL
-- dijamin ada dari NEW/OLD; sisanya nullable) → tak pernah menggagalkan write.
--
-- NOT APPLIED oleh file ini. Jalankan MANUAL di Supabase SQL Editor SETELAH review.
-- Branch fix/gmvmax-canonical-provenance (BUKAN Phase 3A).
-- ============================================================================

create table if not exists public.gmvmax_import_audit (
  id                uuid primary key default gen_random_uuid(),
  event             text not null check (event in ('INSERT','DELETE')),
  import_id         uuid not null,
  workspace_id      uuid not null,
  snapshot_date     date,
  row_totals        jsonb,                         -- {cost,revenue,orders,roas} (bukan payload mentah)
  content_signature text,                          -- diisi writer aplikasi bila tersedia (nullable)
  name              text,
  source_filename   text,
  db_session_user   text not null,                 -- session_user (aktor login sebenarnya)
  request_claims    text,                          -- current_setting('request.jwt.claims') mentah → memuat role
  app_name          text,                          -- application_name (writer bisa set utk identifikasi diri)
  client_addr       text,                          -- inet_client_addr() (null utk koneksi lokal/socket)
  occurred_at       timestamptz not null default now()
);

create index if not exists gmvmax_import_audit_ws_date_idx
  on public.gmvmax_import_audit (workspace_id, snapshot_date, occurred_at desc);
create index if not exists gmvmax_import_audit_import_idx
  on public.gmvmax_import_audit (import_id);

-- Fungsi trigger append-only. SECURITY DEFINER (jalan sbg owner) → insert audit
-- selalu berhasil & tak pernah menggagalkan write utama. search_path dikunci.
create or replace function public.gmvmax_import_audit_fn()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.gmvmax_import_audit
      (event, import_id, workspace_id, snapshot_date, row_totals, content_signature,
       name, source_filename, db_session_user, request_claims, app_name, client_addr)
    values
      ('INSERT', new.id, new.workspace_id, new.snapshot_date, new.totals, null,
       new.name, new.source_filename, session_user,
       current_setting('request.jwt.claims', true),
       current_setting('application_name', true),
       inet_client_addr()::text);
    return new;
  elsif (tg_op = 'DELETE') then
    insert into public.gmvmax_import_audit
      (event, import_id, workspace_id, snapshot_date, row_totals, content_signature,
       name, source_filename, db_session_user, request_claims, app_name, client_addr)
    values
      ('DELETE', old.id, old.workspace_id, old.snapshot_date, old.totals, null,
       old.name, old.source_filename, session_user,
       current_setting('request.jwt.claims', true),
       current_setting('application_name', true),
       inet_client_addr()::text);
    return old;
  end if;
  return null;
end $$;

drop trigger if exists gmvmax_imports_audit_trg on public.gmvmax_imports;
create trigger gmvmax_imports_audit_trg
  after insert or delete on public.gmvmax_imports
  for each row execute function public.gmvmax_import_audit_fn();

-- ── GRANTS & RLS (owner read-only; service manage; anon denied) ───────────────
grant select on public.gmvmax_import_audit to authenticated;
grant all    on public.gmvmax_import_audit to service_role;

alter table public.gmvmax_import_audit enable row level security;

drop policy if exists gmvmax_import_audit_owner_read on public.gmvmax_import_audit;
create policy gmvmax_import_audit_owner_read on public.gmvmax_import_audit
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_import_audit_admin_read on public.gmvmax_import_audit;
create policy gmvmax_import_audit_admin_read on public.gmvmax_import_audit
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- SENGAJA: TIDAK ada policy/grant insert/update/delete utk authenticated → append
-- hanya via trigger (SECURITY DEFINER). anon tanpa grant → ditolak. Audit tak bisa
-- diubah/dihapus dari browser.

-- ── ROLLBACK (bila perlu membatalkan) ────────────────────────────────────────
-- drop trigger if exists gmvmax_imports_audit_trg on public.gmvmax_imports;
-- drop function if exists public.gmvmax_import_audit_fn();
-- drop table if exists public.gmvmax_import_audit;
