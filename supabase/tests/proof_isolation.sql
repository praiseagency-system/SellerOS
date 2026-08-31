-- ════════════════════════════════════════════════════════════════════════════
-- GERBANG 3 — bukti isolasi tenant menyeluruh
--
-- KENAPA ADA: migrasi 0052/0053 menulis ulang 68 policy di 34 tabel, dari
-- `user_id = auth.uid()` menjadi berbasis keanggotaan. Tiap migrasi memang
-- dibuktikan perilakunya saat dibuat, tapi bukti itu menguap — tak ada yang
-- bisa menjalankannya lagi setelah perubahan berikutnya. Sejak pendaftaran
-- dibuka untuk umum (2026-08-31), orang asing bisa membuat akun; satu policy
-- yang salah arah bukan lagi risiko teoretis.
--
-- YANG DIBUKTIKAN, untuk SETIAP tabel bisnis (bukan sampel):
--   1. Orang luar melihat 0 baris
--   2. Anggota melihat barisnya
--   3. Viewer bisa membaca tapi TIDAK bisa mengubah/menghapus
--   4. Orang luar tidak bisa mengubah/menghapus
--
-- CATATAN PENTING soal cara RLS menolak: INSERT yang melanggar policy melempar
-- galat 42501, tetapi UPDATE dan DELETE TIDAK — keduanya hanya menyaring baris
-- dan melaporkan "0 baris terpengaruh" tanpa galat apa pun. Karena itu uji tulis
-- di bawah memeriksa JUMLAH BARIS TERPENGARUH, bukan ada/tidaknya exception.
-- Memeriksa exception di sini akan selalu "lulus" dan tak membuktikan apa-apa.
--
-- Baris uji diisi secara generik dari skema: kolom wajib diisi menurut tipenya,
-- dan kolom ber-CHECK bergaya enum diisi dengan nilai sah yang DIBACA dari
-- definisi constraint-nya. Jadi tabel atau enum baru di migrasi berikutnya ikut
-- teruji otomatis, tanpa berkas ini perlu disunting.
-- ════════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
\pset pager off

create or replace function pg_temp.isi(tbl text, col text, ty text) returns text
language plpgsql as $fn$
declare def text; lit text;
begin
  select pg_get_constraintdef(c.oid) into def
  from pg_constraint c
  where c.conrelid = ('public.'||tbl)::regclass and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ~ ('\m'||col||'\M')
  limit 1;

  if ty = 'jsonb' then
    return case when def is not null and def ~* 'array'
           then quote_literal('[]')||'::jsonb' else quote_literal('{}')||'::jsonb' end;
  end if;
  if def is not null then
    lit := (regexp_match(def, $re$'([^']+)'$re$))[1];
    if lit is not null and lit not like '%::%' then return quote_literal(lit); end if;
  end if;
  return case
    when ty like 'timestamp%' then 'now()'
    when ty = 'date'          then 'current_date'
    when ty = 'uuid'          then 'gen_random_uuid()'
    when ty in ('integer','bigint','smallint','numeric','double precision') then '1'
    when ty = 'boolean'       then 'false'
    else quote_literal('12345678901')   -- lolos pola video_id numerik sekaligus teks biasa
  end;
end $fn$;

-- Daftar tabel yang disapu. gmvmax_video_meta SENGAJA tidak ikut: ia cache
-- lintas-tenant yang memang boleh dibaca siapa saja (migrasi 0050), dan diuji
-- terpisah di bagian 6 agar sifat globalnya tercatat sebagai keputusan, bukan
-- kebocoran yang terlewat.
create or replace view pg_temp.tabel_tenant as
  select c.relname::text as t
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and exists (select 1 from information_schema.columns k
                where k.table_name = c.relname and k.column_name = 'workspace_id')
    and c.relname <> 'workspace_members';   -- diuji khusus di bagian 5

-- ── SIAPAN ────────────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11110000-0000-0000-0000-000000000001','owner@a.id'),
  ('11110000-0000-0000-0000-000000000002','viewer@a.id'),
  ('11110000-0000-0000-0000-000000000003','luar@b.id')
on conflict do nothing;

do $seed$
declare t record; col record; cols text; vals text;
  ws_a uuid := '22220000-0000-0000-0000-00000000000a';
  ws_b uuid := '22220000-0000-0000-0000-00000000000b';
  per  uuid := '33330000-0000-0000-0000-000000000001';
  imp  uuid := '33330000-0000-0000-0000-000000000002';
begin
  -- Disemai sebagai superuser: sengaja TIDAK lewat policy yang sedang diuji,
  -- supaya bukti tidak bergantung pada hal yang hendak dibuktikan.
  insert into public.workspaces (id, user_id, name) values
    (ws_a,'11110000-0000-0000-0000-000000000001','WS A'),
    (ws_b,'11110000-0000-0000-0000-000000000003','WS B');
  insert into public.workspace_members (workspace_id, user_id, role) values
    (ws_a,'11110000-0000-0000-0000-000000000002','viewer')
  on conflict do nothing;

  for t in select tt.t from pg_temp.tabel_tenant tt order by 1 loop
    cols := 'workspace_id'; vals := quote_literal(ws_a)||'::uuid';
    for col in
      select a.attname, format_type(a.atttypid, a.atttypmod) as ty
      from pg_attribute a
      where a.attrelid = ('public.'||t.t)::regclass and a.attnum > 0 and not a.attisdropped
        and a.attnotnull
        and not exists (select 1 from pg_attrdef d where d.adrelid = a.attrelid and d.adnum = a.attnum)
        and a.attname <> 'workspace_id'
      order by a.attnum
    loop
      cols := cols||', '||quote_ident(col.attname);
      vals := vals||', '||pg_temp.isi(t.t, col.attname, col.ty);
    end loop;
    execute format('insert into public.%I (%s) values (%s)', t.t, cols, vals);
  end loop;

  -- Dua tabel menumpang izin induknya, bukan workspace_id sendiri.
  update public.periods set id = per where workspace_id = ws_a;
  insert into public.products (period_id, name) values (per, 'Barang A');
  update public.gmvmax_imports set id = imp where workspace_id = ws_a;
  insert into public.gmvmax_creatives (import_id, video_id) values (imp, '12345678901');
end $seed$;

-- ── 1–4. SAPUAN SELURUH TABEL TENANT ──────────────────────────────────────
do $sweep$
declare
  t text; n bigint; total int := 0;
  buta int := 0; lihat int := 0; tulis int := 0; luar_tulis int := 0; priv int := 0;
  bocor text := ''; buta_salah text := ''; viewer_nulis text := ''; luar_nulis text := '';
  OWNER  constant text := '11110000-0000-0000-0000-000000000001';
  VIEWER constant text := '11110000-0000-0000-0000-000000000002';
  LUAR   constant text := '11110000-0000-0000-0000-000000000003';
begin
  for t in select tt.t from pg_temp.tabel_tenant tt union all
           select 'products' union all select 'gmvmax_creatives' order by 1
  loop
    total := total + 1;
    execute 'set role authenticated';

    -- (1) orang luar harus buta
    perform set_config('test.uid', LUAR, true);
    execute format('select count(*) from public.%I', t) into n;
    if n = 0 then buta := buta + 1; else bocor := bocor || E'\n     ' || t || ' → ' || n || ' baris'; end if;

    -- (4) orang luar tak boleh menghapus. Ada DUA cara yang sah untuk menahan:
    --     RLS menyaring diam-diam (0 baris, tanpa galat), atau privilege dicabut
    --     sama sekali (galat "permission denied", mis. workspace_invites sejak
    --     0058). Keduanya lulus; yang gagal hanyalah baris yang benar-benar
    --     terhapus.
    begin
      execute format('delete from public.%I', t);
      get diagnostics n = row_count;
    exception when insufficient_privilege then n := 0; priv := priv + 1;
    end;
    if n = 0 then luar_tulis := luar_tulis + 1; else luar_nulis := luar_nulis || E'\n     ' || t || ' → ' || n || ' baris terhapus'; end if;

    -- (2) anggota harus melihat
    perform set_config('test.uid', VIEWER, true);
    execute format('select count(*) from public.%I', t) into n;
    if n > 0 then lihat := lihat + 1; else buta_salah := buta_salah || E'\n     ' || t; end if;

    -- (3) viewer boleh baca, tak boleh hapus — dua mekanisme sah, sama seperti (4)
    begin
      execute format('delete from public.%I', t);
      get diagnostics n = row_count;
    exception when insufficient_privilege then n := 0;
    end;
    if n = 0 then tulis := tulis + 1; else viewer_nulis := viewer_nulis || E'\n     ' || t || ' → ' || n || ' baris terhapus'; end if;

    execute 'reset role';
  end loop;

  raise notice '%', case when bocor = '' then format('✅ 1. orang luar melihat 0 baris di %s/%s tabel', buta, total)
                    else format('❌ 1. BOCOR ke orang luar (%s/%s):%s', total-buta, total, bocor) end;
  raise notice '%', case when buta_salah = '' then format('✅ 2. anggota melihat datanya di %s/%s tabel', lihat, total)
                    else format('❌ 2. anggota TAK bisa membaca (%s/%s):%s', total-lihat, total, buta_salah) end;
  raise notice '%', case when viewer_nulis = '' then format('✅ 3. viewer tak bisa menghapus di %s/%s tabel', tulis, total)
                    else format('❌ 3. viewer BISA menghapus (%s/%s):%s', total-tulis, total, viewer_nulis) end;
  raise notice '%', case when luar_nulis = '' then format('✅ 4. orang luar tak bisa menghapus di %s/%s tabel (%s di antaranya ditahan privilege, bukan hanya RLS)', luar_tulis, total, priv)
                    else format('❌ 4. orang luar BISA menghapus (%s/%s):%s', total-luar_tulis, total, luar_nulis) end;
end $sweep$;

-- ── 5. TABEL KEANGGOTAAN & WORKSPACE ──────────────────────────────────────
set role authenticated;
set test.uid = '11110000-0000-0000-0000-000000000003';   -- orang luar
select case when count(*) = 0 then '✅ 5a. orang luar tak melihat workspace milik orang lain'
            else '❌ 5a. workspace orang lain terlihat' end as "5a"
  from public.workspaces where id = '22220000-0000-0000-0000-00000000000a';
select case when count(*) = 0 then '✅ 5b. orang luar tak melihat daftar anggota workspace lain'
            else '❌ 5b. daftar anggota bocor' end as "5b"
  from public.workspace_members where workspace_id = '22220000-0000-0000-0000-00000000000a';
select case when count(*) = 0 then '✅ 5c. orang luar tak melihat undangan workspace lain'
            else '❌ 5c. undangan bocor' end as "5c"
  from public.workspace_invites where workspace_id = '22220000-0000-0000-0000-00000000000a';

set test.uid = '11110000-0000-0000-0000-000000000002';   -- viewer
update public.workspaces set name = 'Dibajak' where id = '22220000-0000-0000-0000-00000000000a';
select case when (select name from public.workspaces where id = '22220000-0000-0000-0000-00000000000a') = 'WS A'
            then '✅ 5d. viewer tak bisa mengubah nama workspace (RLS menyaring, tanpa galat)'
            else '❌ 5d. viewer bisa mengubah workspace' end as "5d";

-- ── 6. gmvmax_video_meta: global SECARA SENGAJA ───────────────────────────
-- Bukan kebocoran: cache judul/penulis video TikTok dipakai lintas-tenant
-- (migrasi 0050). Diuji agar sifatnya tercatat — dan agar pagar anti-racunnya
-- tetap berdiri kalau suatu hari ada yang melonggarkannya.
reset role; set role service_role;
insert into public.gmvmax_video_meta (video_id, username, status)
values ('99999999999','asli','ok') on conflict do nothing;
reset role; set role authenticated;
set test.uid = '11110000-0000-0000-0000-000000000003';
select case when count(*) = 1 then '✅ 6a. cache video memang global — terbaca lintas tenant (disengaja)'
            else '❌ 6a. cache video tak terbaca — 0050 berubah?' end as "6a"
  from public.gmvmax_video_meta where video_id = '99999999999';

update public.gmvmax_video_meta set username = 'diracuni' where video_id = '99999999999';
select case when (select username from public.gmvmax_video_meta where video_id = '99999999999') = 'asli'
            then '✅ 6b. baris cache berstatus ok tak bisa ditimpa'
            else '❌ 6b. cache berstatus ok BISA diracuni' end as "6b";

reset role;
