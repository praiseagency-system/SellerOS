-- ============================================================================
-- Kode spark dari Pikat (28 Sep 2026).
--
-- Pikat (Praise Affiliate OS) mengumpulkan kode spark dari kreator lewat DM
-- reminder, form sampel, dan campaign. Selama ini tim Ads menyalinnya dari
-- Spark Center Pikat lalu menempelkannya di halaman Boost. Migrasi ini
-- menyiapkan jalurnya:
--
--   pikat_links        token sambungan per workspace (`psl_…` dari Pikat).
--                      Token milik SERVER sepenuhnya — pola 0051: browser
--                      hanya membaca kolom non-rahasia; tulis lewat
--                      api/pikat/spark-codes (service_role, owner saja).
--   pikat_spark_inbox  kode yang ditarik, satu baris per video. Server yang
--                      MENGISI (tarikan); browser anggota ber-hak-tulis hanya
--                      MEMUTUSKAN (status hasil pratinjau / ikat / abaikan).
--
-- Kode di inbox sengaja terbaca anggota: jalur yang ada pun (tempel manual →
-- gmvmax_approvals.proposed_value.auth_code) sudah memperlihatkannya ke
-- anggota yang sama. Yang dirahasiakan adalah TOKEN Pikat, bukan kodenya.
--
-- Pola hak: REVOKE dulu, baru GRANT selektif (0051/0058) — default privileges
-- Supabase memberi hak penuh atas tabel baru, jadi grant saja tak mencabut apa pun.
-- ============================================================================
begin;

-- ── Sambungan ───────────────────────────────────────────────────────────────
create table if not exists public.pikat_links (
  workspace_id         uuid primary key references public.workspaces (id) on delete cascade,
  token                text not null,
  token_hint           text,                     -- 4 karakter terakhir, untuk dikenali
  pikat_workspace_id   integer,
  pikat_workspace_name text,
  connected_by         uuid,
  connected_at         timestamptz not null default now(),
  last_pulled_at       timestamptz,
  last_error           text,
  updated_at           timestamptz not null default now()
);

alter table public.pikat_links enable row level security;
revoke all on public.pikat_links from anon, authenticated;
grant select (
  workspace_id, token_hint, pikat_workspace_id, pikat_workspace_name,
  connected_by, connected_at, last_pulled_at, last_error, updated_at
) on public.pikat_links to authenticated;
grant all on public.pikat_links to service_role;

drop policy if exists pikat_links_member_read on public.pikat_links;
create policy pikat_links_member_read on public.pikat_links
  for select to authenticated using (public.is_ws_member(workspace_id));

-- ── Kotak masuk kode ────────────────────────────────────────────────────────
create table if not exists public.pikat_spark_inbox (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  video_id        text not null,
  spark_code      text not null,
  tiktok_username text,
  source          text,                          -- campaign | sample | manual (asal di Pikat)
  label           text,                          -- nama campaign / produk sampel
  views           bigint,
  uploaded_at     timestamptz,
  recorded_at     timestamptz,
  -- NEW       baru ditarik, belum dipratinjau
  -- READY     pratinjau cocok (video kode = video di Pikat), siap diikat
  -- INVALID   kode tak bisa dipratinjau TikTok
  -- MISMATCH  kode valid tapi milik video lain
  -- ALREADY   video sudah terikat ke ad account
  -- BOUND     diikat dari kotak ini
  -- FAILED    ikat gagal (lihat preview.error)
  -- DISMISSED diabaikan tim Ads
  status          text not null default 'NEW'
                    check (status in ('NEW','READY','INVALID','MISMATCH','ALREADY','BOUND','FAILED','DISMISSED')),
  preview         jsonb,                         -- ringkasan pratinjau: judul, penulis, item_id, galat
  approval_id     uuid,
  decided_by      uuid,
  decided_at      timestamptz,
  first_seen_at   timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint pikat_spark_inbox_uniq unique (workspace_id, video_id)
);
create index if not exists pikat_spark_inbox_ws_status on public.pikat_spark_inbox (workspace_id, status);

alter table public.pikat_spark_inbox enable row level security;
revoke all on public.pikat_spark_inbox from anon, authenticated;
grant select on public.pikat_spark_inbox to authenticated;
-- Browser hanya memutuskan; kode & metadata ditulis server saat menarik.
grant update (status, preview, approval_id, decided_by, decided_at, updated_at)
  on public.pikat_spark_inbox to authenticated;
grant all on public.pikat_spark_inbox to service_role;

drop policy if exists pikat_spark_inbox_member_read on public.pikat_spark_inbox;
create policy pikat_spark_inbox_member_read on public.pikat_spark_inbox
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists pikat_spark_inbox_member_write on public.pikat_spark_inbox;
create policy pikat_spark_inbox_member_write on public.pikat_spark_inbox
  for update to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

-- ── Approval bersumber Pikat ────────────────────────────────────────────────
alter table public.gmvmax_approvals drop constraint if exists gmvmax_approvals_source_check;
alter table public.gmvmax_approvals add constraint gmvmax_approvals_source_check
  check (source in ('MANUAL','SKILL','SPARK_CENTER','AI_INSIGHT','PIKAT'));

commit;
