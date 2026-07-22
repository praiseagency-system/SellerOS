-- ============================================================================
-- VERIFICATION (BUKAN migrasi) untuk 0026_gmvmax_daily_facts + 0027_gmvmax_skill_outputs.
-- ROLLBACK-SAFE: seluruh DML dibungkus BEGIN…ROLLBACK → tidak mengubah data.
-- Jalankan MANUAL di Supabase SQL Editor SETELAH kedua migrasi di-apply.
-- Membuktikan: constraint dedup deterministik, invariant no-execution, dan
-- (via query komentar per-role) isolasi RLS. TIDAK menyentuh token/payload MCP.
-- ============================================================================

-- ── A. Constraint & invariant (rollback-safe, dijalankan sebagai service_role) ─
begin;
do $$
declare v_ws uuid;
begin
  select id into v_ws from public.workspaces limit 1;
  if v_ws is null then raise notice 'SKIP: tak ada workspace'; return; end if;

  -- (13/14) dedup deterministik: signature sama → tabrakan unique (idempoten).
  insert into public.gmvmax_daily_facts
    (workspace_id, store_id, fact_date, timezone, currency, facts, deterministic_signature, builder_version, generated_at)
  values (v_ws, 'store-x', date '2020-01-01', 'Asia/Jakarta', 'IDR', '[]'::jsonb, 'sha256:test', 'v0', now());
  begin
    insert into public.gmvmax_daily_facts
      (workspace_id, store_id, fact_date, timezone, currency, facts, deterministic_signature, builder_version, generated_at)
    values (v_ws, 'store-x', date '2020-01-01', 'Asia/Jakarta', 'IDR', '[]'::jsonb, 'sha256:test', 'v0', now());
    raise exception 'FAIL: duplikat signature seharusnya ditolak unique index';
  exception when unique_violation then raise notice 'OK(13/14): dedup deterministik enforced'; end;

  -- (15) invariant no-execution: payload execution_allowed=true → ditolak CHECK.
  begin
    insert into public.gmvmax_skill_outputs
      (workspace_id, store_id, output_date, skill_code, skill_version, scope_type, scope_id,
       status, severity, confidence, payload, deterministic_signature, generated_at, expires_at)
    values (v_ws, 'store-x', date '2020-01-01', 'GMVMAX_SKILL_09', 'v0', 'STORE', 'store-x',
       'OBSERVE', 'INFO', 'MEDIUM', '{"execution_allowed":true}'::jsonb, 'sha256:x', now(), now());
    raise exception 'FAIL: execution_allowed=true seharusnya ditolak CHECK';
  exception when check_violation then raise notice 'OK(15): no-execution invariant enforced'; end;
end $$;
rollback;

-- ── B. Kolom sensitif (15): pastikan TIDAK ada kolom token/secret/raw payload ──
select 'daily_facts columns' as t, string_agg(column_name, ', ') as cols
  from information_schema.columns where table_name = 'gmvmax_daily_facts'
union all
select 'skill_outputs columns', string_agg(column_name, ', ')
  from information_schema.columns where table_name = 'gmvmax_skill_outputs';
-- Harap: TIDAK memuat token/access_token/refresh_token/client_secret/service_role_key/raw_mcp.

-- ── C. Grants (10/11/12): authenticated=SELECT saja; service_role=ALL; anon=∅ ──
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
  where table_name in ('gmvmax_daily_facts','gmvmax_skill_outputs')
  group by table_name, grantee order by table_name, grantee;
-- Harap: authenticated=SELECT; service_role=ALL; anon=(tak muncul).

-- ── D. Policy (9): hanya SELECT policy (owner_read + admin_read), tak ada write ─
select tablename, policyname, cmd from pg_policies
  where tablename in ('gmvmax_daily_facts','gmvmax_skill_outputs') order by tablename, policyname;
-- Harap: hanya cmd=SELECT (owner_read + admin_read). TIDAK ada INSERT/UPDATE/DELETE.

-- ── E. RLS role-check (jalankan TERPISAH di sesi ber-JWT owner/anon) ───────────
-- (9)  owner baca miliknya:      select count(*) from public.gmvmax_daily_facts;                 -- baris workspace sendiri
-- (22) owner LINTAS workspace:   select * from public.gmvmax_skill_outputs where workspace_id = '<WS_LAIN>';  -- harap 0
-- (10) owner tulis (harap gagal): insert into public.gmvmax_daily_facts(...) values (...);       -- permission denied / RLS
-- (11) anon:                      set role anon; select * from public.gmvmax_daily_facts;        -- permission denied
-- (12) service_role:             set role service_role; select count(*) from public.gmvmax_skill_outputs; -- OK
