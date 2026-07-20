-- ============================================================================
-- GMV Max — Production Safety Hardening P0/P1 (ADITIF; tak mengubah kolom/kontrak UI).
-- Diterapkan di Supabase Dashboard → SQL Editor. Aman berdasar audit 2026-07-10:
--   - 0 date dengan >1 import (17/17 distinct)          → unique (workspace_id, snapshot_date) tak melanggar.
--   - 13085 baris: campaign_id 0 null/0 '' ; product_id 0 '' ; video_id 0 '' ; 0 duplikat identity → aman.
--
-- SELURUH migrasi dibungkus SATU transaksi (BEGIN/COMMIT) → all-or-nothing:
--   tak ada partial-apply. Idempoten (rerun aman) via IF NOT EXISTS / guard pg_constraint.
--   Tidak memakai CREATE INDEX CONCURRENTLY (dilarang dalam transaksi; tabel kecil → blocking OK).
--
-- ZERO-DATA CONTRACT (MCP→engine→worker→writer→RPC):
--   engine hanya RETURN saat sukses penuh (semua paginasi selesai, tanpa auth/timeout/partial);
--   throw → INCOMPLETE/FAILED/AUTH (tak pernah sampai writer). meta.completeness =
--   COMPLETE_WITH_ROWS (rows>0) | COMPLETE_ZERO_DATA (rows=0). Writer set p_allow_empty=TRUE
--   HANYA bila COMPLETE_ZERO_DATA. RPC = guard terakhir: [] tanpa allow_empty → tolak SEBELUM DELETE.
-- ============================================================================
begin;

-- P1: DB-enforce "satu import per (workspace, snapshot_date)" (idempoten).
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conname = 'gmvmax_imports_ws_date_uniq'
                   and conrelid = 'public.gmvmax_imports'::regclass) then
    alter table public.gmvmax_imports
      add constraint gmvmax_imports_ws_date_uniq unique (workspace_id, snapshot_date);
  end if;
end $$;

-- P1 (E): identity text fields tak boleh empty-string (future-proof; audit: 0 '').
-- NULL tetap sah (video_id/product_id -1/rekonsiliasi). Idempoten.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'gmvmax_creatives_campaign_id_nonempty') then
    alter table public.gmvmax_creatives add constraint gmvmax_creatives_campaign_id_nonempty check (campaign_id is null or campaign_id <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gmvmax_creatives_product_id_nonempty') then
    alter table public.gmvmax_creatives add constraint gmvmax_creatives_product_id_nonempty check (product_id is null or product_id <> '');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'gmvmax_creatives_video_id_nonempty') then
    alter table public.gmvmax_creatives add constraint gmvmax_creatives_video_id_nonempty check (video_id is null or video_id <> '');
  end if;
end $$;

-- P1: identity kanonik baris = (import_id, campaign_id, product_id, video_id).
-- Setelah CHECK di atas, '' mustahil → coalesce(null→'') tak ambigu (null vs '' tak bertabrakan).
create unique index if not exists gmvmax_creatives_identity_uniq
  on public.gmvmax_creatives (import_id, campaign_id, coalesce(product_id, ''), coalesce(video_id, ''));

-- Overload safety: buang signature 4-arg lama (bila sempat ada) agar tak ambigu dgn 5-arg.
drop function if exists public.gmvmax_replace_snapshot(uuid, date, jsonb, jsonb);

-- P0: ganti snapshot ATOMIK. VALIDASI SEBELUM DELETE (arg skalar → tipe JSON → empty →
-- shape elemen), baru mutasi. Error cast/constraint downstream → ROLLBACK penuh → snapshot
-- lama utuh. Pembaca tak pernah lihat state parsial (isolasi transaksi).
-- Keamanan tenant: SECURITY INVOKER (patuh RLS pemanggil) + grant hanya service_role.
create or replace function public.gmvmax_replace_snapshot(
  p_workspace_id uuid,
  p_snapshot_date date,
  p_import jsonb,
  p_creatives jsonb,
  p_allow_empty boolean default false
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_import_id uuid;
  v_count int;
begin
  -- 1. arg skalar (sebelum mutasi apa pun)
  if p_workspace_id is null then raise exception 'GMVMAX_INVALID_WORKSPACE_ID'; end if;
  if p_snapshot_date is null then raise exception 'GMVMAX_INVALID_SNAPSHOT_DATE'; end if;
  -- 2. tipe/shape JSON
  if p_import is null or jsonb_typeof(p_import) <> 'object' then raise exception 'GMVMAX_INVALID_IMPORT_PAYLOAD'; end if;
  if p_creatives is null or jsonb_typeof(p_creatives) <> 'array' then raise exception 'GMVMAX_INVALID_CREATIVES_PAYLOAD'; end if;
  -- 3. semantik empty (opt-in eksplisit; accidental empty TIDAK boleh menghapus snapshot lama)
  v_count := jsonb_array_length(p_creatives);
  if v_count = 0 and not coalesce(p_allow_empty, false) then raise exception 'GMVMAX_EMPTY_PAYLOAD_NOT_ALLOWED'; end if;
  -- 4. invarian obvious per-elemen (setiap elemen object + campaign_id ada & non-empty)
  if exists (
    select 1 from jsonb_array_elements(p_creatives) e
    where jsonb_typeof(e) <> 'object' or nullif(e->>'campaign_id', '') is null
  ) then raise exception 'GMVMAX_INVALID_CREATIVE_ROW'; end if;

  -- 5. MUTASI (atomik dalam transaksi pemanggil)
  delete from public.gmvmax_imports
    where workspace_id = p_workspace_id and snapshot_date = p_snapshot_date;

  insert into public.gmvmax_imports
    (workspace_id, name, period_month, snapshot_date, start_date, end_date, currency, source_filename, totals, settings)
  values
    (p_workspace_id, p_import->>'name', (p_import->>'period_month')::date, p_snapshot_date,
     (p_import->>'start_date')::date, (p_import->>'end_date')::date, coalesce(p_import->>'currency', 'IDR'),
     p_import->>'source_filename', p_import->'totals', p_import->'settings')
  returning id into v_import_id;

  insert into public.gmvmax_creatives
    (import_id, video_id, campaign_name, campaign_id, product_id, creative_type, video_title, tiktok_account,
     time_posted, status, auth_type, cost, sku_orders, cost_per_order, gross_revenue, roas, impressions, clicks,
     ctr, cvr, vr_2s, vr_6s, vr_25, vr_50, vr_75, vr_100, hook_tag, raw_data)
  select v_import_id, r->>'video_id', r->>'campaign_name', r->>'campaign_id', r->>'product_id', r->>'creative_type',
     r->>'video_title', r->>'tiktok_account', (r->>'time_posted')::timestamptz, r->>'status', r->>'auth_type',
     (r->>'cost')::numeric, (r->>'sku_orders')::numeric, (r->>'cost_per_order')::numeric, (r->>'gross_revenue')::numeric,
     (r->>'roas')::numeric, (r->>'impressions')::numeric, (r->>'clicks')::numeric, (r->>'ctr')::numeric, (r->>'cvr')::numeric,
     (r->>'vr_2s')::numeric, (r->>'vr_6s')::numeric, (r->>'vr_25')::numeric, (r->>'vr_50')::numeric, (r->>'vr_75')::numeric,
     (r->>'vr_100')::numeric, r->>'hook_tag', null
  from jsonb_array_elements(p_creatives) as r;

  return v_import_id;
end $$;

-- Tenant isolation: cabut default PUBLIC, izinkan HANYA service_role. Target signature 5-arg BARU.
revoke execute on function public.gmvmax_replace_snapshot(uuid, date, jsonb, jsonb, boolean) from public;
grant execute on function public.gmvmax_replace_snapshot(uuid, date, jsonb, jsonb, boolean) to service_role;

commit;
