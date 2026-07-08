-- ============================================================================
-- GMV Max — LANTAI KILL (kill_floor).
-- Ambang spend minimal agar sebuah video layak berstatus "Kill". Video ROAS < 1
-- tapi spend di bawah ambang ini = spend receh (belum cukup data) → Watch, bukan
-- Kill. Default Rp 30.000. Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

alter table public.gmvmax_settings
  add column if not exists kill_floor numeric not null default 30000;
