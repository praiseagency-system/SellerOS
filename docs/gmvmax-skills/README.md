# GMV Max Nine-Skill Specification Pack

**Product:** SellerOS / GMV Max Decision Intelligence  
**Pack version:** `1.0.0-draft`  
**Purpose:** Authoritative specification pack for Claude Code implementation  
**Execution policy:** Read-only intelligence first; no TikTok mutation; no automatic execution  

---

## 1. Product objective

SellerOS must transform canonical GMV Max data into a controlled decision system:

```text
Canonical data
→ Daily facts
→ Detected events
→ Attribution audit
→ Root-cause diagnosis
→ Domain recommendations
→ Prioritized daily action plan
→ Human approval
→ Limited execution in a future phase
```

The product must not behave like an unconstrained AI chatbot. Every conclusion must be traceable to facts, evidence, rules, confidence, and limitations.

---

## 2. The nine skills

| Code | Skill | Current readiness |
|---|---|---|
| `GMVMAX_SKILL_01` | Business & Data Blueprint | READY_FOR_IMPLEMENTATION |
| `GMVMAX_SKILL_02` | Attribution & Incrementality Audit | V1 READY; full incrementality requires business review/data |
| `GMVMAX_SKILL_03` | Daily Control Tower | READY_FOR_IMPLEMENTATION |
| `GMVMAX_SKILL_04` | Root Cause Diagnosis | READY_FOR_IMPLEMENTATION |
| `GMVMAX_SKILL_05` | Target ROI & Optimization Mode Engine | BUSINESS_REVIEW_REQUIRED |
| `GMVMAX_SKILL_06` | Capital Allocation Engine | BUSINESS_REVIEW_REQUIRED |
| `GMVMAX_SKILL_07` | Creative & Affiliate Supply Engine | BUSINESS_REVIEW_REQUIRED |
| `GMVMAX_SKILL_08` | LIVE GMV Max Growth Engine | DRAFT / DATA_DEPENDENCY_BLOCKED |
| `GMVMAX_SKILL_09` | Daily Action Plan Orchestrator | READY_FOR_IMPLEMENTATION |

Only Skill 9 may publish the final prioritized daily plan. Skills 1–8 produce facts, audits, diagnoses, opportunities, recommendations, risks, and constraints.

---

## 3. Dependency graph

```text
Skill 1 ───────────────┐
                       ├→ Skill 3 → Skill 4 ──────────────┐
Skill 2 ───────────────┘                                  │
                                                          ├→ Skill 9
Skill 5 ← Skill 1 + Skill 2 + Skill 3 + Skill 4 ──────────┤
Skill 6 ← Skill 1 + Skill 2 + Skill 3 + Skill 4 + Skill 5 ┤
Skill 7 ← Skill 1 + Skill 3 + Skill 4 + experiments ──────┤
Skill 8 ← Skill 1 + LIVE facts + Skill 2 + Skill 4 ───────┘
```

Skill 9 must not hide conflicts between upstream skills.

---

## 4. Current authoritative production context

- Canonical GMV Max production data already exists for AsterixSty and Dasfelix.
- Existing production canonical workers and timers remain authoritative.
- Multi-tenant shadow is read-only and separate.
- Dasfelix advertiser `7663` is active PRIMARY.
- Dasfelix advertiser `7214` is retained as inactive LEGACY lineage.
- Feature Registry and campaign settings are read-only inputs.
- No TikTok mutation endpoint is approved.
- `execution_allowed` must always be `false`.
- No service-role credential may be exposed to browser code.
- No skill may modify canonical data.

---

## 5. Files in this pack

```text
README.md
00_SHARED_SKILL_CONTRACT.md
01_BUSINESS_DATA_BLUEPRINT.md
02_ATTRIBUTION_INCREMENTALITY_AUDIT.md
03_DAILY_CONTROL_TOWER.md
04_ROOT_CAUSE_DIAGNOSIS.md
05_TARGET_ROI_OPTIMIZATION_ENGINE.md
06_CAPITAL_ALLOCATION_ENGINE.md
07_CREATIVE_AFFILIATE_SUPPLY_ENGINE.md
08_LIVE_GMV_MAX_GROWTH_ENGINE.md
09_DAILY_ACTION_PLAN_ORCHESTRATOR.md
90_RULE_REGISTRY.md
91_DATA_DEPENDENCY_MATRIX.md
92_CONFIDENCE_AND_SEVERITY_MODEL.md
93_TEST_SCENARIO_MATRIX.md
94_EXECUTION_AND_APPROVAL_BOUNDARIES.md
95_IMPLEMENTATION_ROADMAP.md
CLAUDE_HANDOFF_PROMPT.md
GMV_MAX_SKILLS_MASTER_SPEC.md
```

---

## 6. Required implementation principles

1. Deterministic core logic; no LLM required for facts, rules, diagnosis, or actions.
2. Every output is workspace-scoped and date-scoped.
3. Every conclusion includes evidence and confidence.
4. Missing data remains missing; it is never converted to zero.
5. Rules use stable IDs and versioning.
6. Unresolved thresholds use `TBD_BUSINESS_DECISION`.
7. Safe default is `OBSERVE` or `DO_NOT_EXECUTE`.
8. Outputs are idempotent and signature-based.
9. Skill 9 is the sole final action orchestrator.
10. No automatic execution.

---

## 7. Recommended implementation order

```text
Shared contract
→ Daily facts
→ Rule registry
→ Skill 1
→ Skill 2 V1
→ Skill 3
→ Skill 4
→ Skill 9
→ Creative Experiment Tracker
→ Skill 7
→ Skill 5
→ Skill 6
→ Skill 8
→ Approval workflow
→ Limited execution
```

Skills 5–8 may have skeletons and interfaces before their business rules are approved, but they must not produce aggressive recommendations from guessed thresholds.

---

## 8. Status vocabulary

```text
DRAFT
BUSINESS_REVIEW_REQUIRED
READY_FOR_IMPLEMENTATION
IMPLEMENTED
VALIDATED
```

A skill may only become `VALIDATED` after real tenant output is reviewed against canonical data and operational expectations.

---

## 9. How Claude Code should use this pack

1. Copy the folder to `docs/gmvmax-skills/`.
2. Treat these files as authoritative product contracts.
3. Audit current code before adding duplicate engines.
4. Reconcile existing types and rules with the shared contract.
5. Implement only the approved slice for each skill.
6. Keep all `TBD_BUSINESS_DECISION` values unresolved.
7. Stop before push, migration application, deploy, timer changes, or production writes.
