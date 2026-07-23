-- ============================================================================
-- Tambah nama approver ke persetujuan. set_product_approval kini menerima
-- p_by_name → disimpan `byName` di entry approvals & approval_log (di samping
-- `by` = email login). Untuk mode Public, halaman client mewajibkan isi nama.
-- Jalankan SETELAH 0039. Aman diulang. Supabase → SQL Editor.
-- ============================================================================

-- Ganti signature (tambah p_by_name) — drop dulu versi 4-arg lalu buat 5-arg.
drop function if exists public.set_product_approval(uuid, text, text, text);

create or replace function public.set_product_approval(
  p_token uuid, p_product_id text, p_status text, p_note text, p_by_name text
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

revoke all on function public.set_product_approval(uuid, text, text, text, text) from public, anon;
grant execute on function public.set_product_approval(uuid, text, text, text, text) to authenticated;
