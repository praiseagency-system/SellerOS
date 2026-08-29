\set ON_ERROR_STOP on
\pset pager off

insert into auth.users (id) values ('cccccccc-0000-0000-0000-000000000003');
insert into public.workspaces (id, user_id, name)
  values ('33333333-3333-3333-3333-333333333333','cccccccc-0000-0000-0000-000000000003','WS-C');

create or replace function pg_temp.expect_error(sql text, want text) returns text
language plpgsql as $$
begin
  execute sql;
  return '❌ GAGAL: seharusnya ditolak (' || want || ') tapi berhasil';
exception when others then
  if position(want in SQLERRM) > 0 then return '✅ ditolak: ' || want;
  else return '❌ error lain: ' || SQLERRM; end if;
end $$;

set role authenticated;
set test.uid = 'cccccccc-0000-0000-0000-000000000003';

-- Connect kini ditulis SERVER (service_role), bukan browser.
reset role; set role service_role;
insert into public.tiktok_connections
  (workspace_id, client_id, access_token, refresh_token, expires_at, advertiser_id)
values ('33333333-3333-3333-3333-333333333333','cid','tok-rahasia','ref-rahasia', now() + interval '1 day','adv-1');
select '1. connect ditulis server (service_role) berhasil' as "1. tulis token";
reset role; set role authenticated;

-- Kolom aman tetap terbaca (ini yang dipakai getConnection).
select '2. kolom aman terbaca -> advertiser=' || advertiser_id || ', exp ada' as "2. baca kolom aman"
  from public.tiktok_connections where workspace_id = '33333333-3333-3333-3333-333333333333';

-- Yang HARUS gagal: membaca kolom token.
select pg_temp.expect_error(
  $$select access_token from public.tiktok_connections$$, 'permission denied') as "3. baca access_token";
select pg_temp.expect_error(
  $$select refresh_token from public.tiktok_connections$$, 'permission denied') as "4. baca refresh_token";
-- select('*') — jebakan yang membuat tab Integrasi mati kalau lupa diganti.
select pg_temp.expect_error(
  $$select * from public.tiktok_connections$$, 'permission denied') as "5. select bintang";

-- Alur lain yang masih dipakai UI harus tetap jalan.
update public.tiktok_connections set advertiser_id = 'adv-2', updated_at = now()
  where workspace_id = '33333333-3333-3333-3333-333333333333';
select '6. pilih advertiser tetap bisa -> ' || advertiser_id as "6. update advertiser"
  from public.tiktok_connections where workspace_id = '33333333-3333-3333-3333-333333333333';

-- Upsert token dari browser HARUS ditolak — inilah yang memaksa penyimpanan
-- koneksi pindah ke server (referensi excluded.access_token = membaca kolom).
select pg_temp.expect_error(
  $$insert into public.tiktok_connections (workspace_id, client_id, access_token, expires_at)
    values ('33333333-3333-3333-3333-333333333333','cid','tok-baru', now())
    on conflict (workspace_id) do update set access_token = excluded.access_token$$,
  'permission denied') as "7. upsert token dari browser";

-- service_role (worker) harus tetap bisa membaca token.
reset role;
set role service_role;
select '8. worker (service_role) tetap bisa baca token -> ' || access_token as "8. worker"
  from public.tiktok_connections where workspace_id = '33333333-3333-3333-3333-333333333333';

-- ── Setelah penyimpanan koneksi pindah ke server: browser tak boleh INSERT ──
reset role; set role authenticated;
set test.uid = 'cccccccc-0000-0000-0000-000000000003';
select pg_temp.expect_error(
  $$insert into public.tiktok_connections (workspace_id, client_id, access_token, expires_at)
    values ('33333333-3333-3333-3333-333333333333','c','t', now())$$,
  'permission denied') as "9. browser tak bisa INSERT koneksi";
select pg_temp.expect_error(
  $$update public.tiktok_connections set access_token = 'dibajak'
     where workspace_id = '33333333-3333-3333-3333-333333333333'$$,
  'permission denied') as "10. browser tak bisa menulis token";
delete from public.tiktok_connections where workspace_id = '33333333-3333-3333-3333-333333333333';
select '11. putus koneksi (DELETE) tetap bisa' as "11. delete";
