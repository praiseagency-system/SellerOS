-- ============================================================================
-- Persetujuan per produk dalam campaign — untuk di-"sounding" ke atasan/client
-- lalu disetujui/ditolak per produk. Map keyed by productId:
--   approvals jsonb: { "<productId>": { status: 'pending'|'approved'|'rejected',
--                                        note: text, at: iso } }
-- Produk tanpa entri = 'pending' (default). Nullable + default '{}' agar
-- campaign lama tetap valid. Jalankan di Supabase → SQL Editor.
-- ============================================================================

alter table public.campaigns
  add column if not exists approvals jsonb not null default '{}'::jsonb;
