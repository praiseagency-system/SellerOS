-- ============================================================================
-- PERBAIKAN MENDESAK: unggah manual GMV Max GAGAL sejak 0049 diterapkan.
--
-- gmvmax_snapshot_lineage.writer_kind punya CHECK yang hanya mengizinkan
-- ('COMMIT','BACKFILL','MANUAL','OTHER') — dibuat di migrasi 0029:61.
-- Tapi gmvmax_upload_snapshot (0049) mengirim 'MANUAL_UPLOAD', yang TIDAK ada
-- di daftar itu. Akibatnya setiap unggah dari browser ditolak:
--   new row for relation "gmvmax_snapshot_lineage" violates check constraint
--
-- Kenapa lolos sampai produksi: harness bukti waktu itu memakai KERANGKA TIRUAN
-- yang tak menyalin CHECK tersebut, jadi ujinya hijau padahal skema asli
-- menolak. Sejak 2026-08-29 harness memasang seluruh migrasi asli, dan justru
-- itulah yang menemukan ini.
--
-- Perbaikannya memakai 'MANUAL' — nilai yang memang disediakan skema untuk
-- penulisan non-otomatis. Hanya baris itu yang berubah; sisa fungsi identik.
-- ============================================================================
begin;

create or replace function public.gmvmax_upload_snapshot(
  p_workspace_id      uuid,
  p_snapshot_date     date,
  p_content_signature text,
  p_import            jsonb,
  p_creatives         jsonb,
  p_allow_empty       boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'GMVMAX_NOT_AUTHENTICATED';
  end if;
  if p_workspace_id is null then
    raise exception 'GMVMAX_INVALID_WORKSPACE_ID';
  end if;
  if not exists (
    select 1 from public.workspaces w
    where w.id = p_workspace_id and w.user_id = v_uid
  ) then
    raise exception 'GMVMAX_FORBIDDEN_WORKSPACE';
  end if;

  return public.gmvmax_write_versioned_snapshot(
    p_workspace_id      => p_workspace_id,
    p_snapshot_date     => p_snapshot_date,
    p_content_signature => p_content_signature,
    p_import            => p_import,
    p_creatives         => p_creatives,
    p_writer_kind       => 'MANUAL',          -- sebelumnya 'MANUAL_UPLOAD' → ditolak CHECK
    p_writer_version    => 'browser-upload@1',
    p_run_id            => null,
    p_sync_run_id       => null,
    p_actor_role        => v_uid::text,
    p_allow_empty       => p_allow_empty
  );
end $$;

revoke execute on function public.gmvmax_upload_snapshot(uuid, date, text, jsonb, jsonb, boolean) from public;
grant  execute on function public.gmvmax_upload_snapshot(uuid, date, text, jsonb, jsonb, boolean) to authenticated;

commit;
