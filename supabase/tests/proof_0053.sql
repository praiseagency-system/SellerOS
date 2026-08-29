\set ON_ERROR_STOP on
\pset pager off
create or replace function pg_temp.expect_error(sql text, want text) returns text
language plpgsql as $$
begin execute sql; return '❌ GAGAL: seharusnya ditolak (' || want || ')';
exception when others then
  if position(want in SQLERRM) > 0 then return '✅ ditolak: ' || want;
  else return '❌ error lain: ' || SQLERRM; end if; end $$;

insert into auth.users (id) values
  ('a1000000-0000-0000-0000-000000000001'),  -- pemilik lama
  ('a2000000-0000-0000-0000-000000000002'),  -- viewer
  ('a3000000-0000-0000-0000-000000000003'),  -- editor
  ('a4000000-0000-0000-0000-000000000004');  -- orang luar
grant select, insert, update, delete on public.workspaces, public.calc_products,
  public.periods, public.products, public.gmvmax_imports, public.gmvmax_creatives,
  public.tiktok_connections to authenticated;

set role authenticated;

-- ── 1. MEMBUAT WORKSPACE (jebakan terbesar: pembuat belum jadi anggota) ─────
set test.uid = 'a1000000-0000-0000-0000-000000000001';
insert into public.workspaces (id, user_id, name)
values ('b1000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','WS-Baru');
select case when public.is_ws_owner('b1000000-0000-0000-0000-000000000001')
       then '✅ buat workspace berhasil & pembuat langsung jadi owner (trigger jalan)'
       else '❌ trigger keanggotaan tidak jalan' end as "1. buat workspace";

-- ── 2. AKSES PEMILIK TIDAK BERUBAH ─────────────────────────────────────────
insert into public.calc_products (workspace_id, name) values ('b1000000-0000-0000-0000-000000000001','Produk A');
insert into public.periods (id, workspace_id, name) values ('c1000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Periode A');
insert into public.products (period_id, name) values ('c1000000-0000-0000-0000-000000000001','Barang A');
select '✅ pemilik tetap bisa tulis-baca (' || count(*) || ' produk)' as "2. akses pemilik"
  from public.calc_products where workspace_id='b1000000-0000-0000-0000-000000000001';

-- ── 3. ORANG LUAR TETAP BUTA ───────────────────────────────────────────────
set test.uid = 'a4000000-0000-0000-0000-000000000004';
select case when count(*)=0 then '✅ orang luar melihat 0 baris' else '❌ bocor' end as "3. orang luar"
  from public.calc_products;
select pg_temp.expect_error(
  $$insert into public.calc_products (workspace_id, name)
    values ('b1000000-0000-0000-0000-000000000001','Sisipan')$$,
  'row-level security') as "4. orang luar tak bisa menulis";

-- ── 5. VIEWER: baca ya, tulis tidak ────────────────────────────────────────
reset role; set role service_role;
insert into public.workspace_members (workspace_id, user_id, role)
values ('b1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','viewer'),
       ('b1000000-0000-0000-0000-000000000001','a3000000-0000-0000-0000-000000000003','editor');
reset role; set role authenticated;

set test.uid = 'a2000000-0000-0000-0000-000000000002';
select case when count(*)=1 then '✅ viewer bisa MEMBACA data workspace' else '❌ viewer tak bisa baca' end as "5. viewer baca"
  from public.calc_products where workspace_id='b1000000-0000-0000-0000-000000000001';
select pg_temp.expect_error(
  $$insert into public.calc_products (workspace_id, name)
    values ('b1000000-0000-0000-0000-000000000001','Oleh viewer')$$,
  'row-level security') as "6. viewer tak bisa menulis";
-- CATATAN: untuk DELETE/UPDATE, RLS MENYARING BARIS diam-diam (0 baris kena,
-- tanpa error) — beda dari INSERT yang melempar. Jadi yang dibuktikan bukan
-- "ada error", melainkan DATANYA TETAP UTUH.
delete from public.calc_products where workspace_id='b1000000-0000-0000-0000-000000000001';
reset role; set role service_role;
select case when count(*) = 1 then '✅ hapus oleh viewer tak berefek — data utuh'
            else '❌ viewer BERHASIL menghapus (' || count(*) || ' tersisa)' end as "7. viewer tak bisa menghapus"
  from public.calc_products where workspace_id='b1000000-0000-0000-0000-000000000001';
reset role; set role authenticated; set test.uid = 'a2000000-0000-0000-0000-000000000002';

-- ── 8. EDITOR: boleh tulis, tapi bukan owner ───────────────────────────────
set test.uid = 'a3000000-0000-0000-0000-000000000003';
insert into public.calc_products (workspace_id, name) values ('b1000000-0000-0000-0000-000000000001','Oleh editor');
select '✅ editor bisa menulis' as "8. editor tulis";
select pg_temp.expect_error(
  $$insert into public.tiktok_connections (workspace_id, client_id, access_token, expires_at)
    values ('b1000000-0000-0000-0000-000000000001','c','t', now())$$,
  'row-level security') as "9. editor tak bisa ubah koneksi TikTok (owner-only)";

-- ── 10. Tabel lewat relasi induk ikut terbaca anggota ──────────────────────
set test.uid = 'a2000000-0000-0000-0000-000000000002';
select case when count(*)=1 then '✅ viewer membaca products (lewat periods)' else '❌ join RLS meleset' end as "10. join products"
  from public.products;

-- ── 11. Anggota melihat workspace-nya di daftar ────────────────────────────
select case when count(*)=1 then '✅ anggota melihat workspace di daftarnya' else '❌ workspace tak terlihat anggota' end as "11. daftar workspace"
  from public.workspaces where id='b1000000-0000-0000-0000-000000000001';

-- ── 12. Viewer tak bisa mengganti nama / menghapus workspace ───────────────
update public.workspaces set name='dibajak' where id='b1000000-0000-0000-0000-000000000001';
reset role; set role service_role;
select case when name = 'WS-Baru' then '✅ ubah workspace oleh viewer tak berefek — nama utuh'
            else '❌ viewer BERHASIL mengubah nama jadi: ' || name end as "12. viewer tak bisa ubah workspace"
  from public.workspaces where id='b1000000-0000-0000-0000-000000000001';
