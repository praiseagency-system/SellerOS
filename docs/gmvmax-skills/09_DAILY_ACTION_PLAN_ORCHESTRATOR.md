# Skill 9 — Daily Action Plan Orchestrator

**Skill code:** `GMVMAX_SKILL_09`  
**Version:** `1.0.0-draft`  
**Readiness:** `READY_FOR_IMPLEMENTATION`  
**Role:** Convert upstream outputs into one prioritized daily plan  

---

## 1. Objective

Skill 9 is the only skill allowed to produce the final prioritized action plan.

It consumes outputs from Skills 1–8, resolves conflicts, respects constraints, and returns a small number of actions.

Default maximum:

```text
3 primary actions
3 secondary observations
```

---

## 2. Required inputs

- Skill 1 readiness
- Skill 2 constraints
- Skill 3 events
- Skill 4 diagnoses
- Skill 5 recommendations when available
- Skill 6 recommendations when available
- Skill 7 recommendations when available
- Skill 8 recommendations when available
- Approval history
- Cooldowns
- Existing unresolved actions

---

## 3. Orchestration principles

1. Data-quality and safety constraints outrank growth opportunities.
2. Skill 2 may block or downgrade Skills 5 and 6.
3. Skill 4 diagnosis must support action rationale.
4. Conflicting upstream outputs must be shown, not hidden.
5. Low confidence defaults to `OBSERVE`.
6. Incomplete data defaults to `DO_NOT_EXECUTE` or `OBSERVE`.
7. Duplicate actions must be merged.
8. Stale actions must expire.
9. Existing cooldowns must be respected.
10. No automatic execution.

---

## 4. Action statuses

```text
OBSERVE
RECOMMEND
REQUIRE_APPROVAL
SAFE_TO_EXECUTE
DO_NOT_EXECUTE
```

`SAFE_TO_EXECUTE` is classification only.

---

## 5. Priority model

Suggested priority order:

1. Critical data-quality risk
2. Preventable financial loss
3. High-confidence growth opportunity
4. Operational bottleneck
5. Experiment or observation
6. Low-materiality cleanup

Numeric weights:

```text
TBD_BUSINESS_DECISION
```

Until approved, use deterministic severity/confidence/materiality ordering.

---

## 6. Conflict resolution

Examples:

### Skill 5 says review lower Target ROI, Skill 2 says late attribution high

Final action:

```text
OBSERVE
Do not change Target ROI until attribution matures.
```

### Skill 6 says increase budget, Skill 7 says creative supply is weak

Final action:

```text
REQUIRE_APPROVAL
Resolve creative supply before considering a budget increase.
```

### Skill 3 detects GMV decline, Skill 4 has insufficient evidence

Final action:

```text
OBSERVE
Investigate the decline; no setting change is justified yet.
```

---

## 7. Output

```ts
type DailyActionPlan = {
  date: string;
  workspace_id: string;
  primary_actions: Recommendation[];
  secondary_observations: Recommendation[];
  blocked_actions: Recommendation[];
  conflicts: Array<{
    conflict_id: string;
    source_skills: string[];
    description: string;
    resolution: string;
  }>;
  plan_confidence: string;
  generated_at: string;
  expires_at: string;
  execution_allowed: false;
};
```

Every action must include:

- status;
- priority;
- target scope;
- title;
- explanation;
- evidence;
- expected impact;
- risk;
- confidence;
- approval requirement;
- expiry;
- follow-up window;
- success metric;
- stop condition;
- source skills.

---

## 8. Rules

### `GMVMAX-S9-SAFETY-001`

A blocked upstream data condition prevents aggressive action.

### `GMVMAX-S9-LIMIT-001`

Enforce the maximum action count.

### `GMVMAX-S9-CONFLICT-001`

Conflicting actions must be resolved explicitly.

### `GMVMAX-S9-DUPLICATE-001`

Merge actions with the same target and objective.

### `GMVMAX-S9-EXPIRY-001`

Expired actions must not be reused.

### `GMVMAX-S9-APPROVAL-001`

Any action affecting budget, Target ROI, optimization mode, campaign, boost, or external outreach requires approval.

### `GMVMAX-S9-EXECUTION-001`

`execution_allowed=false` for every action.

---

## 9. UI placement

Suggested page: **AI Insight → Today’s Action Plan**

Sections:

- Today’s Business Condition
- Top 3 Actions
- Secondary Observations
- Blocked Actions
- Conflicts
- Risks and Missing Data
- Evidence drawer
- Last generated

Allowed controls:

- View evidence
- Mark reviewed
- Dismiss
- Snooze
- Copy/export summary

No execution button.

---

## 10. Tests

1. Healthy day → observe/maintain
2. Data-quality block outranks growth
3. Low confidence → observe
4. Three-action maximum
5. Duplicate actions merge
6. Conflicting actions resolved
7. Budget action requires approval
8. Target ROI action requires approval
9. Expired action removed
10. Existing cooldown respected
11. Missing Skill 5–8 outputs
12. No automatic execution
13. Workspace isolation
14. Idempotent rerun
15. Indonesian/English labels

---

## 11. Acceptance criteria

- Skill 9 is the only final action planner.
- Maximum action count is enforced.
- Conflicts are visible.
- Skill 2 constraints are honored.
- Every action has evidence and expiry.
- `execution_allowed=false`.
