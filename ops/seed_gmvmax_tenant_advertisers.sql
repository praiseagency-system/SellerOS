-- ============================================================================
-- OPERATIONAL SEED (BUKAN migrasi) — konfigurasi membership advertiser per tenant.
-- Jalankan MANUAL di Supabase SQL Editor SETELAH migrasi 0024 di-apply.
--
-- Aman: idempoten (ON CONFLICT), resolve workspace/store/connection secara
-- DETERMINISTIK dari tiktok_connections lewat advertiser_id yang connected
-- (bukan hardcode UUID), REFUSE bila ambigu, TIDAK menyentuh token, TIDAK
-- menghapus membership. Advertiser ID di bawah = konfigurasi operasional.
--
-- Konfigurasi:
--   AsterixSty : 7313535999831769090 = PRIMARY
--   Dasfelix   : 7663429402298089480 = PRIMARY (akun baru)
--                7214793879483170817 = LEGACY  (akun lama, store & token sama)
-- ============================================================================

do $$
declare
  v_ws uuid; v_store text; v_conn uuid; v_cnt int;
begin
  -- ── Dasfelix: resolve via koneksi pemegang advertiser PRIMARY 7663 ──
  select count(*) into v_cnt from public.tiktok_connections where advertiser_id = '7663429402298089480';
  if v_cnt = 0 then raise exception 'SEED_ABORT: tak ada koneksi utk advertiser 7663 (Connect TikTok dulu)'; end if;
  if v_cnt > 1 then raise exception 'SEED_ABORT: % koneksi ambigu utk advertiser 7663', v_cnt; end if;
  select workspace_id, store_id, id into v_ws, v_store, v_conn
    from public.tiktok_connections where advertiser_id = '7663429402298089480';
  if v_ws is null then raise exception 'SEED_ABORT: koneksi 7663 tanpa workspace'; end if;

  insert into public.gmvmax_tenant_advertisers
    (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role, is_active, priority, metadata)
  values
    (v_ws, v_store, v_ws::text, v_conn, '7663429402298089480', 'PRIMARY', true, 100, jsonb_build_object('advertiser_name', 'Dasfelix (akun baru)')),
    (v_ws, v_store, v_ws::text, v_conn, '7214793879483170817', 'LEGACY',  true, 200, jsonb_build_object('advertiser_name', 'Dasfelix Store (lama)'))
  on conflict (workspace_id, advertiser_id) do update
    set store_id = excluded.store_id, connection_group_id = excluded.connection_group_id,
        source_connection_id = excluded.source_connection_id, advertiser_role = excluded.advertiser_role,
        is_active = excluded.is_active, priority = excluded.priority, metadata = excluded.metadata, updated_at = now();
  raise notice 'Dasfelix membership OK: workspace=% store=% (PRIMARY 7663 + LEGACY 7214, conn=%)', v_ws, v_store, v_conn;

  -- ── AsterixSty: resolve via koneksi pemegang advertiser PRIMARY 7313 ──
  select count(*) into v_cnt from public.tiktok_connections where advertiser_id = '7313535999831769090';
  if v_cnt = 0 then raise exception 'SEED_ABORT: tak ada koneksi utk advertiser 7313'; end if;
  if v_cnt > 1 then raise exception 'SEED_ABORT: % koneksi ambigu utk advertiser 7313', v_cnt; end if;
  select workspace_id, store_id, id into v_ws, v_store, v_conn
    from public.tiktok_connections where advertiser_id = '7313535999831769090';
  if v_ws is null then raise exception 'SEED_ABORT: koneksi 7313 tanpa workspace'; end if;

  insert into public.gmvmax_tenant_advertisers
    (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role, is_active, priority, metadata)
  values
    (v_ws, v_store, v_ws::text, v_conn, '7313535999831769090', 'PRIMARY', true, 100, jsonb_build_object('advertiser_name', 'AsterixSty'))
  on conflict (workspace_id, advertiser_id) do update
    set store_id = excluded.store_id, connection_group_id = excluded.connection_group_id,
        source_connection_id = excluded.source_connection_id, advertiser_role = excluded.advertiser_role,
        is_active = excluded.is_active, priority = excluded.priority, metadata = excluded.metadata, updated_at = now();
  raise notice 'AsterixSty membership OK: workspace=% store=% (PRIMARY 7313, conn=%)', v_ws, v_store, v_conn;
end $$;

-- ── Ringkasan hasil (verifikasi baris) ──────────────────────────────────────
select workspace_id, connection_group_id, store_id, advertiser_id, advertiser_role, is_active, priority
from public.gmvmax_tenant_advertisers
order by workspace_id, priority;

-- ============================================================================
-- VERIFIKASI RLS (jalankan TERPISAH; membuktikan otoritas tulis & baca)
-- ============================================================================
-- 1) Policy yang ada (harap: owner_read + admin_read; TIDAK ada write policy):
--    select policyname, cmd from pg_policies where tablename = 'gmvmax_tenant_advertisers';
-- 2) Grant tabel (harap: authenticated=SELECT saja; service_role=ALL):
--    select grantee, privilege_type from information_schema.role_table_grants
--      where table_name = 'gmvmax_tenant_advertisers' order by grantee, privilege_type;
-- 3) anon: RLS aktif + tanpa grant -> ditolak (0 baris / permission denied).
-- 4) Lintas-workspace: owner A query membership workspace B -> 0 baris (policy scope).
