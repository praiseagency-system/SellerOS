-- ============================================================================
-- GMV Max — UPLOAD MANUAL DARI BROWSER JADI ATOMIK (Fase 0 kesiapan publik).
--
-- MASALAH yang ditutup: src/data/gmvmaxImports.js saveImport melakukan
--   DELETE snapshot tanggal-sama  →  INSERT import  →  INSERT creatives
-- tanpa transaksi. Bila INSERT gagal setelah DELETE (jaringan putus, kuota,
-- constraint), snapshot lama HILANG PERMANEN. Jalur worker sudah aman sejak
-- 0017/0030; hanya jalur browser yang tertinggal.
--
-- KENAPA FUNGSI BARU, bukan sekadar `grant execute` ke authenticated:
--   1. gmvmax_write_versioned_snapshot (0030) menulis gmvmax_snapshot_lineage,
--      dan 0029:92 SENGAJA tidak memberi authenticated hak insert ke tabel itu
--      ("browser read-only; lineage ditulis hanya via service_role"). Fungsi
--      0030 = SECURITY INVOKER → dipanggil browser akan DITOLAK RLS.
--   2. Parameter 0030 (writer_kind, run_id, sync_run_id, actor_role) tak boleh
--      ditentukan browser — itu jalur provenance worker.
--   Maka: fungsi ini SECURITY DEFINER (boleh menulis lineage) TAPI memeriksa
--   kepemilikan workspace secara EKSPLISIT, dan MEMAKU parameter provenance
--   ('MANUAL_UPLOAD' + actor = auth.uid()). Invariant 0029 tetap utuh: tabel
--   lineage tetap tak bisa ditulis langsung dari browser.
--
-- SIFAT: aditif & idempoten (create or replace). Tidak mengubah 0017/0030,
-- tidak mengubah tabel/kolom, tidak menyentuh jalur worker.
-- Dibungkus satu transaksi (konvensi migrasi 0017): fungsi + grant menyala
-- bersama-sama, tak ada keadaan setengah jadi.
-- Terapkan di Supabase Dashboard → SQL Editor.
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
  -- Gerbang identitas: fungsi ini SECURITY DEFINER (RLS di-bypass), jadi
  -- kepemilikan WAJIB diperiksa manual — ini satu-satunya yang memisahkan
  -- tenant di jalur ini.
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

  -- Delegasi ke penulis kanonik (0030): validasi payload, no-op bila konten
  -- identik, versi baru bila berubah, versi lama DI-SUPERSEDE (tidak dihapus).
  -- Provenance dipaku di sini agar browser tak bisa menyamar sebagai worker.
  return public.gmvmax_write_versioned_snapshot(
    p_workspace_id      => p_workspace_id,
    p_snapshot_date     => p_snapshot_date,
    p_content_signature => p_content_signature,
    p_import            => p_import,
    p_creatives         => p_creatives,
    p_writer_kind       => 'MANUAL_UPLOAD',
    p_writer_version    => 'browser-upload@1',
    p_run_id            => null,
    p_sync_run_id       => null,
    p_actor_role        => v_uid::text,
    p_allow_empty       => p_allow_empty
  );
end $$;

-- Hanya sesi login yang boleh memanggil. anon & public ditolak.
revoke execute on function public.gmvmax_upload_snapshot(uuid, date, text, jsonb, jsonb, boolean) from public;
grant  execute on function public.gmvmax_upload_snapshot(uuid, date, text, jsonb, jsonb, boolean) to authenticated;

commit;
