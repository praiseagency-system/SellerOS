-- ============================================================================
-- Tambah kolom `color` pada workspaces (untuk tag warna brand/toko di UI).
-- Opsional tapi disarankan. Jalankan di Supabase Dashboard → SQL Editor.
-- Kode app tetap jalan tanpa kolom ini (warna di-derive dari id), tapi pilihan
-- warna user baru akan tersimpan setelah migration ini dijalankan.
-- ============================================================================

alter table public.workspaces add column if not exists color text;
