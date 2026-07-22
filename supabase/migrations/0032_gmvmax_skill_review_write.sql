-- ============================================================================
-- GMV Max — DECISION REVIEW WRITE (#3a triase). Owner boleh UPDATE HANYA kolom
-- review (reviewed_at / dismissed_at / snoozed_until) pada gmvmax_skill_outputs,
-- untuk menandai keputusan harian: sudah ditinjau / ditunda / diabaikan.
--
-- AMAN: grant kolom membatasi authenticated ke 3 kolom itu SAJA — payload, skill,
-- status, signature, dsb TETAP immutable dari sisi browser (penulis konten tetap
-- service_role via pipeline). RLS UPDATE hanya baris milik workspace pemilik.
-- Aditif; tak mengubah policy read yang sudah ada.
-- ============================================================================

grant update (reviewed_at, dismissed_at, snoozed_until)
  on public.gmvmax_skill_outputs to authenticated;

drop policy if exists gmvmax_skill_outputs_owner_review on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_owner_review on public.gmvmax_skill_outputs
  for update using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );
