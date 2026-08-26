-- ============================================================================
-- Execute Layer E3.5 — aksi baru PRODUCTS_UPDATE (kelola produk campaign).
-- Perluas daftar action_type yang diizinkan tabel approval (0045).
-- Jalankan di Supabase Dashboard → SQL Editor. Idempoten.
-- ============================================================================

alter table public.gmvmax_approvals
  drop constraint if exists gmvmax_approvals_action_type_check;

alter table public.gmvmax_approvals
  add constraint gmvmax_approvals_action_type_check check (action_type in
    ('TEST','SPARK_BIND','SPARK_UNBIND','BUDGET_UPDATE','ROI_UPDATE',
     'STATUS_UPDATE','CREATIVE_EXCLUDE','SESSION_CREATE','SESSION_DELETE',
     'PRODUCTS_UPDATE'));
