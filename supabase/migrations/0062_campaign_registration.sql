-- ============================================================================
-- Status PENDAFTARAN campaign ke marketplace — "sudah masuk apa belum".
--
-- Persetujuan client (0039/0060) menjawab "harga ini boleh?"; kolom ini
-- menjawab pertanyaan berikutnya dari client: "sudah didaftarkan ke TikTok /
-- Shopee belum?". Diisi ADMIN (owner workspace), dibaca client di portal dan
-- di halaman /approve.
--
--   registration = {
--     status : 'none' | 'progress' | 'done',   -- belum / sedang diproses / sudah
--     note   : text,                            -- catatan untuk client
--     link   : text,                            -- bukti di Seller Centre (opsional)
--     at     : timestamptz, by : email, byName : text
--   }
-- Kosong `{}` = belum didaftarkan, jadi campaign lama tidak perlu backfill.
--
-- Jalankan SETELAH 0060. Aman diulang. Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists registration jsonb not null default '{}'::jsonb;

-- ── Recreate 2 RPC pembaca supaya `registration` ikut terkirim ──────────────
-- Disalin utuh dari 0060 (jangan disederhanakan: `periods`, owner-bypass, dan
-- `portalToken` harus ikut terbawa), hanya menambah satu field.

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
        'shareToken', c.share_token, 'updatedAt', c.updated_at,
        'registration', coalesce(c.registration, '{}'::jsonb)
      ) as x
    from public.campaigns c
    where c.workspace_id = w.id and not coalesce(c.portal_hidden, false)
  ) t;

  return jsonb_build_object(
    'workspace', jsonb_build_object('id', w.id, 'name', w.name),
    'campaigns', rows
  );
end $$;

create or replace function public.campaign_by_share_token(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c          public.campaigns;
  prods      jsonb;
  email      text := lower(coalesce(auth.jwt() ->> 'email', ''));
  is_owner   boolean;
  portal_tok uuid;
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

  -- Token portal ikut dikirim HANYA bila pemanggil memang boleh melihat portal
  -- (owner atau anggota portal). Dengan begitu satu link approval saja sudah
  -- jadi pintu ke daftar campaign lain, tanpa membocorkannya ke approver yang
  -- cuma diundang ke satu campaign.
  if is_owner or public.portal_can_view(c.workspace_id) then
    select w.portal_token into portal_tok from public.workspaces w where w.id = c.workspace_id;
  end if;

  return jsonb_build_object(
    'campaign', jsonb_build_object(
      'id', c.id, 'name', c.name, 'parentCampaign', c.parent_campaign,
      'portalToken', portal_tok,
      'platform', c.platform, 'description', c.description, 'detail', c.detail, 'link', c.link,
      'startDate', c.start_date, 'endDate', c.end_date, 'periods', coalesce(c.periods, '[]'::jsonb),
      'items', c.items, 'voucherConfig', c.voucher_config,
      'approvals', c.approvals, 'approvalLog', c.approval_log,
      'registration', coalesce(c.registration, '{}'::jsonb),
      'approvalAccess', c.approval_access
    ),
    'products', coalesce(prods, '{}'::jsonb)
  );
end $$;
