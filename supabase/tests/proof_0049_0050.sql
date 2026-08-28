\set ON_ERROR_STOP on
\pset pager off

-- Dua pemilik berbeda + satu workspace milik A.
insert into auth.users (id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.workspaces (id, user_id, name) values
  ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-000000000001', 'WS-A');

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

-- ── 0049: gerbang tenant ────────────────────────────────────────────────────
set test.uid = '';
select pg_temp.expect_error($$select public.gmvmax_upload_snapshot(
  '11111111-1111-1111-1111-111111111111','2026-08-01','sig',
  '{"name":"x"}'::jsonb,'[{"campaign_id":"c1"}]'::jsonb)$$,
  'GMVMAX_NOT_AUTHENTICATED') as "1. tanpa sesi";

set test.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
select pg_temp.expect_error($$select public.gmvmax_upload_snapshot(
  '11111111-1111-1111-1111-111111111111','2026-08-01','sig',
  '{"name":"x"}'::jsonb,'[{"campaign_id":"c1"}]'::jsonb)$$,
  'GMVMAX_FORBIDDEN_WORKSPACE') as "2. workspace milik orang lain";

-- ── 0049: jalur sah + versioning ────────────────────────────────────────────
set test.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
select '3. unggah pertama -> ' ||
  (public.gmvmax_upload_snapshot('11111111-1111-1111-1111-111111111111','2026-08-01','sig-v1',
   '{"name":"1 Agu"}'::jsonb,'[{"campaign_id":"c1","cost":"100"}]'::jsonb) ->> 'version')
  || ' (noop=' || (public.gmvmax_upload_snapshot('11111111-1111-1111-1111-111111111111','2026-08-01','sig-v1',
   '{"name":"1 Agu"}'::jsonb,'[{"campaign_id":"c1","cost":"100"}]'::jsonb) ->> 'noop') || ')'
  as "3. unggah + unggah ulang konten sama";

select '4. konten berubah -> versi ' ||
  (public.gmvmax_upload_snapshot('11111111-1111-1111-1111-111111111111','2026-08-01','sig-v2',
   '{"name":"1 Agu"}'::jsonb,'[{"campaign_id":"c1","cost":"250"}]'::jsonb) ->> 'version')
  as "4. versi baru";

-- INTI PERBAIKAN: versi lama TIDAK dihapus, hanya di-supersede.
select '5. baris tanggal itu = ' || count(*) ||
       ', is_current = ' || count(*) filter (where is_current) ||
       ' -> versi lama TETAP ADA (riwayat utuh)' as "5. riwayat dipertahankan"
  from public.gmvmax_imports where snapshot_date = '2026-08-01';

-- Payload kosong tak boleh menghapus snapshot lama.
select pg_temp.expect_error($$select public.gmvmax_upload_snapshot(
  '11111111-1111-1111-1111-111111111111','2026-08-01','sig-kosong',
  '{"name":"1 Agu"}'::jsonb,'[]'::jsonb)$$,
  'GMVMAX_EMPTY_PAYLOAD_NOT_ALLOWED') as "6. file kosong ditolak";

select '7. setelah percobaan kosong, creatives masih ada: ' ||
       (select count(*) from public.gmvmax_creatives c
          join public.gmvmax_imports i on i.id = c.import_id
         where i.snapshot_date = '2026-08-01' and i.is_current)::text
  as "7. data lama utuh";

-- ── 0050: anti cache-poisoning ──────────────────────────────────────────────
insert into public.gmvmax_video_meta (video_id, username, status)
  values ('7412345678901234567', 'akun.asli', 'ok');
insert into public.gmvmax_video_meta (video_id, username, status)
  values ('7412345678901234999', null, 'error');

select pg_temp.expect_error(
  $$insert into public.gmvmax_video_meta (video_id, username, status)
    values ('bukan-angka','x','ok')$$,
  'row-level security') as "8. video_id sampah ditolak";

-- Jalur yang BENAR-BENAR dipakai klien adalah upsert (INSERT ... ON CONFLICT
-- DO UPDATE) — itu yang melempar 42501. UPDATE polos hanya tersaring diam-diam
-- (0 baris), jadi keduanya diuji: yang penting nilainya tak berubah.
select pg_temp.expect_error(
  $$insert into public.gmvmax_video_meta (video_id, username, status)
    values ('7412345678901234567','DIBAJAK-UPSERT','ok')
    on conflict (video_id) do update set username = excluded.username$$,
  'row-level security') as "9a. upsert ke baris ok ditolak";

update public.gmvmax_video_meta set username = 'DIBAJAK-UPDATE'
  where video_id = '7412345678901234567';
select case when username = 'akun.asli'
            then '✅ UPDATE polos tersaring diam-diam, nilai tetap: ' || username
            else '❌ TERBAJAK: ' || username end as "9b. update polos tak berefek"
  from public.gmvmax_video_meta where video_id = '7412345678901234567';

update public.gmvmax_video_meta set username = 'hasil.retry', status = 'ok'
  where video_id = '7412345678901234999';
select '10. retry baris error berhasil -> ' || username as "10. retry sah"
  from public.gmvmax_video_meta where video_id = '7412345678901234999';

select '11. nama akun asli utuh -> ' || username as "11. tak terbajak"
  from public.gmvmax_video_meta where video_id = '7412345678901234567';
