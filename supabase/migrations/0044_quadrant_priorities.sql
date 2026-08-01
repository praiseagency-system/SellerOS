-- ============================================================================
-- Prioritas Kuadran — daftar kerja optimasi produk marketplace + snapshot
-- metrik SEBELUM optimasi, supaya hasilnya bisa dibandingkan setelah periode
-- berikutnya masuk.
--
-- CATATAN PENTING soal "Log Optimasi":
-- Tabel `gmvmax_action_log` (migrasi 0014) adalah jurnal GMV Max dengan skema
-- video_id / tiktok_account / roas — tak punya kolom produk, marketplace,
-- periode, maupun snapshot. Menambah kolom ke sana berarti mengubah modul yang
-- sedang dipakai (berisiko), jadi TIDAK dilakukan. Prioritas marketplace
-- memakai tabel sendiri di bawah ini dan menyimpan referensi silang lewat
-- kolom `linked_log_id` kalau kelak dua modul ini disatukan.
--
-- ADITIF SEPENUHNYA: tabel baru, tak ada kolom/tabel lama yang diubah.
-- Aplikasi tetap jalan tanpa tabel ini (daftar prioritas jadi read-only).
-- Jalankan di Supabase → SQL Editor.
-- ============================================================================

create table if not exists public.quadrant_priorities (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces (id) on delete cascade,
  canonical_product_id text not null,
  product_name         text not null default '',
  marketplace_mode     text not null default 'all',      -- all | shopee | tiktok
  period_value         text,                             -- 'YYYY-MM' atau rentang
  quadrant             smallint,
  problem_category     text,                             -- discovery | pdp | checkout | traffic | scale | validate | review
  funnel_stage         text,                             -- impression | click | atc | buyer
  recommendation       text,
  priority_score       numeric,
  potential_gmv        numeric,
  data_confidence      numeric,
  confidence_level     text,                             -- high | medium | low
  status               text not null default 'open',     -- open | in_progress | done | dismissed
  owner                text,
  due_date             date,
  notes                text,
  expected_impact      text,
  actual_result        text,
  -- Snapshot metrik SEBELUM optimasi (traffic, ctr, atcRate, cr, gmv, roas,
  -- buyers, benchmark). Disimpan utuh supaya perbandingan sesudah tak
  -- bergantung pada data periode yang bisa berubah.
  before_snapshot      jsonb not null default '{}'::jsonb,
  after_snapshot       jsonb,
  linked_log_id        uuid,                             -- referensi silang ke jurnal lain
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  completed_at         timestamptz
);

create index if not exists idx_quadrant_priorities_ws
  on public.quadrant_priorities (workspace_id, status, created_at desc);
-- Satu produk hanya boleh punya satu prioritas terbuka per periode & mode.
create unique index if not exists idx_quadrant_priorities_open
  on public.quadrant_priorities (workspace_id, canonical_product_id, marketplace_mode, coalesce(period_value, ''))
  where status in ('open', 'in_progress');

grant select, insert, update, delete on public.quadrant_priorities to authenticated;

alter table public.quadrant_priorities enable row level security;

drop policy if exists quadrant_priorities_owner_all on public.quadrant_priorities;
create policy quadrant_priorities_owner_all on public.quadrant_priorities
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists quadrant_priorities_admin_read on public.quadrant_priorities;
create policy quadrant_priorities_admin_read on public.quadrant_priorities
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
