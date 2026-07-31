-- ============================================================================
-- Periode efektif campaign — satu campaign bisa aktif di BEBERAPA rentang
-- tanggal (mis. "Gajian Sale Juli" 24–31 Juli lalu "8.8" 1–8 Agustus).
--   periods jsonb: [ { label, start, end } ]  (tanggal 'YYYY-MM-DD')
-- Voucher & Harga Campaign tetap satu set untuk semua periode; periode hanya
-- menentukan KAPAN campaign aktif dan pesanan mana yang dihitung sebagai hasil
-- aktual (hari jeda antar periode tidak ikut).
--
-- start_date / end_date TIDAK dibuang: aplikasi terus mengisinya dengan rentang
-- keseluruhan (tanggal paling awal → paling akhir) supaya urutan daftar & data
-- lama tetap valid. Campaign lama yang periods-nya kosong dibaca sebagai satu
-- periode tanpa nama, jadi tak ada backfill manual.
-- Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists periods jsonb not null default '[]'::jsonb;

-- RPC halaman approval publik ikut mengirim `periods` (recreate dari 0041,
-- hanya menambah satu field).
create or replace function public.campaign_by_share_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c        public.campaigns;
  prods    jsonb;
  email    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  is_owner boolean;
begin
  if p_token is null then raise exception 'invalid token'; end if;
  select * into c from public.campaigns where share_token = p_token;
  if not found then raise exception 'invalid token'; end if;
  select exists(select 1 from public.workspaces w where w.id = c.workspace_id and w.user_id = auth.uid()) into is_owner;
  if coalesce(c.approval_access, 'private') = 'private' and not is_owner and not (c.approval_emails ? email) then
    raise exception 'not authorized';
  end if;

  select jsonb_object_agg(cp.id::text, jsonb_build_object('id', cp.id, 'name', cp.name, 'data', cp.data))
    into prods
    from public.calc_products cp
    where cp.id in (select (jsonb_array_elements_text(c.product_ids))::uuid);

  return jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'parentCampaign', c.parent_campaign,
      'platform', c.platform, 'description', c.description, 'detail', c.detail, 'link', c.link,
      'startDate', c.start_date, 'endDate', c.end_date, 'periods', coalesce(c.periods, '[]'::jsonb),
      'items', c.items, 'voucherConfig', c.voucher_config,
      'approvals', c.approvals, 'approvalLog', c.approval_log,
      'approvalAccess', c.approval_access
    ),
    'products', coalesce(prods, '{}'::jsonb)
  );
end $$;
