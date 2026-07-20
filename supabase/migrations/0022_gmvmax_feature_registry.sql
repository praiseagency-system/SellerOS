-- ============================================================================
-- GMV Max — FEATURE REGISTRY (Phase 1). READ-ONLY, per-tenant, historis.
-- Menyimpan kapabilitas GMV Max NYATA (runtime-verified) per workspace/store/
-- campaign/identity — MEMBEDAKAN "ada di schema MCP" vs "tersedia di runtime".
--
-- Sumber isi = worker/skrip read-only yang menormalkan respons MCP read-only
-- (store_list, campaign_get, campaign_gmv_max_info_get, bid_recommend,
-- session_list, identity_get, exclusive_authorization_get, store_product_get).
-- TIDAK ada endpoint tulis. TIDAK mengubah snapshot kanonik → aman, additive.
--
-- Dua tabel:
--   gmvmax_feature_registry          — STATE saat ini (current-view), 1 baris/fitur.
--   gmvmax_feature_registry_history  — APPEND-only, hanya saat state material berubah.
--
-- RLS: owner-all (pemilik workspace) + admin consent-based — SELARAS 0011/0020/0021.
-- Jalankan di Supabase Dashboard → SQL Editor.
-- ============================================================================

-- ─── STATE (current view) ────────────────────────────────────────────────────
create table if not exists public.gmvmax_feature_registry (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references auth.users (id) on delete set null, -- denormalisasi; RLS pakai workspace
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  brand_id            text,                        -- nullable (belum ada entitas brand terpisah)
  connection_id       uuid,                        -- nullable (belum ada FK stabil ke koneksi)
  advertiser_id       text,
  store_id            text,
  campaign_id         text,                        -- nullable (fitur tenant/identity level)
  identity_id         text,                        -- nullable
  feature_scope       text not null check (feature_scope in
                        ('STORE','CAMPAIGN','PRODUCT','CREATIVE','IDENTITY','LIVE','TENANT')),
  feature_code        text not null,
  availability_status text not null check (availability_status in
                        ('AVAILABLE','ENABLED','ACTIVE','INACTIVE','NOT_AVAILABLE','ROLLOUT_LIMITED',
                         'AUTHORIZATION_MISMATCH','PERMISSION_DENIED','UNKNOWN','NOT_RETURNED',
                         'DATA_UNAVAILABLE','SCHEMA_ONLY')),
  -- Phase 1: EXECUTE_RUNTIME_VERIFIED DILARANG (belum ada eksekusi terverifikasi).
  capability_level    text not null check (capability_level in
                        ('READ','MONITOR','RECOMMEND','EXECUTE_SCHEMA_ONLY','EXECUTE_RUNTIME_VERIFIED')),
  enabled             boolean,                     -- nullable (tak semua fitur punya makna enabled)
  active              boolean,                     -- nullable
  source              text not null check (source in
                        ('MCP','OFFICIAL_API','SELLER_CENTER','FILE_IMPORT','MANUAL_INPUT','DERIVED','SCHEMA_INSPECTION')),
  confidence          text not null check (confidence in ('HIGH','MEDIUM','LOW','DATA_UNAVAILABLE')),
  signature           text,                        -- ringkasan state material → deteksi perubahan
  first_detected_at   timestamptz not null default now(),
  last_detected_at    timestamptz not null default now(),
  last_changed_at     timestamptz,                 -- nullable (di-set saat state berubah)
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Identitas unik NULL-safe: campaign_id/identity_id NULL diperlakukan sebagai ''.
-- (UNIQUE biasa memperlakukan NULL sebagai distinct → tak cukup untuk fitur tenant.)
create unique index if not exists gmvmax_feature_registry_key
  on public.gmvmax_feature_registry
     (workspace_id, store_id, feature_code, coalesce(campaign_id, ''), coalesce(identity_id, ''));

create index if not exists gmvmax_feature_registry_ws_idx        on public.gmvmax_feature_registry (workspace_id);
create index if not exists gmvmax_feature_registry_store_idx     on public.gmvmax_feature_registry (workspace_id, store_id);
create index if not exists gmvmax_feature_registry_campaign_idx  on public.gmvmax_feature_registry (workspace_id, campaign_id);
create index if not exists gmvmax_feature_registry_code_idx      on public.gmvmax_feature_registry (workspace_id, feature_code);
create index if not exists gmvmax_feature_registry_avail_idx     on public.gmvmax_feature_registry (workspace_id, availability_status);
create index if not exists gmvmax_feature_registry_seen_idx      on public.gmvmax_feature_registry (workspace_id, last_detected_at desc);

-- ─── HISTORY (append-only; hanya saat state material berubah) ─────────────────
create table if not exists public.gmvmax_feature_registry_history (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces (id) on delete cascade,
  store_id            text,
  campaign_id         text,
  identity_id         text,
  feature_code        text not null,
  change_type         text not null check (change_type in ('DETECTED','CHANGED')),
  prev_availability_status text,
  new_availability_status  text,
  prev_enabled        boolean,
  new_enabled         boolean,
  prev_active         boolean,
  new_active          boolean,
  prev_signature      text,
  new_signature       text,
  metadata            jsonb not null default '{}'::jsonb,
  detected_at         timestamptz not null default now()
);

create index if not exists gmvmax_feature_registry_history_ws_idx
  on public.gmvmax_feature_registry_history (workspace_id, detected_at desc);
create index if not exists gmvmax_feature_registry_history_feature_idx
  on public.gmvmax_feature_registry_history (workspace_id, feature_code, detected_at desc);

-- ─── GRANTS ──────────────────────────────────────────────────────────────────
grant select, insert, update, delete on public.gmvmax_feature_registry         to authenticated;
grant select, insert, update, delete on public.gmvmax_feature_registry_history to authenticated;
grant all on public.gmvmax_feature_registry         to service_role;
grant all on public.gmvmax_feature_registry_history to service_role;

-- ─── RLS (selaras pola gmvmax_* lain) ────────────────────────────────────────
alter table public.gmvmax_feature_registry         enable row level security;
alter table public.gmvmax_feature_registry_history enable row level security;

-- registry: owner-all
drop policy if exists gmvmax_feature_registry_owner_all on public.gmvmax_feature_registry;
create policy gmvmax_feature_registry_owner_all on public.gmvmax_feature_registry
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_feature_registry_admin_read on public.gmvmax_feature_registry;
create policy gmvmax_feature_registry_admin_read on public.gmvmax_feature_registry
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- history: owner-all
drop policy if exists gmvmax_feature_registry_history_owner_all on public.gmvmax_feature_registry_history;
create policy gmvmax_feature_registry_history_owner_all on public.gmvmax_feature_registry_history
  for all using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_feature_registry_history_admin_read on public.gmvmax_feature_registry_history;
create policy gmvmax_feature_registry_history_admin_read on public.gmvmax_feature_registry_history
  for select using (
    exists (select 1 from public.workspaces w
            where w.id = workspace_id and public.admin_can_view(w.user_id))
  );
