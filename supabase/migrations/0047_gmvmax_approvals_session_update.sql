-- Execute Layer E4b — aksi baru SESSION_UPDATE (ubah budget/jadwal sesi boost
-- yang sedang aktif). Perluas check constraint action_type. Idempoten.
-- Jalankan di Supabase Dashboard → SQL Editor.

alter table public.gmvmax_approvals
  drop constraint if exists gmvmax_approvals_action_type_check;

alter table public.gmvmax_approvals
  add constraint gmvmax_approvals_action_type_check check (action_type in
    ('TEST','SPARK_BIND','SPARK_UNBIND','BUDGET_UPDATE','ROI_UPDATE',
     'STATUS_UPDATE','CREATIVE_EXCLUDE','SESSION_CREATE','SESSION_UPDATE',
     'SESSION_DELETE','PRODUCTS_UPDATE'));
