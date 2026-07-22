-- ============================================================================
-- GMV Max — DECISION INTELLIGENCE: Skill Outputs persistence (Phase 3A 2C).
-- ADDITIVE & idempotent. Stores validated SkillOutput envelopes (Skills 1/2/3/
-- 4/9) per (workspace, store, date, skill, scope). One minimal JSONB payload
-- table instead of separate event/diagnosis/recommendation/action-plan tables —
-- those are denormalizable from `payload` via JSONB and have no independent
-- lifecycle yet (documented decision, see DECISION note below). NO token, NO
-- raw MCP payload, NO execution state. execution_allowed stays false in payload.
--
-- DECISION (Part 3): a single gmvmax_skill_outputs table is used because (a) the
-- review lifecycle (reviewed/dismissed/snoozed) is per skill-output, not per
-- nested item; (b) events/diagnoses/actions are queried together as one plan;
-- (c) JSONB + GIN covers the current read patterns. Split later only if a
-- concrete per-item query or lifecycle emerges.
--
-- STORE_ID INVARIANT: same as 0026 — no `stores` table exists, so store_id has
-- no DB FK; it is an application-level invariant (loader resolves store_id from
-- the same workspace's canonical data; never cross-workspace). workspace_id is
-- FK-enforced. rule_versions stores ruleMetaFor() objects
-- [{rule_id, rule_version, rule_type}] so rule provenance is persisted with type.
--
-- NOT APPLIED by this file. Run manually in Supabase SQL Editor after review.
-- ============================================================================

create table if not exists public.gmvmax_skill_outputs (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces (id) on delete cascade,
  store_id               text not null,
  output_date            date not null,
  skill_code             text not null,
  skill_version          text not null,
  scope_type             text not null,
  scope_id               text not null,
  status                 text not null,
  severity               text not null,
  confidence             text not null,
  payload                jsonb not null,
  source_snapshot_ids    jsonb not null default '[]'::jsonb,
  rule_ids               jsonb not null default '[]'::jsonb,
  rule_versions          jsonb not null default '[]'::jsonb,
  deterministic_signature text not null,
  generated_at           timestamptz not null,
  expires_at             timestamptz not null,
  reviewed_at            timestamptz,
  dismissed_at           timestamptz,
  snoozed_until          timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  constraint gmvmax_skill_outputs_skill_code_chk check (skill_code in
    ('GMVMAX_SKILL_01','GMVMAX_SKILL_02','GMVMAX_SKILL_03','GMVMAX_SKILL_04',
     'GMVMAX_SKILL_05','GMVMAX_SKILL_06','GMVMAX_SKILL_07','GMVMAX_SKILL_08','GMVMAX_SKILL_09')),
  constraint gmvmax_skill_outputs_scope_type_chk check (scope_type in
    ('WORKSPACE','STORE','CAMPAIGN','PRODUCT','CREATIVE','AFFILIATE','LIVE_SESSION')),
  constraint gmvmax_skill_outputs_status_chk check (status in
    ('OBSERVE','RECOMMEND','REQUIRE_APPROVAL','SAFE_TO_EXECUTE','DO_NOT_EXECUTE')),
  constraint gmvmax_skill_outputs_severity_chk   check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  constraint gmvmax_skill_outputs_confidence_chk check (confidence in ('HIGH','MEDIUM','LOW','DATA_INSUFFICIENT')),
  constraint gmvmax_skill_outputs_payload_is_object check (jsonb_typeof(payload) = 'object'),
  constraint gmvmax_skill_outputs_src_is_array     check (jsonb_typeof(source_snapshot_ids) = 'array'),
  constraint gmvmax_skill_outputs_rules_is_array   check (jsonb_typeof(rule_ids) = 'array'),
  -- Invariant: no output may claim execution is allowed.
  constraint gmvmax_skill_outputs_no_execution     check (coalesce((payload->>'execution_allowed')::boolean, false) = false)
);

-- Idempotent identity: same signature = same row (upsert target); different
-- signature = new historical row (never overwrite).
create unique index if not exists gmvmax_skill_outputs_identity
  on public.gmvmax_skill_outputs
     (workspace_id, store_id, output_date, skill_code, scope_type, scope_id, deterministic_signature);
create index if not exists gmvmax_skill_outputs_ws_date_idx
  on public.gmvmax_skill_outputs (workspace_id, store_id, output_date desc);
create index if not exists gmvmax_skill_outputs_ws_skill_idx
  on public.gmvmax_skill_outputs (workspace_id, skill_code, output_date desc);
create index if not exists gmvmax_skill_outputs_ws_idx
  on public.gmvmax_skill_outputs (workspace_id);

-- ── GRANTS: owner READ-only; service_role manages ────────────────────────────
grant select on public.gmvmax_skill_outputs to authenticated;
grant all    on public.gmvmax_skill_outputs to service_role;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.gmvmax_skill_outputs enable row level security;

drop policy if exists gmvmax_skill_outputs_owner_read on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_owner_read on public.gmvmax_skill_outputs
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and w.user_id = auth.uid())
  );

drop policy if exists gmvmax_skill_outputs_admin_read on public.gmvmax_skill_outputs;
create policy gmvmax_skill_outputs_admin_read on public.gmvmax_skill_outputs
  for select using (
    exists (select 1 from public.workspaces w where w.id = workspace_id and public.admin_can_view(w.user_id))
  );

-- SENGAJA: TIDAK ada policy/grant insert/update/delete utk authenticated →
-- browser read-only. anon ditolak. Tulis hanya via service_role.
