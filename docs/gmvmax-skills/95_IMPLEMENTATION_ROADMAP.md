# Implementation Roadmap

---

## Phase 3A — Decision Intelligence Foundation

Implement:

- shared contract;
- daily facts;
- rule registry;
- Skill 1;
- Skill 2 V1;
- Skill 3;
- Skill 4;
- Skill 9;
- AI Insight read-only UI;
- explicit generation CLI;
- additive migrations prepared but not applied.

Do not implement production execution.

---

## Phase 3B — Real Output Validation

Generate daily outputs for:

- AsterixSty
- Dasfelix

Validate:

- canonical traceability;
- event usefulness;
- diagnosis accuracy;
- action relevance;
- confidence behavior;
- missing-data disclosure;
- Indonesian copy.

Revise rules before expansion.

---

## Phase 4 — Creative Experiment Foundation

Build:

- creative experiment tracker;
- H+1/H+3/H+7 checkpoints;
- status transitions;
- baseline/treatment comparison;
- winner/spike/fatigue evidence model;
- Skill 7 V1.

---

## Phase 5 — Optimization and Capital

Business-review and implement:

- Skill 5;
- Skill 6;
- approved Target ROI rules;
- budget guardrails;
- cooldown;
- break-even and cash-flow inputs.

---

## Phase 6 — LIVE

Only after LIVE data is available and stable:

- session facts;
- host/product mapping;
- Skill 8;
- LIVE evidence UI.

---

## Phase 7 — Approval Workflow

Build:

- action queue;
- approval records;
- reviewed/dismissed/snoozed states;
- before/after monitoring;
- H+1/H+3/H+7 action outcomes.

Still no automatic execution.

---

## Phase 8 — Limited Execution

Start with one low-risk, reversible, bounded action only after all prerequisites pass.

---

## Commit boundaries

Suggested commits:

```text
docs(gmvmax): define nine-skill specification pack
feat(gmvmax): add shared decision contracts and rule registry
feat(gmvmax): add daily facts and Skill 1
feat(gmvmax): add attribution audit V1
feat(gmvmax): add daily control tower and diagnosis
feat(gmvmax): add daily action plan orchestrator
feat(gmvmax): add AI Insight decision UI
```

Each commit must keep workers, timers, canonical logic, and TikTok mutation paths unchanged.
