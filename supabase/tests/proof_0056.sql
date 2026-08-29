\set ON_ERROR_STOP on
\pset pager off
create or replace function pg_temp.expect_error(sql text, want text) returns text
language plpgsql as $$
begin execute sql; return '❌ GAGAL: seharusnya ditolak (' || want || ')';
exception when others then
  if position(want in SQLERRM) > 0 then return '✅ ditolak: ' || want;
  else return '❌ error lain: ' || SQLERRM; end if; end $$;

insert into auth.users (id) values
  ('b1000000-0000-0000-0000-000000000001'),   -- owner
  ('b2000000-0000-0000-0000-000000000002');   -- anggota (viewer)
insert into public.profiles (id, email) values
  ('b1000000-0000-0000-0000-000000000001','owner@contoh.com'),
  ('b2000000-0000-0000-0000-000000000002','viewer@contoh.com')
on conflict (id) do nothing;
grant select, insert, update on public.profiles to authenticated;

set role authenticated;
set test.uid = 'b1000000-0000-0000-0000-000000000001';
insert into public.workspaces (id, user_id, name)
values ('b9000000-0000-0000-0000-000000000009','b1000000-0000-0000-0000-000000000001','WS-Brand');

-- Owner mengisi brand.
update public.workspaces set brand_name = 'Asterixsty', brand_logo = 'data:image/jpeg;base64,AAA'
 where id = 'b9000000-0000-0000-0000-000000000009';
select '✅ owner bisa mengisi brand -> ' || brand_name as "1. owner isi brand"
  from public.workspaces where id='b9000000-0000-0000-0000-000000000009';

-- Owner mengisi profilnya sendiri.
update public.profiles set full_name='Pemilik', phone='0811', avatar_url='data:image/jpeg;base64,BBB'
 where id = 'b1000000-0000-0000-0000-000000000001';
select '✅ profil tersimpan -> ' || full_name as "2. profil sendiri"
  from public.profiles where id='b1000000-0000-0000-0000-000000000001';

-- Tambah anggota viewer (lewat server, seperti jalur undangan).
reset role; set role service_role;
insert into public.workspace_members (workspace_id, user_id, role)
values ('b9000000-0000-0000-0000-000000000009','b2000000-0000-0000-0000-000000000002','viewer');
reset role; set role authenticated;

-- INTI PERBAIKAN: anggota MELIHAT brand workspace — inilah yang dulu mustahil
-- karena brand hanya ada di localStorage si pengundang.
set test.uid = 'b2000000-0000-0000-0000-000000000002';
select case when brand_name = 'Asterixsty' and brand_logo is not null
            then '✅ anggota MELIHAT brand & logo workspace'
            else '❌ anggota tak melihat brand' end as "3. anggota lihat brand"
  from public.workspaces where id='b9000000-0000-0000-0000-000000000009';

-- Tapi tak boleh mengubahnya (RLS menyaring diam-diam untuk UPDATE).
update public.workspaces set brand_name='dibajak' where id='b9000000-0000-0000-0000-000000000009';
reset role; set role service_role;
select case when brand_name = 'Asterixsty' then '✅ anggota tak bisa mengubah brand — nilai utuh'
            else '❌ brand berubah jadi: ' || brand_name end as "4. anggota tak ubah brand"
  from public.workspaces where id='b9000000-0000-0000-0000-000000000009';

-- Profil orang lain tak bisa disentuh.
reset role; set role authenticated;
set test.uid = 'b2000000-0000-0000-0000-000000000002';
update public.profiles set full_name='dibajak' where id='b1000000-0000-0000-0000-000000000001';
reset role; set role service_role;
select case when full_name = 'Pemilik' then '✅ profil orang lain tak bisa diubah'
            else '❌ profil berubah jadi: ' || full_name end as "5. profil orang lain"
  from public.profiles where id='b1000000-0000-0000-0000-000000000001';
