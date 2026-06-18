-- ============================================================================
-- Lengkapi tabel `periods` dengan metadata sesi yang dibutuhkan app:
-- platform, period_value (sumbu waktu, mis. "2026-05"), period_type
-- (mingguan/bulanan), dan settings (snapshot benchmark) sebagai jsonb.
-- WAJIB untuk slice "periods + products → Supabase". Jalankan di SQL Editor.
-- ============================================================================

alter table public.periods add column if not exists platform     text;
alter table public.periods add column if not exists period_value text;
alter table public.periods add column if not exists period_type  text;
alter table public.periods add column if not exists settings     jsonb;

-- Bantu dedup (workspace+nama+platform) & query per periode.
create index if not exists idx_periods_ws_name_platform
  on public.periods (workspace_id, name, platform);
