-- ============================================================================
-- Fase 3.2 — POLICY BERALIH DARI KEPEMILIKAN KE KEANGGOTAAN.
--
-- Fondasinya sudah ada (0052): tabel workspace_members + is_ws_member /
-- can_ws_write / is_ws_owner, dengan pemilik lama ter-backfill sebagai owner.
-- Migrasi ini mengganti policy yang selama ini bertanya
--     exists (select 1 from workspaces w where w.id = workspace_id
--             and w.user_id = auth.uid())
-- menjadi pertanyaan keanggotaan.
--
-- SIFAT YANG MEMBUATNYA AMAN: karena backfill membuat is_ws_member() bernilai
-- PERSIS SAMA dengan kepemilikan lama, migrasi ini TIDAK mengubah akses siapa
-- pun yang ada sekarang. Akses baru hanya muncul saat seseorang benar-benar
-- ditambahkan sebagai anggota. Itu juga yang diuji di harness: pemilik lama
-- harus tetap bisa persis seperti sebelumnya.
--
-- POLA per tabel (dua policy, dievaluasi OR):
--   <t>_member_read   FOR SELECT  → anggota mana pun (termasuk viewer)
--   <t>_member_write  FOR ALL     → hanya owner/editor
-- Viewer lolos lewat policy baca, gagal di policy tulis → baca-saja. DELETE
-- ikut tertutup untuk viewer karena policy baca hanya mencakup SELECT.
--
-- Policy *_admin_read (28 buah) SENGAJA TIDAK DISENTUH — itu jalur consent
-- lintas-user yang terpisah dari keanggotaan.
-- ============================================================================
begin;

-- ── Tabel ber-workspace_id langsung ─────────────────────────────────────────
drop policy if exists calc_products_owner_all on public.calc_products;
drop policy if exists calc_products_member_read on public.calc_products;
create policy calc_products_member_read on public.calc_products
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists calc_products_member_write on public.calc_products;
create policy calc_products_member_write on public.calc_products
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists campaigns_owner_all on public.campaigns;
drop policy if exists campaigns_member_read on public.campaigns;
create policy campaigns_member_read on public.campaigns
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists campaigns_member_write on public.campaigns;
create policy campaigns_member_write on public.campaigns
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_action_log_owner_all on public.gmvmax_action_log;
drop policy if exists gmvmax_action_log_member_read on public.gmvmax_action_log;
create policy gmvmax_action_log_member_read on public.gmvmax_action_log
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_action_log_member_write on public.gmvmax_action_log;
create policy gmvmax_action_log_member_write on public.gmvmax_action_log
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_approvals_owner_all on public.gmvmax_approvals;
drop policy if exists gmvmax_approvals_member_read on public.gmvmax_approvals;
create policy gmvmax_approvals_member_read on public.gmvmax_approvals
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_approvals_member_write on public.gmvmax_approvals;
create policy gmvmax_approvals_member_write on public.gmvmax_approvals
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_boost_owner_all on public.gmvmax_boost;
drop policy if exists gmvmax_boost_member_read on public.gmvmax_boost;
create policy gmvmax_boost_member_read on public.gmvmax_boost
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_boost_member_write on public.gmvmax_boost;
create policy gmvmax_boost_member_write on public.gmvmax_boost
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_boost_sessions_owner_all on public.gmvmax_boost_sessions;
drop policy if exists gmvmax_boost_sessions_member_read on public.gmvmax_boost_sessions;
create policy gmvmax_boost_sessions_member_read on public.gmvmax_boost_sessions
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_boost_sessions_member_write on public.gmvmax_boost_sessions;
create policy gmvmax_boost_sessions_member_write on public.gmvmax_boost_sessions
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_campaign_settings_owner_all on public.gmvmax_campaign_settings;
drop policy if exists gmvmax_campaign_settings_member_read on public.gmvmax_campaign_settings;
create policy gmvmax_campaign_settings_member_read on public.gmvmax_campaign_settings
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_campaign_settings_member_write on public.gmvmax_campaign_settings;
create policy gmvmax_campaign_settings_member_write on public.gmvmax_campaign_settings
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_daily_facts_owner_read on public.gmvmax_daily_facts;
drop policy if exists gmvmax_daily_facts_member_read on public.gmvmax_daily_facts;
create policy gmvmax_daily_facts_member_read on public.gmvmax_daily_facts
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_daily_facts_member_write on public.gmvmax_daily_facts;
create policy gmvmax_daily_facts_member_write on public.gmvmax_daily_facts
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_exec_settings_owner_all on public.gmvmax_execution_settings;
drop policy if exists gmvmax_execution_settings_member_read on public.gmvmax_execution_settings;
create policy gmvmax_execution_settings_member_read on public.gmvmax_execution_settings
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_execution_settings_member_write on public.gmvmax_execution_settings;
create policy gmvmax_execution_settings_member_write on public.gmvmax_execution_settings
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_experiments_owner_all on public.gmvmax_experiments;
drop policy if exists gmvmax_experiments_member_read on public.gmvmax_experiments;
create policy gmvmax_experiments_member_read on public.gmvmax_experiments
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_experiments_member_write on public.gmvmax_experiments;
create policy gmvmax_experiments_member_write on public.gmvmax_experiments
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_feature_registry_owner_all on public.gmvmax_feature_registry;
drop policy if exists gmvmax_feature_registry_member_read on public.gmvmax_feature_registry;
create policy gmvmax_feature_registry_member_read on public.gmvmax_feature_registry
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_feature_registry_member_write on public.gmvmax_feature_registry;
create policy gmvmax_feature_registry_member_write on public.gmvmax_feature_registry
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_feature_registry_history_owner_all on public.gmvmax_feature_registry_history;
drop policy if exists gmvmax_feature_registry_history_member_read on public.gmvmax_feature_registry_history;
create policy gmvmax_feature_registry_history_member_read on public.gmvmax_feature_registry_history
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_feature_registry_history_member_write on public.gmvmax_feature_registry_history;
create policy gmvmax_feature_registry_history_member_write on public.gmvmax_feature_registry_history
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_import_audit_owner_read on public.gmvmax_import_audit;
drop policy if exists gmvmax_import_audit_member_read on public.gmvmax_import_audit;
create policy gmvmax_import_audit_member_read on public.gmvmax_import_audit
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_import_audit_member_write on public.gmvmax_import_audit;
create policy gmvmax_import_audit_member_write on public.gmvmax_import_audit
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_imports_owner_all on public.gmvmax_imports;
drop policy if exists gmvmax_imports_member_read on public.gmvmax_imports;
create policy gmvmax_imports_member_read on public.gmvmax_imports
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_imports_member_write on public.gmvmax_imports;
create policy gmvmax_imports_member_write on public.gmvmax_imports
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_notes_owner_all on public.gmvmax_notes;
drop policy if exists gmvmax_notes_member_read on public.gmvmax_notes;
create policy gmvmax_notes_member_read on public.gmvmax_notes
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_notes_member_write on public.gmvmax_notes;
create policy gmvmax_notes_member_write on public.gmvmax_notes
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_settings_owner_all on public.gmvmax_settings;
drop policy if exists gmvmax_settings_member_read on public.gmvmax_settings;
create policy gmvmax_settings_member_read on public.gmvmax_settings
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_settings_member_write on public.gmvmax_settings;
create policy gmvmax_settings_member_write on public.gmvmax_settings
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_skill_outputs_owner_read on public.gmvmax_skill_outputs;
drop policy if exists gmvmax_skill_outputs_member_read on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_member_read on public.gmvmax_skill_outputs
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_skill_outputs_member_write on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_member_write on public.gmvmax_skill_outputs
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_skill_outputs_owner_review on public.gmvmax_skill_outputs;
drop policy if exists gmvmax_skill_outputs_member_read on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_member_read on public.gmvmax_skill_outputs
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_skill_outputs_member_write on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_member_write on public.gmvmax_skill_outputs
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_snapshot_lineage_owner_read on public.gmvmax_snapshot_lineage;
drop policy if exists gmvmax_snapshot_lineage_member_read on public.gmvmax_snapshot_lineage;
create policy gmvmax_snapshot_lineage_member_read on public.gmvmax_snapshot_lineage
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_snapshot_lineage_member_write on public.gmvmax_snapshot_lineage;
create policy gmvmax_snapshot_lineage_member_write on public.gmvmax_snapshot_lineage
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_spark_auth_owner_all on public.gmvmax_spark_auth;
drop policy if exists gmvmax_spark_auth_member_read on public.gmvmax_spark_auth;
create policy gmvmax_spark_auth_member_read on public.gmvmax_spark_auth
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_spark_auth_member_write on public.gmvmax_spark_auth;
create policy gmvmax_spark_auth_member_write on public.gmvmax_spark_auth
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_sync_runs_owner_all on public.gmvmax_sync_runs;
drop policy if exists gmvmax_sync_runs_member_read on public.gmvmax_sync_runs;
create policy gmvmax_sync_runs_member_read on public.gmvmax_sync_runs
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_sync_runs_member_write on public.gmvmax_sync_runs;
create policy gmvmax_sync_runs_member_write on public.gmvmax_sync_runs
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists gmvmax_tenant_advertisers_owner_read on public.gmvmax_tenant_advertisers;
drop policy if exists gmvmax_tenant_advertisers_member_read on public.gmvmax_tenant_advertisers;
create policy gmvmax_tenant_advertisers_member_read on public.gmvmax_tenant_advertisers
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists gmvmax_tenant_advertisers_member_write on public.gmvmax_tenant_advertisers;
create policy gmvmax_tenant_advertisers_member_write on public.gmvmax_tenant_advertisers
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists periods_owner_all on public.periods;
drop policy if exists periods_member_read on public.periods;
create policy periods_member_read on public.periods
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists periods_member_write on public.periods;
create policy periods_member_write on public.periods
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists product_mapping_log_owner_all on public.product_mapping_log;
drop policy if exists product_mapping_log_member_read on public.product_mapping_log;
create policy product_mapping_log_member_read on public.product_mapping_log
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists product_mapping_log_member_write on public.product_mapping_log;
create policy product_mapping_log_member_write on public.product_mapping_log
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists product_mappings_owner_all on public.product_mappings;
drop policy if exists product_mappings_member_read on public.product_mappings;
create policy product_mappings_member_read on public.product_mappings
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists product_mappings_member_write on public.product_mappings;
create policy product_mappings_member_write on public.product_mappings
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists quadrant_priorities_owner_all on public.quadrant_priorities;
drop policy if exists quadrant_priorities_member_read on public.quadrant_priorities;
create policy quadrant_priorities_member_read on public.quadrant_priorities
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists quadrant_priorities_member_write on public.quadrant_priorities;
create policy quadrant_priorities_member_write on public.quadrant_priorities
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists store_datasets_owner_all on public.store_datasets;
drop policy if exists store_datasets_member_read on public.store_datasets;
create policy store_datasets_member_read on public.store_datasets
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists store_datasets_member_write on public.store_datasets;
create policy store_datasets_member_write on public.store_datasets
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists store_file_blobs_owner_all on public.store_file_blobs;
drop policy if exists store_file_blobs_member_read on public.store_file_blobs;
create policy store_file_blobs_member_read on public.store_file_blobs
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists store_file_blobs_member_write on public.store_file_blobs;
create policy store_file_blobs_member_write on public.store_file_blobs
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

drop policy if exists vouchers_owner_all on public.vouchers;
drop policy if exists vouchers_member_read on public.vouchers;
create policy vouchers_member_read on public.vouchers
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists vouchers_member_write on public.vouchers;
create policy vouchers_member_write on public.vouchers
  for all to authenticated using (public.can_ws_write(workspace_id))
  with check (public.can_ws_write(workspace_id));

-- ── workspaces: anggota melihat, hanya owner mengubah ───────────────────────
-- JEBAKAN: saat MEMBUAT workspace, pembuatnya belum jadi anggota — is_ws_owner()
-- pasti false. Karena itu INSERT dipisah (cukup `user_id = auth.uid()`), dan
-- trigger di bawah langsung mendaftarkannya sebagai owner. Tanpa itu, membuat
-- workspace baru akan gagal total.
drop policy if exists ws_owner_all on public.workspaces;
drop policy if exists ws_member_read on public.workspaces;
create policy ws_member_read on public.workspaces
  for select to authenticated using (public.is_ws_member(id));
drop policy if exists ws_insert_self on public.workspaces;
create policy ws_insert_self on public.workspaces
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists ws_owner_modify on public.workspaces;
create policy ws_owner_modify on public.workspaces
  for update to authenticated using (public.is_ws_owner(id)) with check (public.is_ws_owner(id));
drop policy if exists ws_owner_delete on public.workspaces;
create policy ws_owner_delete on public.workspaces
  for delete to authenticated using (public.is_ws_owner(id));

create or replace function public.workspaces_owner_membership() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (workspace_id, user_id) do nothing;
  return new;
end $$;
drop trigger if exists workspaces_add_owner_member on public.workspaces;
create trigger workspaces_add_owner_member after insert on public.workspaces
  for each row execute function public.workspaces_owner_membership();

-- ── tiktok_connections: anggota boleh melihat STATUS, hanya owner mengubah ──
-- Kolom token sendiri sudah tak terbaca siapa pun sejak 0051.
drop policy if exists tiktok_connections_owner_all on public.tiktok_connections;
drop policy if exists tiktok_connections_member_read on public.tiktok_connections;
create policy tiktok_connections_member_read on public.tiktok_connections
  for select to authenticated using (public.is_ws_member(workspace_id));
drop policy if exists tiktok_connections_owner_write on public.tiktok_connections;
create policy tiktok_connections_owner_write on public.tiktok_connections
  for all to authenticated using (public.is_ws_owner(workspace_id))
  with check (public.is_ws_owner(workspace_id));

-- ── Dua tabel yang workspace-nya lewat relasi induk ─────────────────────────
drop policy if exists gmvmax_creatives_owner_all on public.gmvmax_creatives;
drop policy if exists gmvmax_creatives_member_read on public.gmvmax_creatives;
create policy gmvmax_creatives_member_read on public.gmvmax_creatives
  for select to authenticated using (exists (
    select 1 from public.gmvmax_imports i
     where i.id = import_id and public.is_ws_member(i.workspace_id)));
drop policy if exists gmvmax_creatives_member_write on public.gmvmax_creatives;
create policy gmvmax_creatives_member_write on public.gmvmax_creatives
  for all to authenticated using (exists (
    select 1 from public.gmvmax_imports i
     where i.id = import_id and public.can_ws_write(i.workspace_id)))
  with check (exists (
    select 1 from public.gmvmax_imports i
     where i.id = import_id and public.can_ws_write(i.workspace_id)));

drop policy if exists products_owner_all on public.products;
drop policy if exists products_member_read on public.products;
create policy products_member_read on public.products
  for select to authenticated using (exists (
    select 1 from public.periods p
     where p.id = period_id and public.is_ws_member(p.workspace_id)));
drop policy if exists products_member_write on public.products;
create policy products_member_write on public.products
  for all to authenticated using (exists (
    select 1 from public.periods p
     where p.id = period_id and public.can_ws_write(p.workspace_id)))
  with check (exists (
    select 1 from public.periods p
     where p.id = period_id and public.can_ws_write(p.workspace_id)));

commit;
