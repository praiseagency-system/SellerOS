-- ============================================================================
-- GMV Max — DECISION INTELLIGENCE: Daily Facts persistence (Phase 3A 2C).
-- ADDITIVE & idempotent. Stores the deterministic output of buildDailyFacts()
-- per (workspace, store, date). NOT a canonical snapshot, NOT an action log,
-- NOT a recommendation store — those live elsewhere (gmvmax_imports/creatives,
-- gmvmax_action_log, gmvmax_sync_runs). This is derived, versioned, read-only
-- to the browser. NO token, NO raw MCP payload.
--
-- History model: identity = (workspace, store, date, deterministic_signature).
-- Same signature => same row (idempotent upsert by service_role). A DIFFERENT
-- signature for the same day => a NEW historical row (never overwrite). The
-- "current" facts for a day = latest generated_at. Nothing is silently replaced.
--
-- STORE_ID INVARIANT: store_id is text and has NO database FK, because there is
-- no authoritative `stores` table in this schema — store identity lives inside
-- gmvmax_tenant_advertisers(workspace_id, store_id) and gmvmax_campaign_settings.
-- The relation cannot be a DB FK. It is enforced at the APPLICATION level: the
-- read-only loader/pipeline only ever writes a (workspace_id, store_id) pair that
-- it resolved from that same workspace's canonical data (never user-supplied,
-- never cross-workspace). workspace_id IS FK-enforced below.
--
-- NOT APPLIED by this file. Run manually in Supabase SQL Editor after review.
-- ============================================================================

create table if not exists public.gmvmax_daily_facts (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  store_id               text not null,
  fact_date              date not null,
  timezone               text not null,
  currency               text not null,
  facts                  jsonb not null,
  comparisons            jsonb not null default '[]'::jsonb,
  data_quality           jsonb not null default '{}'::jsonb,
  source_snapshot_ids    jsonb not null default '[]'::jsonb,
  deterministic_signature text not null,
  builder_version        text not null,
  generated_at           timestamptz not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  -- JSON shape guards (practical CHECKs)
  constraint gmvmax_daily_facts_facts_is_array        check (jsonb_typeof(facts) = 'array'),
  constraint gmvmax_daily_facts_comparisons_is_array  check (jsonb_typeof(comparisons) = 'array'),
  constraint gmvmax_daily_facts_dq_is_object          check (jsonb_typeof(data_quality) = 'object'),
  constraint gmvmax_daily_facts_src_is_array          check (jsonb_typeof(source_snapshot_ids) = 'array')
);

-- Idempotent identity: same signature for a day = same row (upsert target).
create unique index if not exists gmvmax_daily_facts_identity
  on public.gmvmax_daily_facts (workspace_id, store_id, fact_date, deterministic_signature);
-- Workspace + date access patterns.
create index if not exists gmvmax_daily_facts_ws_date_idx
  on public.gmvmax_daily_facts (workspace_id, store_id, fact_date desc);
create index if not exists gmvmax_daily_facts_ws_idx
  on public.gmvmax_daily_facts (workspace_id);
-- "Current" = latest generated_at per (ws, store, date).
create index if not exists gmvmax_daily_facts_current_idx
  on public.gmvmax_daily_facts (workspace_id, store_id, fact_date, generated_at desc);

-- ── GRANTS: owner (authenticated) READ-only; service_role manages ─────────────
grant select on public.gmvmax_daily_facts to authenticated;
grant all    on public.gmvmax_daily_facts to service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.gmvmax_daily_facts enable row level security;

drop policy if exists gmvmax_daily_facts_owner_read on public.gmvmax_daily_facts;
create policy gmvmax_daily_facts_owner_read on public.gmvmax_daily_facts
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_daily_facts_admin_read on public.gmvmax_daily_facts;
create policy gmvmax_daily_facts_admin_read on public.gmvmax_daily_facts
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- SENGAJA: TIDAK ada policy/grant insert/update/delete utk authenticated →
-- browser tak bisa menulis (RLS default-deny). anon tanpa grant → ditolak.
-- Penulisan hanya via service_role (pipeline generasi non-produksi).
