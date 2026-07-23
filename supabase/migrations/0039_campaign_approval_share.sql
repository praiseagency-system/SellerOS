-- ============================================================================
-- Link approval untuk atasan/client — akses via magic-link (login email), token
-- tak-tertebak, mode Private (email diundang) / Public (siapa saja yang login).
-- Approver TIDAK punya akses RLS ke tabel campaigns/calc_products; semua lewat
-- 2 RPC SECURITY DEFINER yang memvalidasi token + akses. History disimpan
-- append-only di approval_log. Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists share_token      uuid,
  add column if not exists approval_access   text  not null default 'private',  -- 'private' | 'public'
  add column if not exists approval_emails   jsonb not null default '[]'::jsonb, -- email diundang (lowercase) utk mode private
  add column if not exists approval_log      jsonb not null default '[]'::jsonb; -- timeline: [{productId,status,note,by,at}]

create unique index if not exists idx_campaigns_share_token
  on public.campaigns (share_token) where share_token is not null;

-- ── RPC: baca campaign + produk terkait by token (untuk halaman /approve) ────
create or replace function public.campaign_by_share_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c      public.campaigns;
  prods  jsonb;
  email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if p_token is null then raise exception 'invalid token'; end if;
  select * into c from public.campaigns where share_token = p_token;
  if not found then raise exception 'invalid token'; end if;
  -- Private → email login harus ada di daftar undangan. Public → cukup login.
  if coalesce(c.approval_access, 'private') = 'private' and not (c.approval_emails ? email) then
    raise exception 'not authorized';
  end if;

  select jsonb_object_agg(cp.id::text, jsonb_build_object('id', cp.id, 'name', cp.name, 'data', cp.data))
    into prods
    from public.calc_products cp
    where cp.id in (select (jsonb_array_elements_text(c.product_ids))::uuid);

  return jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'parentCampaign', c.parent_campaign,
      'platform', c.platform, 'description', c.description, 'link', c.link,
      'startDate', c.start_date, 'endDate', c.end_date,
      'items', c.items, 'voucherConfig', c.voucher_config,
      'approvals', c.approvals, 'approvalLog', c.approval_log,
      'approvalAccess', c.approval_access
    ),
    'products', coalesce(prods, '{}'::jsonb)
  );
end $$;

-- ── RPC: set persetujuan satu produk by token (append ke log) ────────────────
create or replace function public.set_product_approval(
  p_token uuid, p_product_id text, p_status text, p_note text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c      public.campaigns;
  email  text := lower(coalesce(auth.jwt() ->> 'email', ''));
  now_ts timestamptz := now();
  entry  jsonb;
begin
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad status'; end if;
  select * into c from public.campaigns where share_token = p_token for update;
  if not found then raise exception 'invalid token'; end if;
  if coalesce(c.approval_access, 'private') = 'private' and not (c.approval_emails ? email) then
    raise exception 'not authorized';
  end if;

  entry := jsonb_build_object('status', p_status, 'note', coalesce(p_note, ''), 'by', email, 'at', to_jsonb(now_ts));
  update public.campaigns
    set approvals    = coalesce(approvals, '{}'::jsonb) || jsonb_build_object(p_product_id, entry),
        approval_log = coalesce(approval_log, '[]'::jsonb)
                       || jsonb_build_object('productId', p_product_id, 'status', p_status,
                                             'note', coalesce(p_note, ''), 'by', email, 'at', to_jsonb(now_ts)),
        updated_at   = now_ts
    where id = c.id;

  return (select jsonb_build_object('approvals', approvals, 'approvalLog', approval_log)
            from public.campaigns where id = c.id);
end $$;

-- Approver hanya boleh eksekusi 2 RPC ini (butuh login → role authenticated).
revoke all on function public.campaign_by_share_token(uuid) from public, anon;
revoke all on function public.set_product_approval(uuid, text, text, text) from public, anon;
grant execute on function public.campaign_by_share_token(uuid) to authenticated;
grant execute on function public.set_product_approval(uuid, text, text, text) to authenticated;
