# Claude Code Handoff Prompt

Copy the entire `gmvmax-skills-pack` folder into the SellerOS repository at:

```text
docs/gmvmax-skills/
```

Treat every file in this folder as the authoritative GMV Max nine-skill specification pack.

Proceed with a specification reconciliation and Phase 3A implementation plan.

Do not push.
Do not merge.
Do not deploy.
Do not apply migrations.
Do not modify timers.
Do not modify production workers.
Do not modify the canonical writer.
Do not call TikTok mutation endpoints.
Do not enable automatic execution.

## Authoritative scope

Implementable now:

- Shared skill contract
- Rule registry
- Daily facts foundation
- Skill 1
- Skill 2 V1 attribution reliability audit
- Skill 3
- Skill 4
- Skill 9
- Read-only AI Insight UI
- Explicit generation CLI
- Tests

Specification/framework only:

- Skill 5
- Skill 6
- Skill 7 beyond experiment-tracker foundation
- Skill 8

Do not invent values marked `TBD_BUSINESS_DECISION`.

`execution_allowed` must always remain `false`.

## Part 1 — Repository audit

Report:

- current branch and SHA;
- worktree state;
- open relevant PRs;
- existing AI Insight code;
- existing recommendation/diagnosis/action logic;
- existing hardcoded thresholds;
- existing tables and migrations;
- duplicated types or rule engines;
- reusable components;
- unrelated changes.

Create an isolated branch/worktree:

```text
phase3-decision-intelligence-foundation
```

Base it on the latest safe main.

## Part 2 — Specification reconciliation

For each file in the pack report:

- current code compliance;
- missing types;
- missing data;
- conflicts;
- hardcoded assumptions;
- migration needs;
- tests required.

Do not delete working code.

## Part 3 — Architecture proposal

Design:

```text
buildDailyFacts
→ runSkill1
→ runSkill2
→ runSkill3
→ runSkill4
→ runSkill9
→ persistSkillOutputs
```

Requirements:

- deterministic;
- idempotent;
- workspace-scoped;
- date-scoped;
- signature-based;
- no TikTok call required;
- no LLM required;
- no service role in browser;
- no canonical write.

## Part 4 — Persistence proposal

Inspect existing schema first.

Prepare additive migrations only if justified for:

- daily facts;
- skill outputs;
- events;
- recommendations;
- action plans.

Prefer a minimal model.

Requirements:

- RLS;
- owner read;
- browser writes denied;
- service role manages;
- admin consent follows existing policy;
- no production seed;
- no token;
- no raw MCP payload.

Do not apply migrations.

## Part 5 — Implementation

Implement only approved Phase 3A scope.

Skills 5–8 must remain behind specification/readiness gates and must not generate aggressive output from guessed thresholds.

## Part 6 — UI

Integrate into existing AI Insight area:

- Today’s Business Condition
- Data Confidence
- Top Changes
- Root Cause
- Recommended Actions
- Risks and Missing Data
- Last Generated
- Source Date
- Evidence drawer

Allowed controls:

- View evidence
- Mark reviewed
- Dismiss
- Snooze
- Export/copy

No execution button.

Support Indonesian and English.

## Part 7 — Tests

Run existing tests plus the matrices in:

- `93_TEST_SCENARIO_MATRIX.md`
- each skill specification

Required global assertions:

- no TikTok mutation;
- no canonical writer change;
- no timer change;
- no automatic execution;
- `execution_allowed=false`;
- workspace isolation;
- idempotency;
- source traceability;
- missing values not converted to zero;
- rule version persisted.

## Commit boundary

Create local commits only after tests pass.

Suggested:

```text
feat(gmvmax): add decision intelligence foundation
feat(gmvmax): add attribution audit and control tower
feat(gmvmax): add daily action plan UI
```

Do not push.

## Final report

```text
SPECIFICATION RECONCILIATION:
COMPLETE / PARTIAL / BLOCKED

SHARED CONTRACT:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

DAILY FACTS:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

SKILL 1:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

SKILL 2 V1:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

TRUE INCREMENTALITY:
NOT_IMPLEMENTED

SKILL 3:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

SKILL 4:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

SKILL 5:
SPEC_ONLY / PARTIAL / INCORRECTLY_IMPLEMENTED

SKILL 6:
SPEC_ONLY / PARTIAL / INCORRECTLY_IMPLEMENTED

SKILL 7:
SPEC_ONLY / EXPERIMENT_FOUNDATION / PARTIAL

SKILL 8:
SPEC_ONLY / DATA_BLOCKED / PARTIAL

SKILL 9:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

RULE REGISTRY:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

PERSISTENCE MIGRATION:
PREPARED / NOT_NEEDED / BLOCKED

UI:
IMPLEMENTED / PARTIAL / NOT_IMPLEMENTED

GENERATION CLI:
READY / PARTIAL / NOT_READY

DECISION TESTS:
...

WORKER TESTS:
...

LINT:
PASS / FAIL

VITE BUILD:
PASS / FAIL

TIKTOK MUTATION CALLS:
0

AUTOMATIC EXECUTION:
DISABLED

WORKERS:
UNCHANGED

TIMERS:
UNCHANGED

DATABASE MIGRATIONS:
NOT_APPLIED

PRODUCTION:
UNCHANGED

LOCAL COMMITS:
...

PUSH:
NOT_DONE

NEXT SAFE STEP:
Review local implementation and real AsterixSty/Dasfelix generated outputs before applying migrations or deploying.
```

Stop after the report.
