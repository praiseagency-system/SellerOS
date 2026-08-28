-- ============================================================================
-- GMV Max — MENUTUP LUBANG BUTA: potret harian SESI BOOST & OTORISASI SPARK,
-- plus perkakas untuk loop belajar (ambang vonis + penanda eksperimen tercampur).
--
-- LATAR: aksi yang dikerjakan langsung di Ads Manager / Seller Centre tidak
-- pernah masuk gmvmax_approvals. Untuk setelan campaign hal itu sudah tertutup
-- (gmvmax_campaign_settings dipotret harian → diff antar-hari). Tapi DUA aksi
-- paling penting belum terpotret sama sekali:
--   * sesi boost  — endpoint campaign_gmv_max_session_list_get SUDAH dipanggil
--                   worker tiap pagi (featureRegistryFetch.mjs) lalu DIBUANG;
--                   ia hanya mengembalikan sesi yang SEDANG berjalan, jadi tanpa
--                   potret harian sesi yang selesai lenyap tanpa bekas.
--   * otorisasi spark — tt_video_list_get membawa auth_code utuh + produk
--                   tertaut + kapan izin berakhir; belum pernah disimpan.
-- Tanpa keduanya, loop belajar menilai boost hanya dari separuh kejadian.
--
-- ADITIF & aman: 2 tabel baru + kolom opsional. TIDAK menyentuh kanonik
-- (gmvmax_imports/creatives) maupun tabel approval.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

-- ── 1. Potret harian SESI BOOST (Max Delivery & Creative Boost) ─────────────
create table if not exists public.gmvmax_boost_sessions (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  snapshot_date       date not null,
  advertiser_id       text not null,
  campaign_id         text not null,
  campaign_name       text,
  session_id          text not null,
  bid_type            text,                    -- NO_BID = Max Delivery · CREATIVE_NO_BID = Creative Boost
  budget              numeric,
  item_id             text,                    -- video (hanya Creative Boost)
  spu_id              text,                    -- produk sasaran
  schedule_start_time timestamptz,
  schedule_end_time   timestamptz,
  status              text,
  raw                 jsonb,
  created_at          timestamptz not null default now(),
  -- Idempoten: run ulang tanggal yang sama menimpa, bukan menggandakan.
  constraint gmvmax_boost_sessions_uniq unique (workspace_id, snapshot_date, session_id)
);
create index if not exists gmvmax_boost_sessions_ws_date_idx
  on public.gmvmax_boost_sessions (workspace_id, snapshot_date desc);
create index if not exists gmvmax_boost_sessions_item_idx
  on public.gmvmax_boost_sessions (workspace_id, item_id);
create index if not exists gmvmax_boost_sessions_campaign_idx
  on public.gmvmax_boost_sessions (workspace_id, campaign_id);

-- ── 2. Potret harian OTORISASI SPARK (video ter-otorisasi ke ad account) ────
create table if not exists public.gmvmax_spark_auth (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces (id) on delete cascade,
  snapshot_date   date not null,
  advertiser_id   text not null,
  item_id         text not null,               -- video id
  auth_code       text,                        -- KODE SPARK utuh (dari tt_video_list_get)
  spu_id          text,                        -- produk yang tertaut di keranjang
  product_title   text,
  tiktok_name     text,
  ad_auth_status  text,
  auth_end_time   timestamptz,                 -- kapan izin berakhir (±30 hari)
  video_text      text,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  constraint gmvmax_spark_auth_uniq unique (workspace_id, snapshot_date, item_id)
);
create index if not exists gmvmax_spark_auth_ws_date_idx
  on public.gmvmax_spark_auth (workspace_id, snapshot_date desc);
create index if not exists gmvmax_spark_auth_item_idx
  on public.gmvmax_spark_auth (workspace_id, item_id);

-- ── 3. Ambang vonis eksperimen yang masih kosong ────────────────────────────
-- roiFloor sudah ada (migrasi 0033). Tanpa spike_drop_pct, classifyOutcome
-- TIDAK PERNAH bisa memvonis TEMPORARY_SPIKE — padahal itu pola kegagalan
-- paling khas sesi boost (ROI melonjak H+1 lalu rontok). Sengaja NULL sampai
-- pemilik menetapkannya; NULL = tetap konservatif, bukan menebak.
alter table public.gmvmax_settings
  add column if not exists experiment_spike_drop_pct   numeric,   -- usul 0.4
  add column if not exists experiment_winner_persistence integer; -- usul 2

-- ── 4. Eksperimen: asal-usul + penanda TERCAMPUR ────────────────────────────
-- source_approval_id: eksperimen dibuka otomatis dari approval yang EXECUTED
--   (unik → pembuka bersifat idempoten, tak mungkin dobel).
-- contaminated: ada perubahan LAIN yang mendarat di dalam jendela pengukuran
--   (mis. budget campaign dinaikkan lewat Ads Manager di tengah uji boost).
--   Eksperimen tercampur TIDAK dipakai menyimpulkan apa pun — lebih baik
--   kehilangan satu data daripada mempelajari sebab yang keliru.
alter table public.gmvmax_experiments
  add column if not exists source_approval_id uuid references public.gmvmax_approvals (id) on delete set null,
  add column if not exists contaminated       boolean not null default false,
  add column if not exists contamination      jsonb;

create unique index if not exists gmvmax_experiments_source_approval_uniq
  on public.gmvmax_experiments (source_approval_id) where source_approval_id is not null;

-- ── 5. GRANT WAJIB ──────────────────────────────────────────────────────────
-- DB ini tidak punya default privilege: policy RLS TIDAK memberi privilege.
-- Tanpa grant eksplisit, klien authenticated kena "permission denied for table"
-- (pelajaran migrasi 0019 & 0045; gmvmax_action_log sempat 2 bulan diam-diam
-- tak bisa ditulis karena grant-nya terlewat).
grant select, insert, update, delete on public.gmvmax_boost_sessions to authenticated;
grant all    on public.gmvmax_boost_sessions to service_role;
grant select, insert, update, delete on public.gmvmax_spark_auth to authenticated;
grant all    on public.gmvmax_spark_auth to service_role;

-- ── 6. RLS: pemilik workspace penuh, service_role bypass ────────────────────
alter table public.gmvmax_boost_sessions enable row level security;
drop policy if exists gmvmax_boost_sessions_owner_all on public.gmvmax_boost_sessions;
create policy gmvmax_boost_sessions_owner_all on public.gmvmax_boost_sessions
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

alter table public.gmvmax_spark_auth enable row level security;
drop policy if exists gmvmax_spark_auth_owner_all on public.gmvmax_spark_auth;
create policy gmvmax_spark_auth_owner_all on public.gmvmax_spark_auth
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );
