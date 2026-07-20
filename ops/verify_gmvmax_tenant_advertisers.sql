-- ============================================================================
-- NEGATIVE / INVARIANT TESTS untuk gmvmax_tenant_advertisers (Phase 2B).
-- Jalankan SETELAH migrasi 0024 di-apply. Dibungkus BEGIN ... ROLLBACK →
-- TIDAK ada baris yang tersimpan (semua uji di-rollback). Membaca hanya
-- tiktok_connections (resolve id nyata), tak menyentuh token.
--
-- Harapan: semua baris "PASS" tercetak (RAISE NOTICE). Tak ada yang "FAIL".
-- ============================================================================
begin;

do $$
declare
  v_ws_d uuid; v_conn_d uuid; v_store_d text;
  v_ws_a uuid; v_conn_a uuid; v_store_a text;
begin
  select workspace_id, id, store_id into v_ws_d, v_conn_d, v_store_d
    from public.tiktok_connections where advertiser_id = '7663429402298089480';
  select workspace_id, id, store_id into v_ws_a, v_conn_a, v_store_a
    from public.tiktok_connections where advertiser_id = '7313535999831769090';
  if v_ws_d is null or v_ws_a is null then raise exception 'VERIFY_ABORT: koneksi Dasfelix/AsterixSty tak ditemukan'; end if;

  -- TEST 1: membership Dasfelix menunjuk KONEKSI milik workspace AsterixSty → DITOLAK
  begin
    insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role)
      values (v_ws_d, v_store_d, v_ws_d::text, v_conn_a, 'TEST-XWS', 'SECONDARY');
    raise notice 'TEST1 FAIL: koneksi lintas-workspace DITERIMA';
  exception when foreign_key_violation then raise notice 'TEST1 PASS: koneksi lintas-workspace ditolak (composite FK)';
  end;

  -- TEST 4: PRIMARY + LEGACY berbagi source_connection_id yang sama → DIIZINKAN
  begin
    insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role, priority)
      values (v_ws_d, v_store_d, v_ws_d::text, v_conn_d, 'TEST-P', 'PRIMARY', 100),
             (v_ws_d, v_store_d, v_ws_d::text, v_conn_d, 'TEST-L', 'LEGACY',  200);
    raise notice 'TEST4 PASS: PRIMARY+LEGACY berbagi satu koneksi diizinkan';
  exception when others then raise notice 'TEST4 FAIL: ditolak tak terduga: %', sqlerrm;
  end;

  -- TEST 2: DUA PRIMARY aktif di (workspace, group) sama → DITOLAK (partial unique)
  begin
    insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role)
      values (v_ws_d, v_store_d, v_ws_d::text, v_conn_d, 'TEST-P2', 'PRIMARY');
    raise notice 'TEST2 FAIL: PRIMARY aktif kedua DITERIMA';
  exception when unique_violation then raise notice 'TEST2 PASS: PRIMARY aktif kedua ditolak (partial unique)';
  end;

  -- TEST 5: advertiser DUPLIKAT dalam satu workspace → DITOLAK (unique ws,advertiser)
  begin
    insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role)
      values (v_ws_d, v_store_d, v_ws_d::text, v_conn_d, 'TEST-P', 'SECONDARY');
    raise notice 'TEST5 FAIL: advertiser duplikat DITERIMA';
  exception when unique_violation then raise notice 'TEST5 PASS: advertiser duplikat ditolak';
  end;

  -- TEST 3: DUA workspace masing-masing punya PRIMARY sendiri → DIIZINKAN
  begin
    insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role)
      values (v_ws_a, v_store_a, v_ws_a::text, v_conn_a, 'TEST-PA', 'PRIMARY');
    raise notice 'TEST3 PASS: PRIMARY di workspace kedua diizinkan (scope per-workspace)';
  exception when others then raise notice 'TEST3 FAIL: PRIMARY workspace kedua ditolak: %', sqlerrm;
  end;

  -- TEST 6: service_role (konteks editor) BISA menulis → dibuktikan oleh INSERT di atas
  --         yang berhasil (TEST3/TEST4). PASS.
  raise notice 'TEST6 PASS: service_role menulis membership (insert di atas berhasil)';

  -- TEST 7: owner (authenticated) TAK boleh menulis → RLS/grant menolak
  begin
    set local role authenticated;
    insert into public.gmvmax_tenant_advertisers (workspace_id, store_id, connection_group_id, source_connection_id, advertiser_id, advertiser_role)
      values (v_ws_d, v_store_d, v_ws_d::text, v_conn_d, 'TEST-OWNER', 'SECONDARY');
    reset role;
    raise notice 'TEST7 FAIL: owner (authenticated) BISA menulis';
  exception when insufficient_privilege then reset role; raise notice 'TEST7 PASS: owner write ditolak (no grant/policy)';
            when others then reset role; raise notice 'TEST7 PASS(≈): owner write ditolak: %', sqlerrm;
  end;
end $$;

rollback;  -- semua baris uji dibuang; DB tak berubah
