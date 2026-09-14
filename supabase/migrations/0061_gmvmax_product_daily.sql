-- ============================================================================
-- GMV Max — LAPORAN TINGKAT PRODUK per snapshot (Opsi D, 2026-09-14).
--
-- KENAPA: menu Performa Produk selama ini MENEBAK angka produk lewat alokasi
-- baris Product card (level campaign, tanpa product_id) menurut porsi revenue
-- video. Produk yang revenue videonya nol ikut hilang (13 Sep: 17 produk
-- berbelanja, 4 tampil). Padahal TikTok punya laporan per produk per campaign
-- (dimensi item_group_id) — persis tabel "Product" di Ads Manager — dan worker
-- sudah memanggilnya tiap pagi hanya untuk enumerasi SPU lalu membuang angkanya.
--
-- Tabel ini menyimpan laporan itu apa adanya, terikat ke import (snapshot)
-- yang sama dengan gmvmax_creatives, dan ditulis dalam transaksi yang sama
-- lewat RPC gmvmax_write_versioned_snapshot (parameter baru p_products).
-- ============================================================================

create table if not exists public.gmvmax_product_daily (
  id             uuid primary key default gen_random_uuid(),
  import_id      uuid not null references public.gmvmax_imports(id) on delete cascade,
  campaign_id    text not null,
  campaign_name  text,
  product_id     text not null,
  cost           numeric,
  gross_revenue  numeric,
  orders         numeric,
  roi            numeric,
  created_at     timestamptz not null default now(),
  unique (import_id, campaign_id, product_id)
);
create index if not exists idx_gmvmax_product_daily_import  on public.gmvmax_product_daily (import_id);
create index if not exists idx_gmvmax_product_daily_product on public.gmvmax_product_daily (product_id);

-- Privilege: pola 0051 — revoke dulu (default privileges Supabase memberi ALL),
-- baru grant selektif. Browser (authenticated) hanya membaca; penulis = RPC
-- kanonik yang dijalankan service_role.
revoke all on public.gmvmax_product_daily from anon, authenticated;
grant select on public.gmvmax_product_daily to authenticated;
grant all    on public.gmvmax_product_daily to service_role;

alter table public.gmvmax_product_daily enable row level security;
drop policy if exists gmvmax_product_daily_member_read on public.gmvmax_product_daily;
create policy gmvmax_product_daily_member_read on public.gmvmax_product_daily
  for select to authenticated using (exists (
    select 1 from public.gmvmax_imports i
     where i.id = import_id and public.is_ws_member(i.workspace_id)));
-- Sengaja TANPA policy tulis untuk authenticated.

-- ── RPC: tambah p_products (default '[]' → pemanggil lama tetap sah) ──────
-- Signature berubah → fungsi lama di-DROP dulu supaya tak ada overload ganda
-- (PostgREST menolak panggilan ambigu).
drop function if exists public.gmvmax_write_versioned_snapshot(uuid, date, text, jsonb, jsonb, text, text, text, uuid, text, boolean);

create or replace function public.gmvmax_write_versioned_snapshot(
  p_workspace_id     uuid,
  p_snapshot_date    date,
  p_content_signature text,
  p_import           jsonb,
  p_creatives        jsonb,
  p_writer_kind      text default 'COMMIT',
  p_writer_version   text default null,
  p_run_id           text default null,
  p_sync_run_id      uuid default null,
  p_actor_role       text default null,
  p_allow_empty      boolean default false,
  p_products         jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_cur        record;
  v_new_id     uuid;
  v_new_version int;
  v_count      int;
  v_has_cur    boolean := false;
begin
  -- 1. Validasi (sebelum mutasi apa pun).
  if p_workspace_id is null then raise exception 'GMVMAX_INVALID_WORKSPACE_ID'; end if;
  if p_snapshot_date is null then raise exception 'GMVMAX_INVALID_SNAPSHOT_DATE'; end if;
  if p_content_signature is null or p_content_signature = '' then raise exception 'GMVMAX_MISSING_CONTENT_SIGNATURE'; end if;
  if p_import is null or jsonb_typeof(p_import) <> 'object' then raise exception 'GMVMAX_INVALID_IMPORT_PAYLOAD'; end if;
  if p_creatives is null or jsonb_typeof(p_creatives) <> 'array' then raise exception 'GMVMAX_INVALID_CREATIVES_PAYLOAD'; end if;
  if p_products is null or jsonb_typeof(p_products) <> 'array' then raise exception 'GMVMAX_INVALID_PRODUCTS_PAYLOAD'; end if;
  v_count := jsonb_array_length(p_creatives);
  if v_count = 0 and not coalesce(p_allow_empty, false) then raise exception 'GMVMAX_EMPTY_PAYLOAD_NOT_ALLOWED'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_creatives) e
    where jsonb_typeof(e) <> 'object' or nullif(e->>'campaign_id', '') is null
  ) then raise exception 'GMVMAX_INVALID_CREATIVE_ROW'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_products) e
    where jsonb_typeof(e) <> 'object' or nullif(e->>'campaign_id', '') is null or nullif(e->>'product_id', '') is null
  ) then raise exception 'GMVMAX_INVALID_PRODUCT_ROW'; end if;

  -- 2. Ambil versi current (kunci baris).
  select id, version, content_signature into v_cur
    from public.gmvmax_imports
    where workspace_id = p_workspace_id and snapshot_date = p_snapshot_date and is_current
    for update;
  v_has_cur := found;

  -- 3. NO-OP: konten identik → jangan tulis ulang; catat lineage; kembalikan current.
  if v_has_cur and v_cur.content_signature is not null and v_cur.content_signature = p_content_signature then
    insert into public.gmvmax_snapshot_lineage
      (workspace_id, snapshot_date, import_id, version, previous_import_id, previous_version,
       content_signature, content_changed, writer_kind, writer_version, run_id, sync_run_id, actor_role)
    values (p_workspace_id, p_snapshot_date, v_cur.id, v_cur.version, v_cur.id, v_cur.version,
       p_content_signature, false, p_writer_kind, p_writer_version, p_run_id, p_sync_run_id, coalesce(p_actor_role, session_user))
    on conflict (workspace_id, snapshot_date, version) do nothing;
    return jsonb_build_object('import_id', v_cur.id, 'version', v_cur.version, 'content_changed', false, 'noop', true);
  end if;

  -- 4. VERSI BARU. Nomor versi monoton per (ws, date), termasuk versi historis.
  v_new_version := coalesce(
    (select max(version) from public.gmvmax_imports where workspace_id = p_workspace_id and snapshot_date = p_snapshot_date), 0) + 1;

  -- 4a. Turunkan current lama DULU (jaga partial-unique is_current) — TANPA delete.
  if v_has_cur then
    update public.gmvmax_imports set is_current = false, superseded_at = now() where id = v_cur.id;
  end if;

  -- 4b. Sisipkan versi baru (current).
  insert into public.gmvmax_imports
    (workspace_id, name, period_month, snapshot_date, start_date, end_date, currency, source_filename,
     totals, settings, version, is_current, content_signature)
  values
    (p_workspace_id, p_import->>'name', (p_import->>'period_month')::date, p_snapshot_date,
     (p_import->>'start_date')::date, (p_import->>'end_date')::date, coalesce(p_import->>'currency', 'IDR'),
     p_import->>'source_filename', p_import->'totals', p_import->'settings',
     v_new_version, true, p_content_signature)
  returning id into v_new_id;

  -- 4c. Tautkan supersede lama → baru.
  if v_has_cur then
    update public.gmvmax_imports set superseded_by = v_new_id where id = v_cur.id;
  end if;

  -- 4d. Sisipkan creatives versi baru (mapping identik gmvmax_replace_snapshot).
  insert into public.gmvmax_creatives
    (import_id, video_id, campaign_name, campaign_id, product_id, creative_type, video_title, tiktok_account,
     time_posted, status, auth_type, cost, sku_orders, cost_per_order, gross_revenue, roas, impressions, clicks,
     ctr, cvr, vr_2s, vr_6s, vr_25, vr_50, vr_75, vr_100, hook_tag, raw_data)
  select v_new_id, r->>'video_id', r->>'campaign_name', r->>'campaign_id', r->>'product_id', r->>'creative_type',
     r->>'video_title', r->>'tiktok_account', (r->>'time_posted')::timestamptz, r->>'status', r->>'auth_type',
     (r->>'cost')::numeric, (r->>'sku_orders')::numeric, (r->>'cost_per_order')::numeric, (r->>'gross_revenue')::numeric,
     (r->>'roas')::numeric, (r->>'impressions')::numeric, (r->>'clicks')::numeric, (r->>'ctr')::numeric, (r->>'cvr')::numeric,
     (r->>'vr_2s')::numeric, (r->>'vr_6s')::numeric, (r->>'vr_25')::numeric, (r->>'vr_50')::numeric, (r->>'vr_75')::numeric,
     (r->>'vr_100')::numeric, r->>'hook_tag', null
  from jsonb_array_elements(p_creatives) as r;

  -- 4d'. Laporan tingkat produk (per campaign × product) — transaksi yang sama.
  insert into public.gmvmax_product_daily
    (import_id, campaign_id, campaign_name, product_id, cost, gross_revenue, orders, roi)
  select v_new_id, r->>'campaign_id', r->>'campaign_name', r->>'product_id',
     (r->>'cost')::numeric, (r->>'gross_revenue')::numeric, (r->>'orders')::numeric, (r->>'roi')::numeric
  from jsonb_array_elements(p_products) as r;

  -- 4e. Lineage versi baru.
  insert into public.gmvmax_snapshot_lineage
    (workspace_id, snapshot_date, import_id, version, previous_import_id, previous_version,
     content_signature, content_changed, writer_kind, writer_version, run_id, sync_run_id, actor_role)
  values (p_workspace_id, p_snapshot_date, v_new_id, v_new_version,
     case when v_has_cur then v_cur.id else null end, case when v_has_cur then v_cur.version else null end,
     p_content_signature, true, p_writer_kind, p_writer_version, p_run_id, p_sync_run_id, coalesce(p_actor_role, session_user));

  return jsonb_build_object('import_id', v_new_id, 'version', v_new_version, 'content_changed', true, 'noop', false);
end $$;

revoke execute on function public.gmvmax_write_versioned_snapshot(uuid, date, text, jsonb, jsonb, text, text, text, uuid, text, boolean, jsonb) from public;
grant  execute on function public.gmvmax_write_versioned_snapshot(uuid, date, text, jsonb, jsonb, text, text, text, uuid, text, boolean, jsonb) to service_role;
