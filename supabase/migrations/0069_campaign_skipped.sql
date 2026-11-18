-- ============================================================================
-- Alasan produk TIDAK ikut campaign — dicatat manual oleh admin.
--
-- Layar "Campaign per Produk → Tidak ikut campaign" menurunkan sebagian alasan
-- otomatis (harga campaign kosong, HPP kosong, margin di bawah target) dan
-- membaca yang sudah tercatat (varian dikecualikan, ditolak client). Sisanya,
-- produk yang memang sengaja tidak diikutkan (stok habis, client minta skip,
-- dsb.), dicatat di kolom ini.
--
--   skipped jsonb = [
--     { productId   : text,            -- id calc_products
--       varIdx      : int | null,      -- null = semua varian produk
--       productName : text,            -- snapshot nama (portal tak baca calc_products)
--       variantName : text,            -- snapshot nama varian ('' bila semua)
--       reason      : 'stock' | 'client' | 'price' | 'eligibility' | 'otherpromo' | 'other',
--       note        : text,
--       showToClient: boolean,
--       at : timestamptz, by : email, byName : text }
--   ]
--
-- Seperti `registration` (0062), kolom ini TIDAK ikut toRow() editor: ditulis
-- lewat setCampaignSkipped() supaya simpan editor tak menimpanya. Varian yang
-- kemudian ditambahkan ke campaign otomatis tidak lagi dianggap "tidak ikut"
-- (entrinya diabaikan saat dibaca, dan dibuang saat dialog menyimpan).
--
-- Jalankan SETELAH 0063. Aman diulang. Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists skipped jsonb not null default '[]'::jsonb;

-- ── Recreate portal_campaigns supaya alasan yang boleh dilihat client ikut ──
-- Disalin utuh dari 0063, hanya menambah field `skipped`: hanya entri dengan
-- showToClient = true, tanpa email admin (`by`).

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
        'registration', coalesce(c.registration, '{}'::jsonb),
        'registrationDeadline', c.registration_deadline,
        'skipped', coalesce((
          select jsonb_agg(e - 'by')
            from jsonb_array_elements(coalesce(c.skipped, '[]'::jsonb)) e
           where coalesce((e ->> 'showToClient')::boolean, false)
        ), '[]'::jsonb)
      ) as x
    from public.campaigns c
    where c.workspace_id = w.id and not coalesce(c.portal_hidden, false)
  ) t;

  return jsonb_build_object(
    'workspace', jsonb_build_object('id', w.id, 'name', w.name),
    'campaigns', rows
  );
end $$;
