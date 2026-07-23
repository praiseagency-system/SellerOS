-- ============================================================================
-- (1) Kolom `detail` — teks panjang syarat/detail campaign (dari marketplace)
--     yang bisa dibaca client di halaman /approve.
-- (2) Owner-bypass — pemilik workspace SELALU boleh buka link approval-nya
--     sendiri (untuk preview) walau mode Private & email-nya tak diundang.
-- Recreate 2 RPC (tambah detail + is_owner). Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns add column if not exists detail text;

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
      'startDate', c.start_date, 'endDate', c.end_date,
      'items', c.items, 'voucherConfig', c.voucher_config,
      'approvals', c.approvals, 'approvalLog', c.approval_log,
      'approvalAccess', c.approval_access
    ),
    'products', coalesce(prods, '{}'::jsonb)
  );
end $$;

create or replace function public.set_product_approval(
  p_token uuid, p_product_id text, p_status text, p_note text, p_by_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c        public.campaigns;
  email    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  is_owner boolean;
  now_ts   timestamptz := now();
  entry    jsonb;
begin
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad status'; end if;
  select * into c from public.campaigns where share_token = p_token for update;
  if not found then raise exception 'invalid token'; end if;
  select exists(select 1 from public.workspaces w where w.id = c.workspace_id and w.user_id = auth.uid()) into is_owner;
  if coalesce(c.approval_access, 'private') = 'private' and not is_owner and not (c.approval_emails ? email) then
    raise exception 'not authorized';
  end if;

  entry := jsonb_build_object('status', p_status, 'note', coalesce(p_note, ''),
                              'by', email, 'byName', coalesce(p_by_name, ''), 'at', to_jsonb(now_ts));
  update public.campaigns
    set approvals    = coalesce(approvals, '{}'::jsonb) || jsonb_build_object(p_product_id, entry),
        approval_log = coalesce(approval_log, '[]'::jsonb)
                       || jsonb_build_object('productId', p_product_id, 'status', p_status,
                                             'note', coalesce(p_note, ''), 'by', email,
                                             'byName', coalesce(p_by_name, ''), 'at', to_jsonb(now_ts)),
        updated_at   = now_ts
    where id = c.id;

  return (select jsonb_build_object('approvals', approvals, 'approvalLog', approval_log)
            from public.campaigns where id = c.id);
end $$;
