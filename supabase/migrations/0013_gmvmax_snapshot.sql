-- ============================================================================
-- GMV Max — model SNAPSHOT HARIAN (MTD).
-- Sebelumnya tiap import dikunci per-bulan (identitas = workspace + name). Untuk
-- pemakaian harian oleh tim, tiap upload kini = 1 SNAPSHOT bertanggal
-- (`snapshot_date` = tanggal akhir rentang export). Banyak snapshot boleh hidup
-- dalam 1 bulan; angka harian asli diturunkan aplikasi sebagai selisih snapshot
-- hari ini − snapshot kemarin. Total bulan = snapshot terbaru.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

alter table public.gmvmax_imports
  add column if not exists snapshot_date date;

-- Backfill data lama: snapshot "as of" = tanggal akhir rentang (fallback bulan).
update public.gmvmax_imports
  set snapshot_date = coalesce(end_date, period_month)
  where snapshot_date is null;

-- Satu snapshot per (workspace, tanggal) — re-upload tanggal sama = perbaikan,
-- aplikasi menghapus snapshot tanggal itu lebih dulu sebelum insert.
create index if not exists gmvmax_imports_ws_snapshot_idx
  on public.gmvmax_imports (workspace_id, snapshot_date desc);
