-- ============================================================================
-- Portal campaign untuk client/atasan — satu link per WORKSPACE yang memuat
-- seluruh campaign (mana yang belum di-ACC, sedang berjalan, sudah selesai),
-- bukan satu link per campaign seperti 0039.
--
-- Link approval per campaign yang sudah terlanjur dikirim TETAP berlaku: token
-- campaign tidak diubah. Yang ditambah hanya "pintu" baru di level workspace.
--
-- Model akses: portal privat (email diundang) atau publik (siapa pun yang
-- login). Anggota portal otomatis boleh membuka halaman /approve tiap campaign
-- di workspace itu — tanpa perlu diundang ulang satu per satu.
-- Jalankan SETELAH 0042. Aman diulang. Supabase → SQL Editor.
-- ============================================================================

alter table public.workspaces
  add column if not exists portal_token   uuid,
  add column if not exists portal_access  text  not null default 'private',  -- 'private' | 'public'
  add column if not exists portal_emails  jsonb not null default '[]'::jsonb; -- email diundang (lowercase)

create unique index if not exists idx_workspaces_portal_token
  on public.workspaces (portal_token) where portal_token is not null;

-- Campaign yang tak ingin dilihat client (draft, internal) disembunyikan.
alter table public.campaigns
  add column if not exists portal_hidden boolean not null default false;

-- ── Penjaga: apakah pemanggil anggota portal workspace ini ───────────────────
create or replace function public.portal_can_view(p_ws uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspaces w
     where w.id = p_ws
       and w.portal_token is not null
       and ( coalesce(w.portal_access, 'private') = 'public'
             or w.portal_emails ? lower(coalesce(auth.jwt() ->> 'email', '')) )
  )
$$;

-- ── RPC: daftar campaign satu workspace by portal token ─────────────────────
-- Kirim ringkasan saja (tanpa produk/HPP); hitungan SKU & status dihitung di
-- browser dari `items` + `approvals` memakai helper yang sudah ada.
create or replace function public.portal_campaigns(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w     public.workspaces;
  email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  rows  jsonb;
begin
  if p_token is null then raise exception 'invalid token'; end if;
  select * into w from public.workspaces where portal_token = p_token;
  if not found then raise exception 'invalid token'; end if;
  if coalesce(w.portal_access, 'private') = 'private'
     and w.user_id is distinct from auth.uid()   -- null-safe: anon tak lolos
     and not (w.portal_emails ? email) then
    raise exception 'not authorized';
  end if;

  -- Campaign yang tampil di portal dibuatkan share_token sekali supaya tautan
  -- rinciannya (/approve) bisa dibuka langsung dari daftar.
  update public.campaigns
     set share_token = gen_random_uuid()
   where workspace_id = w.id
     and not coalesce(portal_hidden, false)
     and share_token is null;

  select coalesce(jsonb_agg(x order by ord desc nulls last), '[]'::jsonb) into rows
  from (
    select c.start_date as ord,
      jsonb_build_object(
        'id', c.id, 'name', c.name, 'parentCampaign', c.parent_campaign,
        'platform', c.platform, 'description', c.description, 'link', c.link,
        'startDate', c.start_date, 'endDate', c.end_date,
        'periods', coalesce(c.periods, '[]'::jsonb),
        'items', coalesce(c.items, '[]'::jsonb),
        'approvals', coalesce(c.approvals, '{}'::jsonb),
        'shareToken', c.share_token, 'updatedAt', c.updated_at
      ) as x
    from public.campaigns c
    where c.workspace_id = w.id and not coalesce(c.portal_hidden, false)
  ) t;

  return jsonb_build_object(
    'workspace', jsonb_build_object('id', w.id, 'name', w.name),
    'campaigns', rows
  );
end $$;

-- ── Recreate 2 RPC approval: anggota portal ikut diterima ───────────────────
-- Disalin dari 0042 (periods + owner-bypass 0041), hanya menambah satu syarat
-- OR portal_can_view(). JANGAN dihapus dari versi ini, nanti `periods` hilang.
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
  if coalesce(c.approval_access, 'private') = 'private'
     and not is_owner
     and not (c.approval_emails ? email)
     and not public.portal_can_view(c.workspace_id) then
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

create or replace function public.set_product_approval(
  p_token uuid, p_product_id text, p_status text, p_note text, p_by_name text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c        public.campaigns;
  email    text := lower(coalesce(auth.jwt() ->> 'email', ''));
  now_ts   timestamptz := now();
  entry    jsonb;
  is_owner boolean;
begin
  if p_status not in ('pending', 'approved', 'rejected') then raise exception 'bad status'; end if;
  select * into c from public.campaigns where share_token = p_token for update;
  if not found then raise exception 'invalid token'; end if;
  select exists(select 1 from public.workspaces w where w.id = c.workspace_id and w.user_id = auth.uid()) into is_owner;
  if coalesce(c.approval_access, 'private') = 'private'
     and not is_owner
     and not (c.approval_emails ? email)
     and not public.portal_can_view(c.workspace_id) then
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

-- Client portal TIDAK punya akses RLS ke tabel mana pun; semua lewat RPC ini,
-- dan RPC hanya boleh dieksekusi setelah login (role authenticated).
revoke all on function public.portal_can_view(uuid) from public, anon;
revoke all on function public.portal_campaigns(uuid) from public, anon;
revoke all on function public.campaign_by_share_token(uuid) from public, anon;
revoke all on function public.set_product_approval(uuid, text, text, text, text) from public, anon;
grant execute on function public.portal_can_view(uuid) to authenticated;
grant execute on function public.portal_campaigns(uuid) to authenticated;
grant execute on function public.campaign_by_share_token(uuid) to authenticated;
grant execute on function public.set_product_approval(uuid, text, text, text, text) to authenticated;
