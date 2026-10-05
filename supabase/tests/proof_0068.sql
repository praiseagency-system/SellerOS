-- ════════════════════════════════════════════════════════════════════════════
-- Bukti migrasi 0068 — gmvmax_campaign_daily (ringkasan harian per campaign).
--
-- YANG DIBUKTIKAN:
--   1. Angkanya benar: dijumlah per (tanggal, campaign), porsi video terpisah,
--      baris tanpa campaign_id diabaikan.
--   2. Hanya versi CURRENT yang dijumlah (versi lama snapshot tak dobel-hitung).
--   3. Rentang tanggal dipatuhi.
--   4. ISOLASI: orang luar workspace mendapat 0 baris; anon ditolak.
--   5. Cukup cepat pada volume nyata (±32 rb baris — Dasfelix 34 hari = 30.540)
--      di bawah RLS pemanggil. Fungsi ini SECURITY INVOKER, jadi policy creatives
--      dievaluasi per baris; batas statement Supabase untuk authenticated 8 detik.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off
create or replace function pg_temp.expect_error(sql text, want text) returns text
language plpgsql as $$
begin execute sql; return '❌ GAGAL: seharusnya ditolak (' || want || ')';
exception when others then
  if position(want in SQLERRM) > 0 then return '✅ ditolak: ' || want;
  else return '❌ error lain: ' || SQLERRM; end if; end $$;

insert into auth.users (id) values
  ('d6800000-0000-0000-0000-000000000001'),   -- owner
  ('d6800000-0000-0000-0000-000000000002');   -- orang luar
insert into public.profiles (id, email) values
  ('d6800000-0000-0000-0000-000000000001','owner68@contoh.com'),
  ('d6800000-0000-0000-0000-000000000002','luar68@contoh.com')
on conflict (id) do nothing;

set role authenticated;
set test.uid = 'd6800000-0000-0000-0000-000000000001';
insert into public.workspaces (id, user_id, name)
values ('d6890000-0000-0000-0000-000000000009','d6800000-0000-0000-0000-000000000001','WS-0068');

-- Data ditulis worker (service_role), persis jalur produksi.
reset role; set role service_role;
insert into public.gmvmax_imports (id, workspace_id, name, snapshot_date, version, is_current) values
  ('d6810000-0000-0000-0000-000000000001','d6890000-0000-0000-0000-000000000009','1 Okt','2026-10-01',2,true),
  ('d6810000-0000-0000-0000-000000000002','d6890000-0000-0000-0000-000000000009','1 Okt v1','2026-10-01',1,false),
  ('d6810000-0000-0000-0000-000000000003','d6890000-0000-0000-0000-000000000009','2 Okt','2026-10-02',1,true),
  ('d6810000-0000-0000-0000-000000000004','d6890000-0000-0000-0000-000000000009','1 Agu','2026-08-01',1,true);
-- video_id berbeda tiap baris: identitas kreatif unik per (import, campaign, produk, video).
insert into public.gmvmax_creatives (import_id, campaign_id, video_id, creative_type, cost, gross_revenue, sku_orders) values
  ('d6810000-0000-0000-0000-000000000001','A','v1','Video',        40, 300, 1),
  ('d6810000-0000-0000-0000-000000000001','A','N/A','Product card', 60, 600, 2),
  ('d6810000-0000-0000-0000-000000000001','B','N/A','Product card', 50, 100, 1),
  ('d6810000-0000-0000-0000-000000000001',null,'v9','Video',      999, 999, 9),   -- tanpa campaign → diabaikan
  ('d6810000-0000-0000-0000-000000000002','A','v1','Video',       777, 777, 7),   -- versi LAMA → tak boleh ikut
  ('d6810000-0000-0000-0000-000000000003','A','v1','Video',        10, null, null),
  ('d6810000-0000-0000-0000-000000000004','A','v1','Video',       555, 555, 5);   -- di luar rentang

reset role; set role authenticated;
set test.uid = 'd6800000-0000-0000-0000-000000000001';

select case when (select count(*) from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-09-25','2026-10-05')) = 3
              and exists (select 1 from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-09-25','2026-10-05')
                           where snapshot_date='2026-10-01' and campaign_id='A'
                             and cost=100 and revenue=900 and orders=3 and video_cost=40 and video_revenue=300)
            then '✅ 0068-1. jumlah per (tanggal, campaign) benar; porsi video terpisah; baris tanpa campaign diabaikan'
            else '❌ 0068-1. jumlah salah' end as "1. angka";

select case when not exists (select 1 from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-09-25','2026-10-05') where cost >= 777)
            then '✅ 0068-2. versi lama snapshot tidak ikut dijumlah'
            else '❌ 0068-2. versi lama ikut terhitung (dobel)' end as "2. hanya current";

select case when (select coalesce(sum(cost),0) from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-09-25','2026-10-05')) = 160
              and (select revenue from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-10-02','2026-10-02')) = 0
            then '✅ 0068-3. rentang tanggal dipatuhi; nilai kosong jadi 0'
            else '❌ 0068-3. rentang/null salah' end as "3. rentang";

-- ISOLASI: orang luar memanggil fungsi yang sama untuk workspace orang lain.
set test.uid = 'd6800000-0000-0000-0000-000000000002';
select case when (select count(*) from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-01-01','2026-12-31')) = 0
            then '✅ 0068-4a. orang luar melihat 0 baris'
            else '❌ 0068-4a. BOCOR: orang luar mendapat baris workspace lain' end as "4a. isolasi";
reset role; set role anon;
select pg_temp.expect_error(
  $$select count(*) from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2026-01-01','2026-12-31')$$,
  'permission denied') as "4b. anon";

-- VOLUME: 40 hari × 800 baris = 32.000 baris, dipanggil sebagai anggota biasa.
reset role; set role service_role;
insert into public.gmvmax_imports (id, workspace_id, name, snapshot_date, version, is_current)
select ('d6820000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'd6890000-0000-0000-0000-000000000009',
       'vol ' || g, date '2025-01-01' + g, 1, true
from generate_series(1, 40) g;
insert into public.gmvmax_creatives (import_id, campaign_id, video_id, creative_type, cost, gross_revenue, sku_orders)
select ('d6820000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'C' || (n % 8), 'v' || n,
       case when n % 3 = 0 then 'Product card' else 'Video' end, 100, 900, 1
from generate_series(1, 40) g, generate_series(1, 800) n;
reset role;  -- analyze butuh pemilik tabel
analyze public.gmvmax_imports; analyze public.gmvmax_creatives;

set role authenticated;
set test.uid = 'd6800000-0000-0000-0000-000000000001';
do $$
declare t0 timestamptz := clock_timestamp(); n int; c numeric; ms numeric;
begin
  select count(*), sum(cost) into n, c
    from public.gmvmax_campaign_daily('d6890000-0000-0000-0000-000000000009','2025-01-01','2025-03-01');
  ms := round(extract(epoch from clock_timestamp() - t0) * 1000);
  if n = 320 and c = 3200000 and ms < 4000 then
    raise notice '✅ 0068-5. 32.000 baris diringkas jadi % baris dalam % ms (di bawah RLS pemanggil)', n, ms;
  else
    raise notice '❌ 0068-5. volume: % baris, cost %, % ms', n, c, ms;
  end if;
end $$;
