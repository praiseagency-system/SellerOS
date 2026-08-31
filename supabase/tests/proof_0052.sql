\set ON_ERROR_STOP on
\pset pager off

-- Dua pemilik + satu calon anggota.
insert into auth.users (id) values
  ('dddddddd-0000-0000-0000-000000000004'),
  ('eeeeeeee-0000-0000-0000-000000000005'),
  ('ffffffff-0000-0000-0000-000000000006');
insert into public.workspaces (id, user_id, name) values
  ('44444444-4444-4444-4444-444444444444','dddddddd-0000-0000-0000-000000000004','WS-D');

-- Backfill dijalankan lagi (idempoten) supaya workspace baru ikut terdaftar.
insert into public.workspace_members (workspace_id, user_id, role)
select w.id, w.user_id, 'owner' from public.workspaces w
on conflict (workspace_id, user_id) do nothing;

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

-- Pemilik lama otomatis jadi owner (inti backfill).
set test.uid = 'dddddddd-0000-0000-0000-000000000004';
select case when public.is_ws_member('44444444-4444-4444-4444-444444444444')
             and public.can_ws_write('44444444-4444-4444-4444-444444444444')
             and public.is_ws_owner('44444444-4444-4444-4444-444444444444')
       then '✅ pemilik lama = owner penuh' else '❌ backfill meleset' end as "1. backfill pemilik";

-- Orang luar tidak dapat apa-apa.
set test.uid = 'ffffffff-0000-0000-0000-000000000006';
select case when not public.is_ws_member('44444444-4444-4444-4444-444444444444')
             and not public.can_ws_write('44444444-4444-4444-4444-444444444444')
             and not public.is_ws_owner('44444444-4444-4444-4444-444444444444')
       then '✅ orang luar tak dapat akses' else '❌ orang luar bocor' end as "2. orang luar";

-- Tambah anggota (lewat service_role, meniru jalur undangan server).
reset role; set role service_role;
insert into public.workspace_members (workspace_id, user_id, role)
values ('44444444-4444-4444-4444-444444444444','eeeeeeee-0000-0000-0000-000000000005','viewer');
reset role; set role authenticated;

-- Viewer: boleh baca, TIDAK boleh tulis, bukan owner.
set test.uid = 'eeeeeeee-0000-0000-0000-000000000005';
select case when public.is_ws_member('44444444-4444-4444-4444-444444444444')
             and not public.can_ws_write('44444444-4444-4444-4444-444444444444')
             and not public.is_ws_owner('44444444-4444-4444-4444-444444444444')
       then '✅ viewer: baca ya, tulis tidak' else '❌ peran viewer salah' end as "3. viewer";

-- Naikkan jadi editor → boleh tulis, tetap bukan owner.
reset role; set role service_role;
update public.workspace_members set role = 'editor'
 where workspace_id = '44444444-4444-4444-4444-444444444444'
   and user_id = 'eeeeeeee-0000-0000-0000-000000000005';
reset role; set role authenticated;
set test.uid = 'eeeeeeee-0000-0000-0000-000000000005';
select case when public.can_ws_write('44444444-4444-4444-4444-444444444444')
             and not public.is_ws_owner('44444444-4444-4444-4444-444444444444')
       then '✅ editor: tulis ya, owner tidak' else '❌ peran editor salah' end as "4. editor";

-- Anggota boleh melihat sesama anggota; orang luar tidak melihat apa pun.
select '5. anggota melihat ' || count(*) || ' baris keanggotaan' as "5. baca anggota"
  from public.workspace_members where workspace_id = '44444444-4444-4444-4444-444444444444';
set test.uid = 'ffffffff-0000-0000-0000-000000000006';
select case when count(*) = 0 then '✅ orang luar melihat 0 baris'
            else '❌ bocor ' || count(*) || ' baris' end as "6. orang luar tak lihat"
  from public.workspace_members;

-- Browser TIDAK boleh menambah dirinya sendiri ke workspace mana pun.
-- Sejak 0058 penolakannya kembali datang dari PRIVILEGE ("permission denied"),
-- bukan dari RLS. Bedanya penting: privilege adalah lapis luar yang tetap
-- berdiri walau suatu hari ada yang menambahkan policy tulis tanpa berpikir
-- panjang. Kalau assertion ini suatu saat berubah jadi "row-level security",
-- artinya pencabutan di 0058 hilang — bukan sekadar pesan yang berganti.
select pg_temp.expect_error(
  $$insert into public.workspace_members (workspace_id, user_id, role)
    values ('44444444-4444-4444-4444-444444444444','ffffffff-0000-0000-0000-000000000006','owner')$$,
  'permission denied') as "7. tak bisa menyusup jadi anggota";

-- Peran di luar daftar ditolak constraint.
reset role; set role service_role;
select pg_temp.expect_error(
  $$insert into public.workspace_members (workspace_id, user_id, role)
    values ('44444444-4444-4444-4444-444444444444','ffffffff-0000-0000-0000-000000000006','superadmin')$$,
  'violates check constraint') as "8. peran ngawur ditolak";
