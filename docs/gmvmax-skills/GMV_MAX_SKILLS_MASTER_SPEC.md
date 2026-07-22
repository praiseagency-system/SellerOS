# GMV Max Skills Master Specification

**Combined reference file. Individual files remain canonical by section.**


---

<!-- BEGIN README.md -->

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

<!-- END README.md -->


---

<!-- BEGIN 00_SHARED_SKILL_CONTRACT.md -->

# Shared Skill Contract

**Contract version:** `1.0.0-draft`  
**Applies to:** Skills 1–9  
**Automatic execution:** Always disabled in the current phase  

---

## 1. Required envelope

```ts
type SkillCode =
  | "GMVMAX_SKILL_01"
  | "GMVMAX_SKILL_02"
  | "GMVMAX_SKILL_03"
  | "GMVMAX_SKILL_04"
  | "GMVMAX_SKILL_05"
  | "GMVMAX_SKILL_06"
  | "GMVMAX_SKILL_07"
  | "GMVMAX_SKILL_08"
  | "GMVMAX_SKILL_09";

type ActionStatus =
  | "OBSERVE"
  | "RECOMMEND"
  | "REQUIRE_APPROVAL"
  | "SAFE_TO_EXECUTE"
  | "DO_NOT_EXECUTE";

type Confidence =
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "DATA_INSUFFICIENT";

type Severity =
  | "INFO"
  | "LOW"
  | "MEDIUM"
  | "HIGH"
  | "CRITICAL";

type MeasurementLabel =
  | "MEASURED"
  | "DERIVED"
  | "INFERRED"
  | "UNKNOWN"
  | "NOT_MEASURABLE";

type ScopeType =
  | "WORKSPACE"
  | "STORE"
  | "CAMPAIGN"
  | "PRODUCT"
  | "CREATIVE"
  | "AFFILIATE"
  | "LIVE_SESSION";

type SkillOutput = {
  skill_code: SkillCode;
  skill_version: string;

  workspace_id: string;
  store_id: string;
  date: string;
  timezone: string;
  currency: string;

  scope_type: ScopeType;
  scope_id: string;

  status: ActionStatus;
  severity: Severity;
  confidence: Confidence;

  title: string;
  summary: string;

  facts: Fact[];
  evidence: Evidence[];
  comparisons: Comparison[];
  detected_events: DetectedEvent[];
  diagnoses: Diagnosis[];
  recommendations: Recommendation[];

  missing_data: MissingData[];
  limitations: Limitation[];
  risks: Risk[];

  generated_at: string;
  expires_at: string;

  source_snapshot_ids: string[];
  rule_ids: string[];
  deterministic_signature: string;

  execution_allowed: false;
};
```

---

## 2. Fact contract

```ts
type Fact = {
  fact_id: string;
  metric: string;
  value: number | string | boolean | null;
  unit?: string | null;
  measurement_label: MeasurementLabel;
  scope_type: ScopeType;
  scope_id: string;
  source_snapshot_ids: string[];
  observed_at?: string | null;
  notes?: string[];
};
```

---

## 3. Evidence contract

```ts
type Evidence = {
  evidence_id: string;
  evidence_type:
    | "METRIC"
    | "COMPARISON"
    | "SETTING"
    | "FEATURE"
    | "SOURCE_STATUS"
    | "EXPERIMENT"
    | "HISTORY"
    | "RULE";
  description: string;
  supports: string[];
  contradicts?: string[];
  source_snapshot_ids: string[];
};
```

---

## 4. Comparison contract

```ts
type Comparison = {
  comparison_id: string;
  metric: string;
  current_value: number | null;
  comparison_value: number | null;
  absolute_change: number | null;
  percentage_change: number | null;
  current_window: string;
  comparison_window: string;
  comparable: boolean;
  reason_not_comparable?: string | null;
};
```

---

## 5. Event contract

```ts
type DetectedEvent = {
  event_id: string;
  event_type: string;
  category:
    | "PERFORMANCE"
    | "EFFICIENCY"
    | "DELIVERY"
    | "CREATIVE_SUPPLY"
    | "PRODUCT_HEALTH"
    | "ATTRIBUTION"
    | "CAPITAL"
    | "LIVE"
    | "DATA_QUALITY";
  scope_type: ScopeType;
  scope_id: string;
  severity: Severity;
  confidence: Confidence;
  title: string;
  description: string;
  evidence_ids: string[];
  rule_id: string;
  detected_at: string;
  expires_at: string;
};
```

---

## 6. Diagnosis contract

```ts
type DiagnosisLevel =
  | "CONFIRMED_DRIVER"
  | "LIKELY_DRIVER"
  | "CONTRIBUTING_FACTOR"
  | "CORRELATED_SIGNAL"
  | "INSUFFICIENT_EVIDENCE";

type Diagnosis = {
  diagnosis_id: string;
  outcome: string;
  candidate_driver: string;
  level: DiagnosisLevel;
  confidence: Confidence;
  evidence_for: string[];
  evidence_against: string[];
  alternative_explanations: string[];
  missing_data: string[];
  recommended_observation_window: string;
};
```

---

## 7. Recommendation contract

```ts
type Recommendation = {
  recommendation_id: string;
  status: ActionStatus;
  priority: number;
  target_scope_type: ScopeType;
  target_scope_id: string;

  title: string;
  explanation: string;

  evidence_ids: string[];
  source_skills: SkillCode[];

  expected_impact: {
    direction: "POSITIVE" | "NEUTRAL" | "RISK_REDUCTION" | "UNKNOWN";
    metric?: string | null;
    estimate?: number | null;
    unit?: string | null;
    basis: MeasurementLabel;
  };

  risk: {
    level: Severity;
    description: string;
  };

  confidence: Confidence;
  approval_required: boolean;
  expiry_time: string;
  follow_up_window: string;
  success_metric: string;
  stop_condition: string;

  execution_allowed: false;
};
```

---

## 8. Missing data contract

```ts
type MissingData = {
  field: string;
  required_for: string[];
  impact:
    | "NONE"
    | "LOWER_CONFIDENCE"
    | "BLOCK_RECOMMENDATION"
    | "BLOCK_SKILL";
  reason: string;
};
```

---

## 9. Deterministic signature

The signature must be generated from stable fields such as:

```text
skill_code
skill_version
workspace_id
store_id
date
scope_type
scope_id
source_snapshot_ids
rule_ids
normalized facts
```

Narrative text must not be the sole signature input.

---

## 10. Status behavior

### `OBSERVE`

Use when evidence is incomplete, still maturing, or no action is justified.

### `RECOMMEND`

Use for a clearly supported manual next step with limited risk.

### `REQUIRE_APPROVAL`

Use for a material action that may affect spend, ROI, delivery, or business risk.

### `SAFE_TO_EXECUTE`

Classification only. `execution_allowed` remains false.

### `DO_NOT_EXECUTE`

Use when the proposed action is unsafe, data is incomplete, or a downstream constraint blocks action.

---

## 11. Expiry

Every event, diagnosis, and recommendation must expire.

Default expiries remain configurable:

```text
TBD_BUSINESS_DECISION
```

No stale recommendation may be silently reused.

---

## 12. Localization

All visible titles and summaries must support:

- Indonesian
- English

Stable codes, rule IDs, and enum values remain in English.

---

## 13. Security boundaries

- No token in payload.
- No raw MCP payload.
- No service-role credential in browser.
- No cross-workspace source IDs.
- No automatic mutation.
- No canonical write.
- No execution button in the current phase.

<!-- END 00_SHARED_SKILL_CONTRACT.md -->


---

<!-- BEGIN 01_BUSINESS_DATA_BLUEPRINT.md -->

# Skill 1 — Business & Data Blueprint

**Skill code:** `GMVMAX_SKILL_01`  
**Version:** `1.0.0-draft`  
**Readiness:** `READY_FOR_IMPLEMENTATION`  
**Role:** Establish business structure, data availability, and downstream skill readiness  

---

## 1. Objective

Skill 1 creates an authoritative map of what exists, what is active, what is measurable, and whether downstream skills have enough reliable data.

It answers:

- Which workspace, store, campaigns, products, creatives, advertisers, and features exist?
- Which sources are active, inactive, legacy, or unavailable?
- Which metrics are available?
- How fresh and complete is the data?
- Which skills are ready, partial, or blocked?

It must not recommend optimization actions.

---

## 2. Inputs

### Required

- Workspace identity
- Store identity
- Canonical snapshot
- Campaign inventory
- Product inventory
- Creative inventory
- Feature Registry
- Sync-run metadata
- Source lineage
- Timezone and currency

### Optional

- Affiliate data
- LIVE data
- Experiment tracker
- Approval history
- Margin data
- Organic data

---

## 3. Output sections

```text
BUSINESS_STRUCTURE
ADVERTISER_STRUCTURE
ACTIVE_CAMPAIGNS
ACTIVE_PRODUCTS
CREATIVE_SUPPLY
FEATURE_CAPABILITIES
DATA_AVAILABILITY
DATA_FRESHNESS
DATA_QUALITY
KNOWN_LIMITATIONS
DOWNSTREAM_SKILL_READINESS
```

---

## 4. Business structure

Required fields:

```ts
type BusinessStructure = {
  workspace_id: string;
  workspace_name: string;
  store_id: string;
  store_name?: string | null;
  timezone: string;
  currency: string;
  active_advertisers: Array<{
    advertiser_id: string;
    role: "PRIMARY" | "LEGACY" | "SECONDARY";
    is_active: boolean;
    connection_group_id: string;
  }>;
  historical_advertisers: Array<{
    advertiser_id: string;
    role: string;
    effective_to?: string | null;
    reason?: string | null;
  }>;
};
```

---

## 5. Campaign inventory

Report:

- total campaigns;
- active campaigns;
- paused/inactive campaigns;
- campaign types;
- campaign settings availability;
- current Target ROI;
- current budget;
- optimization mode;
- feature support;
- missing settings.

No campaign mutation is allowed.

---

## 6. Product inventory

Report:

- active products;
- products with spend;
- products with revenue;
- products with zero orders;
- products missing mapping;
- product concentration;
- product-level metric availability.

Do not classify a product as unhealthy solely because it has no spend.

---

## 7. Creative supply

Report:

- total creatives;
- delivering;
- spending;
- learning;
- inactive;
- rejected/excluded when available;
- newly detected;
- creative status freshness;
- creative-level data availability.

---

## 8. Feature capabilities

For each capability report:

```ts
type FeatureCapability = {
  feature_code: string;
  available: boolean | null;
  enabled: boolean | null;
  source: "FEATURE_REGISTRY" | "SETTING" | "UNKNOWN";
  confidence: "HIGH" | "MEDIUM" | "LOW" | "DATA_INSUFFICIENT";
  limitation?: string | null;
};
```

Capabilities include:

- Target ROI
- Recommended ROI
- Max Delivery
- Auto Budget Increase
- Promotion Days
- ROI Protection
- Accelerate Testing
- Creative Boost
- LIVE features
- Other discovered features

Do not infer feature availability from UI labels alone when runtime evidence is absent.

---

## 9. Data quality

Assess:

- snapshot freshness;
- pagination completeness;
- expected-source completion;
- canonical status;
- parity status;
- missing required fields;
- lineage completeness;
- timezone consistency;
- currency consistency.

---

## 10. Downstream skill readiness

```ts
type SkillReadiness = {
  skill_code: string;
  status: "READY" | "PARTIAL" | "BLOCKED";
  reasons: string[];
  missing_data: string[];
  constraints: string[];
};
```

Minimum behavior:

- Skill 2 requires canonical and sync metadata.
- Skill 3 requires comparable daily facts.
- Skill 4 requires events and enough evidence.
- Skill 5 requires Skill 2 confidence and settings.
- Skill 6 requires Skill 2 confidence plus capital constraints.
- Skill 7 requires creative and experiment data.
- Skill 8 requires LIVE data.
- Skill 9 requires at least one valid upstream result.

---

## 11. Rules

### `GMVMAX-S1-STRUCTURE-001`

A workspace/store identity mismatch blocks all downstream skills.

### `GMVMAX-S1-SOURCE-001`

Expected active advertiser sources must be explicit.

Inactive LEGACY sources remain in lineage but are excluded from forward processing.

### `GMVMAX-S1-PAGINATION-001`

Incomplete pagination blocks downstream skills that require complete aggregates.

### `GMVMAX-S1-FRESHNESS-001`

Stale snapshots lower readiness.

Freshness thresholds:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S1-CURRENCY-001`

Unknown or mixed currency blocks aggregate calculations.

### `GMVMAX-S1-TIMEZONE-001`

Unknown timezone blocks date-level comparisons.

---

## 12. Confidence

High confidence requires:

- complete identity;
- complete source lineage;
- complete pagination;
- current canonical snapshot;
- no hard mismatch;
- required fields available.

Missing optional data may produce `MEDIUM` rather than block the skill.

---

## 13. UI placement

Suggested page: **AI Insight → Business & Data Blueprint**

Cards:

- Business structure
- Active campaigns
- Product coverage
- Creative supply
- Feature capabilities
- Data confidence
- Skill readiness

No optimization buttons.

---

## 14. Tests

1. Healthy single-advertiser tenant
2. Multi-advertiser group
3. Inactive LEGACY source excluded from active count
4. Missing campaign settings
5. Missing product mapping
6. Incomplete pagination
7. Stale canonical snapshot
8. Currency mismatch
9. Timezone missing
10. Feature Registry unavailable
11. Skill 8 blocked by missing LIVE data
12. Workspace isolation
13. Idempotent rerun
14. Indonesian/English labels
15. No recommendation generated

---

## 15. Acceptance criteria

- Complete business map is persisted or returned deterministically.
- Every downstream skill has readiness status.
- No optimization recommendation is emitted.
- All missing data is explicit.
- Legacy lineage is preserved.
- No TikTok calls are required.
- `execution_allowed=false`.

<!-- END 01_BUSINESS_DATA_BLUEPRINT.md -->


---

<!-- BEGIN 02_ATTRIBUTION_INCREMENTALITY_AUDIT.md -->

# Skill 2 — Attribution & Incrementality Audit

**Skill code:** `GMVMAX_SKILL_02`  
**Canonical name:** Attribution & Incrementality Audit  
**Version:** `1.0.0-draft`  
**Readiness status:** `BUSINESS_REVIEW_REQUIRED`  
**Implementation slice:** `V1_ATTRIBUTION_RELIABILITY_AUDIT` is ready to implement  
**Final action authority:** None  
**Automatic execution:** Prohibited  
**Primary consumers:** Skill 4, Skill 5, Skill 6, Skill 9  

---

## 1. Skill identity

Skill 2 audits how trustworthy reported GMV Max performance is for decision-making.

It must distinguish:

1. **What TikTok reports**
2. **How complete and mature the data is**
3. **How much late attribution may still change the result**
4. **What can be inferred about incrementality**
5. **What cannot be measured without experiments**
6. **Whether the data is safe enough for optimization decisions**

Skill 2 is not a profit engine, budget engine, or causal experiment engine. Its main role is to prevent downstream skills from acting aggressively on data that is incomplete, immature, or easy to misinterpret.

---

## 2. Product objective

The skill must answer:

- Is the reported revenue complete enough to use?
- Is the date still inside a late-attribution window?
- Are cost, revenue, orders, and campaign rows internally consistent?
- Does the canonical snapshot reconcile with available sources?
- Is the reported ROI mature or still likely to move?
- Is there evidence of organic overlap or cannibalization?
- Can true incrementality be measured?
- How confident should SellerOS be when recommending ROI, budget, or optimization-mode changes?
- Should downstream skills proceed, observe, reduce confidence, or stop?

The skill must reduce false certainty.

---

## 3. Questions answered

### 3.1 Reported attribution

- What cost, revenue, orders, and ROI are reported for the selected scope and date?
- Which attribution source produced them?
- What attribution window is known or assumed?
- Are the numbers final, provisional, or still maturing?

### 3.2 Data completeness

- Did pagination complete?
- Were all expected sources processed?
- Did any source fail?
- Did multi-advertiser merging complete?
- Are required fields available?
- Does canonical data reconcile with source-level totals?

### 3.3 Late attribution

- How much have historical values changed between pulls?
- How many hours or days have elapsed since the performance date?
- Is revenue still increasing without corresponding new spend?
- Is the date mature enough for aggressive decisions?

### 3.4 Incrementality

- Is there an experiment, holdout, geo split, audience split, time split, or other causal control?
- If not, what can be inferred and what remains unknown?
- Is the system observing reported attributed performance only?
- Is organic overlap measurable?
- Is cannibalization measurable?

### 3.5 Decision readiness

- Are Skills 5, 6, and 9 allowed to produce aggressive recommendations?
- Must they prefer `OBSERVE`?
- Must they return `DO_NOT_EXECUTE`?
- Is the data suitable only for descriptive reporting?

---

## 4. Non-goals

Skill 2 must not:

- Claim true incrementality from reported ROAS alone
- Claim causality from correlation
- Estimate organic sales displacement without supporting data
- Automatically change Target ROI, budget, or campaign settings
- Replace a proper holdout or controlled experiment
- Treat current store eligibility as proof that historical report data is inaccessible
- Hide data-quality failures behind a high-level summary
- Convert unknown values into zeros
- Mark data as final solely because a scheduled job completed
- Invent a TikTok attribution window when it is not available from a trusted source
- Use an LLM as the source of truth for formulas or classifications

---

## 5. Dependencies

### Required

| Dependency | Classification | Purpose |
|---|---|---|
| Canonical daily performance | REQUIRED | Cost, revenue, orders, ROI |
| Sync-run metadata | REQUIRED | Freshness, source count, errors, pagination |
| Workspace/store identity | REQUIRED | Tenant isolation |
| Source snapshot identifiers | REQUIRED | Traceability |
| Report date and pull timestamp | REQUIRED | Attribution maturity |
| Canonical completeness status | REQUIRED | Decision gating |

### Optional

| Dependency | Classification | Purpose |
|---|---|---|
| Source-level advertiser results | OPTIONAL | Multi-source reconciliation |
| Historical snapshot versions | OPTIONAL | Late-attribution drift |
| Organic sales data | OPTIONAL | Organic overlap analysis |
| Total store sales | OPTIONAL | Paid share and cannibalization signals |
| Holdout experiment data | OPTIONAL | True incrementality |
| Campaign settings history | OPTIONAL | Explain changes in delivery |
| Product-level performance | OPTIONAL | Scope-specific attribution checks |
| Creative-level performance | OPTIONAL | Concentration and source consistency |
| Approval and action history | OPTIONAL | Detect decision contamination |
| External margin data | OPTIONAL | Profitability context, not incrementality |

When an optional dependency is absent, the output must explicitly state what becomes unmeasurable.

---

## 6. Required inputs

```ts
type Skill2Input = {
  workspaceId: string;
  storeId: string;
  date: string;

  canonicalSnapshot: {
    snapshotId: string;
    generatedAt: string;
    sourceDate: string;
    cost: number | null;
    netCost: number | null;
    grossRevenue: number | null;
    netRevenue: number | null;
    orders: number | null;
    roi: number | null;
    campaigns: number | null;
    creativeRows: number | null;
    paginationComplete: boolean | null;
    canonicalStatus: string;
  };

  syncRun: {
    runId: string;
    startedAt: string;
    completedAt: string | null;
    status: string;
    sourcesExpected: number | null;
    sourcesProcessed: number | null;
    sourcesFailed: number | null;
    errors: unknown[];
    warnings: unknown[];
    gitSha?: string | null;
    releaseId?: string | null;
    bundleChecksum?: string | null;
  };

  priorSnapshots?: Array<{
    snapshotId: string;
    observedAt: string;
    cost: number | null;
    grossRevenue: number | null;
    orders: number | null;
    roi: number | null;
  }>;

  sourceBreakdown?: Array<{
    sourceType: string;
    sourceId: string;
    status: string;
    cost: number | null;
    grossRevenue: number | null;
    orders: number | null;
    roi: number | null;
    campaigns: number | null;
    creativeRows: number | null;
    paginationComplete: boolean | null;
  }>;

  experimentEvidence?: ExperimentEvidence | null;
  organicEvidence?: OrganicEvidence | null;
};
```

All monetary values must use the canonical currency for the workspace.

---

## 7. Optional inputs

### Experiment evidence

```ts
type ExperimentEvidence = {
  experimentId: string;
  design:
    | "RANDOMIZED_HOLDOUT"
    | "GEO_HOLDOUT"
    | "AUDIENCE_HOLDOUT"
    | "TIME_BASED_HOLDOUT"
    | "SWITCHBACK"
    | "OTHER";
  startAt: string;
  endAt?: string | null;
  treatmentScope: string;
  controlScope: string;
  sampleSizeTreatment?: number | null;
  sampleSizeControl?: number | null;
  measuredLift?: number | null;
  confidenceIntervalLow?: number | null;
  confidenceIntervalHigh?: number | null;
  statisticalConfidence?: number | null;
  designLimitations: string[];
};
```

### Organic evidence

```ts
type OrganicEvidence = {
  totalStoreRevenue?: number | null;
  paidAttributedRevenue?: number | null;
  organicRevenue?: number | null;
  directTrafficRevenue?: number | null;
  brandedSearchRevenue?: number | null;
  baselinePeriod?: {
    startDate: string;
    endDate: string;
  } | null;
  limitations: string[];
};
```

---

## 8. Derived metrics

### 8.1 Reported ROI

```text
reported_roi = gross_revenue / cost
```

Use only when both values are non-null and cost > 0.

If cost is zero:

- revenue > 0 → `ROI_UNDEFINED_WITH_ZERO_COST`
- revenue = 0 → `NO_ACTIVITY`
- missing revenue → `DATA_INSUFFICIENT`

Do not force an infinite ROI into the UI.

### 8.2 Data completeness score

The score must be explainable and component-based.

Suggested components:

| Component | Meaning |
|---|---|
| Source completion | Expected sources successfully processed |
| Pagination completion | All pages retrieved |
| Required-field coverage | Required metrics present |
| Canonical reconciliation | Canonical equals valid source aggregate |
| Snapshot traceability | Snapshot IDs and run metadata present |
| Error severity | Whether errors affect decision reliability |

Suggested structure:

```text
data_completeness_score =
weighted combination of approved components
```

**Weights:** `TBD_BUSINESS_DECISION`

Until weights are approved, implementation may return component results and a conservative categorical classification without a numeric composite score.

### 8.3 Attribution maturity age

```text
maturity_age_hours =
canonical_snapshot.generated_at - end_of_source_date_in_workspace_timezone
```

This must use the workspace timezone.

### 8.4 Late-attribution drift

For snapshots of the same source date:

```text
revenue_drift_absolute =
latest_gross_revenue - earliest_comparable_gross_revenue

revenue_drift_percent =
revenue_drift_absolute / earliest_comparable_gross_revenue
```

Equivalent calculations may be used for orders and ROI.

Do not calculate percentage drift when the denominator is zero or null.

### 8.5 Source reconciliation delta

```text
expected_combined_revenue =
sum(valid_non_duplicate_source_revenue)

reconciliation_delta =
canonical_revenue - expected_combined_revenue
```

This calculation is valid only when:

- all expected sources are represented;
- pagination is complete;
- duplicate-identity guard passes;
- currencies and date scopes match.

### 8.6 Paid attributed share

When total store revenue is available:

```text
paid_attributed_share =
paid_attributed_revenue / total_store_revenue
```

This is descriptive, not causal. A high paid-attributed share does not prove cannibalization.

### 8.7 Measured incremental lift

Only when valid experiment evidence exists:

```text
incremental_lift =
treatment_outcome - counterfactual_outcome
```

The actual estimator depends on experiment design and must be stored with the experiment result. Skill 2 must not recreate a causal estimator from incomplete summary data.

---

## 9. Comparison windows

Skill 2 may compare:

- Current pull vs prior pull for the same source date
- Current source date vs D-1 maturity at the same elapsed age
- Current source date vs trailing comparable dates
- Source aggregate vs canonical
- Paid-attributed revenue vs total store revenue
- Treatment vs control when a valid experiment exists

Approved default maturity windows:

- `TBD_BUSINESS_DECISION`

The implementation must support configurable windows rather than hardcoded assumptions.

Recommended candidate labels for business review:

- `EARLY`
- `MATURING`
- `STABLE`
- `FINAL_ENOUGH_FOR_DAILY_DECISION`

The exact hour boundaries remain `TBD_BUSINESS_DECISION`.

---

## 10. Minimum sample requirements

No universal minimum sample is assumed.

Minimum sample may vary by conclusion:

| Conclusion | Required sample |
|---|---|
| Reported performance | Any complete non-null observation |
| Late-attribution drift | At least 2 comparable snapshots |
| Trend stability | Multiple comparable dates |
| Product/campaign concentration | Complete scoped breakdown |
| Incrementality | Valid treatment/control design |
| Cannibalization inference | Organic/total-store evidence across approved baseline |
| Budget recommendation readiness | Defined by Skill 5, constrained by this skill |

All numeric thresholds remain `TBD_BUSINESS_DECISION`.

When minimum sample is not met, the skill must downgrade confidence or return `DATA_INSUFFICIENT`.

---

## 11. Core output concepts

Skill 2 must produce the following sections.

### 11.1 `REPORTED_PERFORMANCE`

Describes what the platform reports.

Example:

```json
{
  "measurement_status": "MEASURED",
  "cost": 1234666,
  "gross_revenue": 11652303,
  "orders": 74,
  "reported_roi": 9.44,
  "source_date": "2026-07-20",
  "snapshot_id": "..."
}
```

### 11.2 `DATA_COMPLETENESS`

```json
{
  "classification": "COMPLETE",
  "sources_expected": 1,
  "sources_processed": 1,
  "sources_failed": 0,
  "pagination_complete": true,
  "required_fields_complete": true,
  "canonical_reconciled": true
}
```

Allowed classifications:

- `COMPLETE`
- `MOSTLY_COMPLETE`
- `PARTIAL`
- `INCOMPLETE`
- `UNKNOWN`

Threshold mapping remains `TBD_BUSINESS_DECISION`.

### 11.3 `ATTRIBUTION_CONFIDENCE`

Allowed values:

- `HIGH`
- `MEDIUM`
- `LOW`
- `DATA_INSUFFICIENT`

This assesses confidence that reported attribution is internally reliable, not that it is incremental.

### 11.4 `LATE_ATTRIBUTION_RISK`

Allowed values:

- `LOW`
- `MEDIUM`
- `HIGH`
- `UNKNOWN`

It must include:

- age of data;
- observed drift;
- number of comparable snapshots;
- expected recheck time;
- whether optimization should wait.

### 11.5 `ORGANIC_OVERLAP`

Allowed classifications:

- `MEASURED`
- `INFERRED`
- `UNKNOWN`
- `NOT_MEASURABLE`

A value may only be `MEASURED` if the required organic and total-store data are available under an approved method.

### 11.6 `INCREMENTALITY_CONFIDENCE`

Allowed values:

- `HIGH`
- `MEDIUM`
- `LOW`
- `UNKNOWN`
- `NOT_MEASURABLE`

Default without experiment evidence:

```text
NOT_MEASURABLE
```

Reported ROI must not be converted into incrementality confidence.

### 11.7 `CANNIBALIZATION_RISK`

Allowed values:

- `LOW`
- `MEDIUM`
- `HIGH`
- `UNKNOWN`
- `NOT_MEASURABLE`

Without valid evidence, return `UNKNOWN` or `NOT_MEASURABLE`.

### 11.8 `DECISION_READINESS`

Allowed values:

- `READY_FOR_DESCRIPTIVE_ANALYSIS`
- `READY_FOR_CONSERVATIVE_OPTIMIZATION`
- `READY_FOR_AGGRESSIVE_OPTIMIZATION`
- `OBSERVE_ONLY`
- `BLOCKED`

`READY_FOR_AGGRESSIVE_OPTIMIZATION` must remain unavailable until business rules and evidence standards are explicitly approved.

---

## 12. Measurement labels

Every conclusion must be labeled:

- `MEASURED`
- `INFERRED`
- `UNKNOWN`
- `NOT_MEASURABLE`

Definitions:

### `MEASURED`

Directly calculated from available trusted data.

### `INFERRED`

Supported by indirect evidence but not causally proven.

### `UNKNOWN`

Potentially measurable, but current data is missing or insufficient.

### `NOT_MEASURABLE`

Cannot be measured under the current data design.

Examples:

| Conclusion | Label |
|---|---|
| Reported cost | MEASURED |
| Canonical-source reconciliation | MEASURED |
| Revenue still drifting | MEASURED |
| Likely attribution immaturity | INFERRED |
| Organic overlap without organic data | UNKNOWN |
| True incrementality without experiment | NOT_MEASURABLE |
| Cannibalization from ROAS alone | NOT_MEASURABLE |

---

## 13. Confidence calculation

Skill 2 confidence must be factor-based.

### Confidence factors

1. Source freshness
2. Pagination completeness
3. Expected-source completion
4. Required-field coverage
5. Canonical reconciliation
6. Snapshot maturity
7. Historical drift stability
8. Cross-source consistency
9. Experiment quality, when applicable
10. Known attribution limitations

Suggested evaluation:

```ts
type ConfidenceFactor = {
  factor: string;
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  evidence: unknown[];
  impact: "LOW" | "MEDIUM" | "HIGH";
};
```

### Overall classification

- `HIGH`: all critical factors pass and no material contradiction
- `MEDIUM`: usable with limitations or moderate maturity risk
- `LOW`: material incompleteness, instability, or unresolved mismatch
- `DATA_INSUFFICIENT`: required evidence absent

Exact scoring weights remain `TBD_BUSINESS_DECISION`.

A high reported ROI must never directly cause high confidence.

---

## 14. Severity calculation

Severity reflects decision risk, not business performance quality.

Suggested severity triggers:

### `CRITICAL`

- Cross-tenant contamination
- Canonical reconciliation materially fails
- Expected source silently missing
- Pagination incomplete while output marked complete
- Data scope or currency mismatch
- Automatic execution attempted despite `execution_allowed=false`

### `HIGH`

- Source failure materially changes totals
- Attribution data too immature for requested action
- Duplicate identity prevents safe aggregation
- Experiment result invalidated
- Missing required data for budget or ROI recommendation

### `MEDIUM`

- Moderate late-attribution drift
- Some optional metrics missing
- Organic overlap unknown
- Historical transition date requires caution

### `LOW`

- Minor drift
- Non-material missing optional fields
- Descriptive output remains trustworthy

### `INFO`

- Data complete and stable
- Incrementality not measurable but clearly disclosed

Numeric materiality thresholds remain `TBD_BUSINESS_DECISION`.

---

## 15. Rules

### Rule registry format

```ts
type Skill2Rule = {
  ruleId: string;
  ruleVersion: string;
  status: "DRAFT" | "REVIEW_REQUIRED" | "APPROVED" | "DEPRECATED";
  description: string;
  requiredMetrics: string[];
  comparisonWindow?: string;
  minimumSample?: string;
  threshold?: unknown;
  output: unknown;
  downstreamConstraint?: unknown;
};
```

### Initial rule catalog

#### `GMVMAX-S2-COMPLETE-001`

**Name:** Expected source completion  
**Status:** `READY_FOR_IMPLEMENTATION`

If:

- sources expected is known;
- sources processed equals expected;
- sources failed is zero;

Then:

- source completion passes.

If any expected source fails:

- data completeness cannot be `COMPLETE`.

---

#### `GMVMAX-S2-PAGINATION-001`

**Name:** Pagination completeness  
**Status:** `READY_FOR_IMPLEMENTATION`

If pagination is not explicitly complete:

- aggressive optimization readiness is blocked;
- confidence cannot be `HIGH`.

---

#### `GMVMAX-S2-RECONCILE-001`

**Name:** Canonical reconciliation  
**Status:** `READY_FOR_IMPLEMENTATION`

If valid source aggregates equal canonical within approved tolerance:

- reconciliation passes.

Tolerance:

- `TBD_BUSINESS_DECISION`

Until approved, exact equality is required for deterministic financial fields, except where documented rounding differences exist.

---

#### `GMVMAX-S2-LATE-001`

**Name:** Late-attribution drift detection  
**Status:** `READY_FOR_IMPLEMENTATION`

If multiple comparable snapshots for the same source date show revenue, orders, or ROI changing:

- late-attribution drift is measured;
- the output must report absolute and percentage change.

Risk thresholds:

- `TBD_BUSINESS_DECISION`

---

#### `GMVMAX-S2-MATURITY-001`

**Name:** Attribution maturity classification  
**Status:** `BUSINESS_REVIEW_REQUIRED`

Inputs:

- source date;
- current timestamp;
- platform attribution characteristics;
- observed historical drift.

Window boundaries:

- `TBD_BUSINESS_DECISION`

---

#### `GMVMAX-S2-INCREMENTAL-001`

**Name:** Incrementality evidence requirement  
**Status:** `READY_FOR_IMPLEMENTATION`

If no valid experiment evidence exists:

- incrementality confidence = `NOT_MEASURABLE`;
- the skill must not claim incremental lift.

---

#### `GMVMAX-S2-ORGANIC-001`

**Name:** Organic overlap evidence requirement  
**Status:** `READY_FOR_IMPLEMENTATION`

If total-store and organic evidence are absent:

- organic overlap = `UNKNOWN` or `NOT_MEASURABLE`;
- downstream skills must not treat attributed revenue as fully incremental.

---

#### `GMVMAX-S2-TRANSITION-001`

**Name:** Historical advertiser transition  
**Status:** `READY_FOR_IMPLEMENTATION`

For a bounded migration transition:

- preserve source lineage;
- distinguish historical completeness from current operational eligibility;
- do not interpret a current store-list mismatch as proof that historical data never existed;
- forward-looking readiness may remain high when legacy sources are inactive and zero for post-migration dates.

---

#### `GMVMAX-S2-BLOCK-001`

**Name:** Hard decision block  
**Status:** `READY_FOR_IMPLEMENTATION`

Set decision readiness to `BLOCKED` when any occurs:

- cross-tenant contamination;
- unknown currency or date scope;
- canonical reconciliation hard mismatch;
- required source missing without accepted explanation;
- duplicate identity prevents safe aggregation;
- pagination incomplete;
- critical required fields absent.

---

#### `GMVMAX-S2-OBSERVE-001`

**Name:** Observe-only constraint  
**Status:** `READY_FOR_IMPLEMENTATION`

Set decision readiness to `OBSERVE_ONLY` when:

- data is complete enough for description;
- but maturity, drift, or confidence is insufficient for optimization.

---

#### `GMVMAX-S2-DOWNSTREAM-001`

**Name:** Downstream skill constraint  
**Status:** `READY_FOR_IMPLEMENTATION`

Skill 2 must emit explicit constraints for Skills 5, 6, and 9.

Example:

```json
{
  "target_skill": "GMVMAX_SKILL_05",
  "constraint": "NO_AGGRESSIVE_CHANGE",
  "reason": "LATE_ATTRIBUTION_RISK_HIGH",
  "expires_at": "..."
}
```

---

## 16. Missing-data behavior

### Missing canonical snapshot

Return:

- confidence = `DATA_INSUFFICIENT`
- decision readiness = `BLOCKED`
- severity = `HIGH`

### Missing prior snapshots

Late-attribution drift:

- `UNKNOWN`

Do not infer stability from a single snapshot.

### Missing organic data

Organic overlap:

- `UNKNOWN` or `NOT_MEASURABLE`

Incrementality:

- unchanged; usually `NOT_MEASURABLE`

### Missing experiment data

True incrementality:

- `NOT_MEASURABLE`

### Missing source-level breakdown

Canonical reconciliation may still be unavailable even if canonical data exists.

Return:

- descriptive performance may remain measured;
- cross-source completeness = `UNKNOWN`;
- downstream confidence must reflect this.

### Partial pagination

- data completeness = `INCOMPLETE` or `PARTIAL`
- aggressive recommendations blocked
- `execution_allowed=false`

### Source failure

- report the failed source;
- do not silently treat zero as valid;
- decision readiness is `BLOCKED` or `OBSERVE_ONLY` depending on materiality and whether the source is expected to contribute.

Materiality logic:

- `TBD_BUSINESS_DECISION`

---

## 17. Output contract

Skill 2 must comply with the shared skill contract.

```ts
type Skill2Output = {
  skill_code: "GMVMAX_SKILL_02";
  skill_version: string;
  workspace_id: string;
  store_id: string;
  date: string;
  scope_type: "WORKSPACE" | "CAMPAIGN" | "PRODUCT";
  scope_id: string;

  status:
    | "OBSERVE"
    | "RECOMMEND"
    | "REQUIRE_APPROVAL"
    | "SAFE_TO_EXECUTE"
    | "DO_NOT_EXECUTE";

  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence: "HIGH" | "MEDIUM" | "LOW" | "DATA_INSUFFICIENT";

  title: string;
  summary: string;

  facts: Array<{
    fact_id: string;
    measurement_label:
      | "MEASURED"
      | "INFERRED"
      | "UNKNOWN"
      | "NOT_MEASURABLE";
    metric: string;
    value: unknown;
    source_snapshot_ids: string[];
  }>;

  evidence: unknown[];
  comparisons: unknown[];
  detected_events: unknown[];

  diagnoses: Array<{
    diagnosis_type: string;
    measurement_label:
      | "MEASURED"
      | "INFERRED"
      | "UNKNOWN"
      | "NOT_MEASURABLE";
    evidence_for: unknown[];
    evidence_against: unknown[];
    confidence: string;
  }>;

  recommendations: Array<{
    status: "OBSERVE" | "RECOMMEND" | "DO_NOT_EXECUTE";
    title: string;
    reason: string;
    target_skill?: string;
    expiry: string;
  }>;

  attribution_audit: {
    reported_performance: unknown;
    data_completeness: unknown;
    attribution_confidence: unknown;
    late_attribution_risk: unknown;
    organic_overlap: unknown;
    incrementality_confidence: unknown;
    cannibalization_risk: unknown;
    decision_readiness: unknown;
  };

  downstream_constraints: Array<{
    target_skill: "GMVMAX_SKILL_05" | "GMVMAX_SKILL_06" | "GMVMAX_SKILL_09";
    constraint:
      | "NONE"
      | "OBSERVE_ONLY"
      | "NO_AGGRESSIVE_CHANGE"
      | "NO_BUDGET_INCREASE"
      | "NO_TARGET_ROI_CHANGE"
      | "BLOCK_ACTION_PLAN";
    reason: string;
    expires_at: string;
  }>;

  missing_data: string[];
  limitations: string[];
  risks: string[];

  generated_at: string;
  expires_at: string;
  source_snapshot_ids: string[];
  rule_ids: string[];

  execution_allowed: false;
};
```

---

## 18. Recommendation boundaries

Skill 2 may recommend:

- Wait for attribution maturity
- Re-run after a defined observation window
- Treat results as descriptive only
- Require a source-reconciliation check
- Run a controlled experiment
- Avoid aggressive budget changes
- Avoid Target ROI changes
- Investigate missing source data
- Mark a historical transition window as limited
- Proceed with conservative optimization when data is complete and stable

Skill 2 must not recommend:

- Exact budget increase or decrease
- Exact Target ROI value
- Activating Max Delivery
- Activating Promotion Days
- Activating Auto Budget Increase
- Creative boost execution
- Campaign mutations
- Declaring paid revenue fully incremental
- Declaring cannibalization without evidence

---

## 19. Downstream constraints

### Skill 5 — Target ROI & Optimization Mode

| Skill 2 result | Constraint |
|---|---|
| Pagination incomplete | No Target ROI change |
| Late-attribution risk high | Observe only |
| Reconciliation hard mismatch | Block |
| Attribution confidence low | No aggressive mode change |
| Incrementality not measurable | Optimization may use reported efficiency, but must disclose limitation |
| Data complete and stable | Conservative recommendations allowed |

### Skill 6 — Capital Allocation

| Skill 2 result | Constraint |
|---|---|
| Missing source | No budget increase |
| Canonical mismatch | Block reallocation |
| Low sample | Testing budget only, if approved |
| Late attribution high | Delay reallocation |
| Complete and stable | Conservative allocation permitted |

### Skill 9 — Daily Action Plan

Skill 9 must surface Skill 2 constraints, not hide them.

Example:

```text
OBSERVE
Wait 24 hours before changing Target ROI because reported revenue is still maturing.

DO_NOT_EXECUTE
Do not increase budget while canonical and source-level totals are mismatched.
```

---

## 20. Edge cases

### 20.1 Zero cost with revenue

Do not calculate infinite ROI. Mark:

- `ROI_UNDEFINED_WITH_ZERO_COST`
- investigate organic or delayed attribution

### 20.2 Revenue changes after date close

Measure drift and update maturity risk.

### 20.3 Campaign moved between advertiser accounts

Keep source lineage. Use historical and current roles separately.

### 20.4 Duplicate campaign identities across sources

Do not blindly sum. Mark:

- data incomplete;
- reconciliation blocked;
- severity high.

### 20.5 Canonical exists but source breakdown is missing

Reported performance remains measured. Source reconciliation remains unknown.

### 20.6 Source count changes over time

Use membership effective dates and lineage metadata. Do not compare source counts without historical context.

### 20.7 Late attribution increases revenue but not orders

Report the inconsistency. Do not automatically interpret it as valid maturity.

### 20.8 Currency mismatch

Block aggregation and decision readiness.

### 20.9 Timezone mismatch

Block date-level reconciliation until normalized.

### 20.10 Small denominators

Avoid percentage claims when base values are too small.

Minimum denominators:

- `TBD_BUSINESS_DECISION`

---

## 21. UI placement

Suggested placement inside **AI Insight → Data Confidence**.

### Primary card

- Reported ROI
- Attribution confidence
- Data completeness
- Late-attribution risk
- Decision readiness

### Evidence drawer

- Snapshot timestamp
- Source count
- Pagination
- Canonical reconciliation
- Drift history
- Missing data
- Known limitations
- Measurement labels

### Incrementality section

Show prominently:

```text
True incrementality:
NOT MEASURABLE

Reason:
No approved holdout or controlled experiment is available.
```

Avoid presenting this as an error. It is an honest limitation.

### Warning examples

```text
Data masih berubah karena late attribution. Tunda perubahan Target ROI.
```

```text
ROAS yang dilaporkan tinggi, tetapi incremental lift belum dapat diukur.
```

```text
Satu sumber advertiser gagal diproses. Jangan gunakan data ini untuk menaikkan budget.
```

---

## 22. Generation workflow

```text
loadCanonicalSnapshot
→ loadSyncRunMetadata
→ loadSourceBreakdown
→ loadPriorSnapshotVersions
→ evaluateCompleteness
→ evaluateReconciliation
→ evaluateLateAttribution
→ evaluateOrganicOverlap
→ evaluateIncrementalityEvidence
→ calculateDecisionReadiness
→ emitDownstreamConstraints
→ persistSkillOutput
```

Requirements:

- deterministic;
- workspace-scoped;
- date-scoped;
- idempotent;
- safe to rerun;
- no TikTok calls required;
- no LLM required;
- no canonical writes;
- no automatic execution.

---

## 23. Persistence guidance

Skill 2 should persist:

- output payload;
- deterministic signature;
- source snapshot IDs;
- rule IDs;
- generated timestamp;
- expiry timestamp;
- confidence;
- severity;
- decision readiness;
- downstream constraints.

It should not persist:

- tokens;
- raw MCP payloads;
- secrets;
- unredacted error payloads;
- speculative causal narratives without evidence labels.

---

## 24. Test scenarios

### Required tests

1. Complete stable snapshot → high attribution confidence
2. Missing canonical snapshot → blocked
3. Pagination incomplete → no aggressive recommendation
4. One expected source failed → completeness not complete
5. Canonical equals valid source aggregate → reconciliation match
6. Canonical differs from valid source aggregate → hard mismatch
7. Historical snapshot revenue increases → measured late attribution
8. Only one snapshot exists → late-attribution stability unknown
9. No experiment → incrementality not measurable
10. Valid experiment → incrementality result surfaced
11. Organic data missing → organic overlap unknown
12. Zero cost with revenue → no infinite ROI
13. Duplicate identities → aggregation blocked
14. Currency mismatch → blocked
15. Timezone mismatch → blocked
16. Legacy advertiser transition → historical/current distinction retained
17. Post-migration source zeroed → no recurring missing-source penalty when inactive
18. Low confidence constrains Skill 5
19. Low confidence constrains Skill 6
20. Skill 9 receives and exposes constraints
21. No automatic execution
22. Execution allowed always false
23. Workspace isolation
24. Idempotent rerun
25. Indonesian and English labels
26. No TikTok mutation references
27. No canonical writer dependency
28. Missing values are not converted to zero
29. Measurement labels are present
30. Every recommendation has expiry

---

## 25. Known limitations

- Reported attribution is not equal to true incrementality.
- Organic overlap cannot be measured without supporting store-level data.
- Cannibalization cannot be proven from platform ROAS.
- Late attribution may continue beyond the current observation window.
- Attribution settings may differ by platform, campaign type, or reporting endpoint.
- Historical advertiser migrations complicate source completeness.
- Causal confidence requires experiment design, not only observational data.
- Decision readiness rules require business approval before aggressive optimization is allowed.

---

## 26. Open business decisions

The following must be resolved before Skill 2 can be marked fully `READY_FOR_IMPLEMENTATION`:

1. Approved attribution maturity windows
2. Acceptable reconciliation tolerance
3. Late-attribution risk thresholds
4. Materiality threshold for a failed source
5. Minimum sample for trend stability
6. Minimum denominator for percentage comparisons
7. Data-completeness component weights
8. Organic overlap methodology
9. Approved experiment designs
10. Statistical confidence requirement for measured incrementality
11. When conservative optimization becomes acceptable
12. Whether `READY_FOR_AGGRESSIVE_OPTIMIZATION` will exist in the first release
13. Default expiry for Skill 2 outputs
14. Workspace timezone source of truth
15. Currency normalization policy
16. Whether transition dates are excluded from normal performance baselines

All unresolved values must remain:

```text
TBD_BUSINESS_DECISION
```

---

## 27. V1 implementation boundary

The first implementation may include:

- reported performance;
- data completeness;
- source completion;
- pagination checks;
- canonical reconciliation;
- late-attribution drift;
- attribution maturity age;
- measurement labels;
- decision readiness;
- downstream constraints;
- UI confidence card;
- deterministic tests.

The first implementation must leave these as limited or not measurable unless supporting data exists:

- organic overlap;
- cannibalization;
- true incrementality;
- causal lift.

This allows Skill 2 to be useful immediately without pretending to know more than the data supports.

---

## 28. Acceptance criteria

Skill 2 V1 is accepted when:

- Every output is tenant-scoped.
- Reported metrics are traceable to canonical snapshots.
- Missing data is explicit.
- Pagination and source failures constrain decisions.
- Late-attribution drift is measurable when historical snapshots exist.
- True incrementality is `NOT_MEASURABLE` without experiment data.
- Skill 5 and Skill 6 receive explicit constraints.
- Skill 9 surfaces the limitation in the action plan.
- No recommendation automatically executes.
- `execution_allowed` is always `false`.
- No TikTok mutation call is introduced.
- No canonical writer is modified.
- All required tests pass.

---

## 29. Version history

### `1.0.0-draft`

- Initial authoritative specification
- Defines attribution reliability, completeness, maturity, and incrementality boundaries
- Separates measured, inferred, unknown, and not measurable conclusions
- Adds downstream constraints for Skills 5, 6, and 9
- Leaves unresolved business thresholds as `TBD_BUSINESS_DECISION`

---

## 30. Readiness status

```text
OVERALL:
BUSINESS_REVIEW_REQUIRED

V1_ATTRIBUTION_RELIABILITY_AUDIT:
READY_FOR_IMPLEMENTATION

TRUE_INCREMENTALITY:
BLOCKED_UNTIL_EXPERIMENT_DATA

ORGANIC_OVERLAP:
BLOCKED_UNTIL_DATA_AVAILABLE

CANNIBALIZATION:
BLOCKED_UNTIL_APPROVED_METHOD
```

<!-- END 02_ATTRIBUTION_INCREMENTALITY_AUDIT.md -->


---

<!-- BEGIN 03_DAILY_CONTROL_TOWER.md -->

# Skill 3 — Daily Control Tower

**Skill code:** `GMVMAX_SKILL_03`  
**Version:** `1.0.0-draft`  
**Readiness:** `READY_FOR_IMPLEMENTATION`  
**Role:** Identify and prioritize material daily business changes  

---

## 1. Objective

Skill 3 summarizes what changed today across performance, efficiency, delivery, creative supply, product health, and data quality.

It is an event detector and prioritizer. It is not the final action planner.

---

## 2. Required inputs

- Daily facts for selected date
- D-1 facts
- Trailing 3-day average
- Trailing 7-day average
- Same weekday history when available
- Campaign contribution
- Product contribution
- Creative status
- Budget utilization
- Skill 1 readiness
- Skill 2 constraints

---

## 3. Daily facts

### Business

- gross revenue
- net revenue when available
- cost
- net cost
- orders
- ROI
- AOV
- active campaigns
- budget utilization

### Delivery

- spend distribution
- campaigns with no delivery
- campaigns near budget cap
- campaign contribution concentration

### Product

- products with spend
- products with orders
- spend without orders
- top-product revenue share
- product contribution changes
- CTR and CVR when available

### Creative

- total creatives
- delivering
- spending
- learning
- inactive
- new creatives
- concentration
- top-creative revenue share

### Data quality

- freshness
- pagination
- parity
- late-attribution warning
- missing required fields

---

## 4. Event categories

```text
PERFORMANCE
EFFICIENCY
DELIVERY
CREATIVE_SUPPLY
PRODUCT_HEALTH
DATA_QUALITY
```

Maximum default output:

```text
10 top events
```

The maximum is configurable.

---

## 5. Event priority

Suggested deterministic priority components:

- severity;
- financial materiality;
- confidence;
- scope breadth;
- persistence across windows;
- actionability;
- data-quality risk.

Exact numeric weights:

```text
TBD_BUSINESS_DECISION
```

Until approved, implement a transparent lexicographic priority:

1. CRITICAL before HIGH before MEDIUM before LOW
2. Higher confidence first
3. Wider scope first
4. Larger absolute financial impact first
5. New events before repeated low-value events

---

## 6. Core rules

### `GMVMAX-S3-PERF-001` — GMV movement

Detect material GMV movement versus approved comparison windows.

Threshold:

```text
TBD_BUSINESS_DECISION
```

Always include current value and comparison basis.

### `GMVMAX-S3-EFF-001` — ROI movement

Detect ROI movement only when cost and revenue samples are valid.

### `GMVMAX-S3-DELIVERY-001` — Low budget utilization

Do not interpret low utilization as a problem without campaign status and demand context.

### `GMVMAX-S3-CREATIVE-001` — Creative supply decline

Detect a decline in delivering/spending creatives.

### `GMVMAX-S3-PRODUCT-001` — Spend without orders

Raise an event when spend exists but orders remain zero and minimum sample is met.

Minimum sample:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S3-CONCENTRATION-001` — Concentration risk

Detect excessive reliance on one campaign/product/creative.

Threshold:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S3-DATA-001` — Data-quality event

Data-quality events may outrank performance events when they invalidate interpretation.

---

## 7. Event output

```ts
type ControlTowerEvent = {
  event_id: string;
  category: string;
  title: string;
  description: string;
  current_value: number | null;
  comparison_value: number | null;
  absolute_change: number | null;
  percentage_change: number | null;
  comparison_window: string;
  scope_type: string;
  scope_id: string;
  severity: string;
  confidence: string;
  rule_id: string;
  evidence_ids: string[];
  expires_at: string;
};
```

---

## 8. Missing data behavior

- Missing comparison data → report current fact without trend claim.
- Incomplete pagination → suppress aggressive performance events.
- Late attribution high → mark financial movement provisional.
- Missing creative status → creative-supply section becomes partial.
- Missing product mapping → product events become low confidence.

---

## 9. UI placement

Suggested page: **AI Insight → Daily Control Tower**

Sections:

- Today’s Business Condition
- Top Changes
- Performance
- Efficiency
- Delivery
- Creative Supply
- Product Health
- Data Quality

Every event must expose an evidence drawer.

---

## 10. Tests

1. Stable healthy day
2. GMV down
3. Cost up faster than revenue
4. ROI down with adequate sample
5. Low budget utilization
6. Creative supply decline
7. Product spend without orders
8. Concentration risk
9. Missing comparison data
10. Late-attribution warning
11. Pagination incomplete
12. Maximum event cap
13. Event deduplication
14. Workspace isolation
15. Indonesian and English copy

---

## 11. Acceptance criteria

- Events are deterministic.
- Maximum output is enforced.
- Data-quality events constrain interpretation.
- No causal diagnosis is claimed.
- Every event has evidence, confidence, rule ID, and expiry.
- No final action plan is produced.

<!-- END 03_DAILY_CONTROL_TOWER.md -->


---

<!-- BEGIN 04_ROOT_CAUSE_DIAGNOSIS.md -->

# Skill 4 — Root Cause Diagnosis

**Skill code:** `GMVMAX_SKILL_04`  
**Version:** `1.0.0-draft`  
**Readiness:** `READY_FOR_IMPLEMENTATION`  
**Role:** Explain likely drivers without overstating causality  

---

## 1. Objective

Skill 4 consumes facts, events, settings, attribution constraints, product data, and creative data to explain why an outcome changed.

It must distinguish:

```text
CONFIRMED_DRIVER
LIKELY_DRIVER
CONTRIBUTING_FACTOR
CORRELATED_SIGNAL
INSUFFICIENT_EVIDENCE
```

---

## 2. Required inputs

- Skill 1 blueprint
- Skill 2 attribution audit
- Skill 3 events
- Daily facts
- Campaign settings and changes
- Product performance
- Creative performance
- Feature Registry
- Historical comparison windows

---

## 3. Diagnosis structure

```ts
type RootCauseDiagnosis = {
  diagnosis_id: string;
  observed_outcome: string;
  candidate_driver: string;
  level:
    | "CONFIRMED_DRIVER"
    | "LIKELY_DRIVER"
    | "CONTRIBUTING_FACTOR"
    | "CORRELATED_SIGNAL"
    | "INSUFFICIENT_EVIDENCE";
  confidence: "HIGH" | "MEDIUM" | "LOW" | "DATA_INSUFFICIENT";
  evidence_for: string[];
  evidence_against: string[];
  alternative_explanations: string[];
  missing_data: string[];
  observation_window: string;
  source_event_ids: string[];
  rule_ids: string[];
};
```

---

## 4. Diagnostic chains

### ROI down

Possible drivers:

- CVR down
- CPC up
- mix shift toward lower-ROI products
- spend expansion faster than revenue
- late attribution
- incomplete source
- creative fatigue
- budget or Target ROI change

### GMV down

Possible drivers:

- spend down
- delivery constrained
- creative supply decline
- product availability/mapping issue
- CVR down
- campaign paused
- data incompleteness

### GMV up and ROI down

Possible interpretation:

```text
Spend growth > revenue growth
→ growth driven primarily by capital
→ efficiency deteriorated
```

This is a measured relationship, not proof of the underlying business cause.

### Spend without orders

Possible drivers:

- low sample
- product conversion issue
- traffic mismatch
- creative mismatch
- attribution delay
- report incompleteness

---

## 5. Causality rules

### `GMVMAX-S4-CAUSE-001`

A `CONFIRMED_DRIVER` requires either:

- deterministic mechanical relationship;
- verified setting change followed by expected scoped effect;
- valid experiment evidence;
- complete decomposition where the driver fully explains the outcome.

### `GMVMAX-S4-CAUSE-002`

Correlation alone may only produce `CORRELATED_SIGNAL`.

### `GMVMAX-S4-CAUSE-003`

If Skill 2 marks data as `BLOCKED`, diagnosis cannot exceed `INSUFFICIENT_EVIDENCE`.

### `GMVMAX-S4-CAUSE-004`

Every diagnosis must include evidence against and alternatives, even when empty.

### `GMVMAX-S4-CAUSE-005`

Do not claim creative fatigue from age alone. Require performance deterioration or supply evidence.

---

## 6. Confidence

Confidence factors:

- completeness;
- temporal alignment;
- scope match;
- sample size;
- consistency across windows;
- evidence coverage;
- alternative explanation count;
- Skill 2 constraints.

Thresholds remain configurable.

---

## 7. Missing data behavior

- Missing CVR → cannot diagnose conversion decline directly.
- Missing setting history → cannot attribute change to Target ROI or budget.
- Missing creative status → creative bottleneck remains inferred.
- Late attribution high → financial diagnosis downgraded.
- Source mismatch → diagnosis blocked.

---

## 8. Output limits

Default:

```text
Maximum 5 primary diagnoses
Maximum 5 alternative explanations
```

Configurable.

Prioritize diagnoses that explain the largest material outcome with the strongest evidence.

---

## 9. UI placement

Suggested page: **AI Insight → Root Cause**

Display:

- outcome;
- primary driver;
- confidence;
- evidence for;
- evidence against;
- alternatives;
- missing data;
- observation window.

Use a chain visualization:

```text
Outcome
→ Driver
→ Supporting evidence
→ Confidence
```

---

## 10. Tests

1. ROI down due to CVR decline
2. ROI down due to cost increase
3. GMV down due to spend decline
4. GMV up but efficiency down
5. Creative supply bottleneck
6. Product conversion issue
7. Late attribution prevents firm diagnosis
8. Incomplete pagination blocks diagnosis
9. Conflicting evidence
10. Unsupported causality remains correlated
11. Exact decomposition produces confirmed driver
12. Missing setting history
13. Workspace isolation
14. Deterministic ordering
15. Indonesian/English labels

---

## 11. Acceptance criteria

- Unsupported causality is never claimed.
- Every diagnosis includes alternatives and missing data.
- Skill 2 constraints are honored.
- Output is deterministic and evidence-linked.
- No final action plan is emitted.

<!-- END 04_ROOT_CAUSE_DIAGNOSIS.md -->


---

<!-- BEGIN 05_TARGET_ROI_OPTIMIZATION_ENGINE.md -->

# Skill 5 — Target ROI & Optimization Mode Engine

**Skill code:** `GMVMAX_SKILL_05`  
**Version:** `1.0.0-draft`  
**Readiness:** `BUSINESS_REVIEW_REQUIRED`  
**Role:** Recommend whether to hold, review, or change optimization settings  

---

## 1. Objective

Skill 5 evaluates Target ROI and optimization modes, including:

- Target ROI
- Recommended ROI
- Max Delivery
- Promotion Days
- Auto Budget Increase
- ROI Protection
- cooldown and change history

It may recommend a review or bounded change, but it cannot execute.

---

## 2. Required dependencies

- Skill 1 blueprint
- Skill 2 decision readiness and constraints
- Skill 3 events
- Skill 4 diagnosis
- Current campaign settings
- Settings history
- Daily facts
- Minimum sample
- Budget and profitability context
- Approval history

---

## 3. Questions answered

- Should Target ROI be held?
- Is the current Target ROI constraining delivery?
- Is efficiency deteriorating because of conversion, creative supply, or setting pressure?
- Is Max Delivery appropriate?
- Are Promotion Days appropriate?
- Should Auto Budget Increase remain enabled?
- Is the campaign inside a cooldown period?
- Is there enough evidence for any change?

---

## 4. Non-goals

- No automatic settings change.
- No exact Target ROI recommendation without approved formula.
- No recommendation when attribution is blocked.
- No use of platform-recommended ROI as unquestioned truth.
- No repeated daily adjustments without cooldown.

---

## 5. Decision states

```text
HOLD_CURRENT_SETTINGS
OBSERVE
REVIEW_TARGET_ROI
REVIEW_OPTIMIZATION_MODE
REQUIRE_APPROVAL
DO_NOT_CHANGE
DATA_INSUFFICIENT
```

---

## 6. Required rules

### `GMVMAX-S5-GATE-001`

If Skill 2 returns `BLOCKED`, all setting changes are `DO_NOT_EXECUTE`.

### `GMVMAX-S5-GATE-002`

If late-attribution risk is high, prefer `OBSERVE`.

### `GMVMAX-S5-COOLDOWN-001`

Do not recommend another setting change during cooldown.

Cooldown duration:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S5-TROI-001`

Evaluate Target ROI only after minimum sample and maturity are satisfied.

Minimum spend, orders, days, and campaign age:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S5-MAXDELIVERY-001`

Max Delivery may only be reviewed when:

- business objective supports volume;
- attribution is reliable;
- budget and risk bounds exist;
- creative/product supply is healthy;
- approval is required.

Exact conditions:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S5-PROMO-001`

Promotion Days requires an approved promotion calendar and budget guardrails.

### `GMVMAX-S5-ABI-001`

Auto Budget Increase requires capital-allocation approval and hard caps.

---

## 7. Output

```ts
type OptimizationRecommendation = {
  campaign_id: string;
  current_target_roi: number | null;
  platform_recommended_roi: number | null;
  current_mode: string | null;
  recommendation:
    | "HOLD"
    | "OBSERVE"
    | "REVIEW_TARGET_ROI"
    | "REVIEW_MAX_DELIVERY"
    | "REVIEW_PROMOTION_DAYS"
    | "REVIEW_AUTO_BUDGET_INCREASE"
    | "DO_NOT_CHANGE";
  proposed_value?: number | null;
  confidence: string;
  approval_required: true;
  evidence_ids: string[];
  risks: string[];
  cooldown_until?: string | null;
  execution_allowed: false;
};
```

`proposed_value` must remain null until the business formula is approved.

---

## 8. Open business decisions

1. Minimum campaign age
2. Minimum spend
3. Minimum orders
4. Minimum days of stable data
5. Maximum Target ROI change per action
6. Cooldown after a Target ROI change
7. Max Delivery eligibility
8. Promotion Days eligibility
9. Auto Budget Increase cap
10. Required profit margin
11. Acceptable ROI floor
12. Relationship between reported ROI and business break-even ROI
13. Whether platform-recommended ROI may be used as an input
14. Rollback thresholds
15. Follow-up windows

All remain `TBD_BUSINESS_DECISION`.

---

## 9. Tests

1. Attribution blocked
2. Late attribution high
3. Campaign inside cooldown
4. Insufficient sample
5. Healthy campaign → hold
6. Delivery constrained but conversion healthy
7. Conversion problem → do not lower Target ROI
8. Creative bottleneck → do not use Max Delivery
9. Promotion calendar absent
10. Auto Budget Increase without capital approval
11. Conflicting evidence
12. No automatic execution

---

## 10. Acceptance criteria

Skill 5 may be implemented as a gated recommendation framework now, but exact setting changes remain disabled until business rules are approved.

<!-- END 05_TARGET_ROI_OPTIMIZATION_ENGINE.md -->


---

<!-- BEGIN 06_CAPITAL_ALLOCATION_ENGINE.md -->

# Skill 6 — Capital Allocation Engine

**Skill code:** `GMVMAX_SKILL_06`  
**Version:** `1.0.0-draft`  
**Readiness:** `BUSINESS_REVIEW_REQUIRED`  
**Role:** Recommend how available capital should be held, tested, increased, or reduced  

---

## 1. Objective

Skill 6 allocates capital across campaigns, products, creatives, and testing pools while respecting:

- reported efficiency;
- profitability;
- volume;
- confidence;
- attribution quality;
- concentration risk;
- cash-flow limits;
- testing needs;
- cooldowns;
- approval limits.

It cannot execute budget changes.

---

## 2. Required inputs

- Skill 1 structure
- Skill 2 constraints
- Skill 3 events
- Skill 4 diagnoses
- Skill 5 optimization-mode recommendation
- Current budgets
- Spend and utilization
- Revenue and orders
- Profit or break-even data
- Campaign age
- Testing pool status
- Cash-flow constraints
- Approval history

---

## 3. Allocation buckets

```text
PROTECT
HOLD
INCREASE_CANDIDATE
DECREASE_CANDIDATE
TESTING_POOL
RECOVERY
DO_NOT_FUND
```

---

## 4. Portfolio logic

A candidate score may consider:

- profitability;
- ROI;
- revenue volume;
- order volume;
- confidence;
- stability;
- growth opportunity;
- concentration;
- marginal efficiency;
- creative/product supply;
- campaign maturity.

Weights:

```text
TBD_BUSINESS_DECISION
```

No composite score may be treated as approved until weights are reviewed.

---

## 5. Required constraints

### `GMVMAX-S6-GATE-001`

Skill 2 `BLOCKED` → no reallocation.

### `GMVMAX-S6-GATE-002`

Missing break-even or cash-flow data → no aggressive increase.

### `GMVMAX-S6-CONCENTRATION-001`

Portfolio concentration must be measured before increasing the largest scope.

Threshold:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S6-TESTING-001`

A protected testing budget may be recommended only under an approved business policy.

### `GMVMAX-S6-CAP-001`

Daily increase/decrease caps are mandatory.

Caps:

```text
TBD_BUSINESS_DECISION
```

### `GMVMAX-S6-COOLDOWN-001`

Do not repeatedly reallocate during cooldown.

---

## 6. Output

```ts
type CapitalAllocationRecommendation = {
  scope_type: "CAMPAIGN" | "PRODUCT" | "CREATIVE_POOL";
  scope_id: string;
  classification:
    | "PROTECT"
    | "HOLD"
    | "INCREASE_CANDIDATE"
    | "DECREASE_CANDIDATE"
    | "TESTING_POOL"
    | "RECOVERY"
    | "DO_NOT_FUND";
  current_budget?: number | null;
  proposed_budget?: number | null;
  proposed_change_percent?: number | null;
  confidence: string;
  evidence_ids: string[];
  risk: string;
  approval_required: true;
  execution_allowed: false;
};
```

Exact proposed values remain null until rules are approved.

---

## 7. Open business decisions

1. Capital base
2. Daily cash-flow limit
3. Required margin
4. Break-even ROI source
5. Increase cap
6. Decrease cap
7. Testing-pool percentage
8. New-campaign allocation
9. Recovery allocation
10. Concentration threshold
11. Minimum observation period
12. Stability requirements
13. Marginal ROI method
14. How to treat low-volume high-ROI campaigns
15. How to treat high-volume moderate-ROI campaigns

---

## 8. Tests

1. Attribution blocked
2. Missing break-even
3. Cash-flow cap reached
4. High ROI but low sample
5. High volume but low margin
6. Concentration risk
7. Testing budget
8. New campaign
9. Decrease candidate
10. Cooldown
11. No exact proposal before approval
12. No automatic execution

---

## 9. Acceptance criteria

The framework may rank candidates and expose missing decisions. It must not publish exact budget changes until business constraints are approved.

<!-- END 06_CAPITAL_ALLOCATION_ENGINE.md -->


---

<!-- BEGIN 07_CREATIVE_AFFILIATE_SUPPLY_ENGINE.md -->

# Skill 7 — Creative & Affiliate Supply Engine

**Skill code:** `GMVMAX_SKILL_07`  
**Version:** `1.0.0-draft`  
**Readiness:** `BUSINESS_REVIEW_REQUIRED`  
**Role:** Evaluate creative supply, experiments, fatigue, affiliate contribution, and content needs  

---

## 1. Objective

Skill 7 determines whether GMV Max has enough healthy creative supply and whether creative/affiliate actions are needed.

It covers:

- creative intake;
- status distribution;
- Accelerate Testing;
- Manual Boost;
- affiliate contribution;
- H+1/H+3/H+7 experiment tracking;
- sustainable winners;
- temporary spikes;
- fatigue;
- content gaps.

---

## 2. Required inputs

- Creative inventory
- Creative performance
- Creative status
- Product mapping
- Affiliate mapping
- Experiment tracker
- Skill 2 constraints
- Skill 3 events
- Skill 4 diagnoses
- Feature Registry
- Boost history
- Content age and publication timestamps

---

## 3. Creative lifecycle

```text
NEW
ELIGIBLE
TESTING
LEARNING
DELIVERING
BOOSTING
WINNER_CANDIDATE
SUSTAINABLE_WINNER
TEMPORARY_SPIKE
FATIGUING
INACTIVE
REJECTED
DATA_INSUFFICIENT
```

A creative may have operational and analytical states separately.

---

## 4. Experiment tracker

Required checkpoints:

```text
H+1
H+3
H+7
```

For every experiment store:

- creative ID;
- affiliate ID when available;
- product ID;
- start timestamp;
- treatment type;
- baseline;
- spend;
- impressions;
- clicks;
- CTR;
- orders;
- revenue;
- ROI;
- status transitions;
- conclusion;
- confidence;
- stop condition.

---

## 5. Winner classification

A sustainable winner must not be defined by views alone.

Candidate factors:

- sufficient spend;
- sufficient orders;
- ROI above approved floor;
- performance across multiple checkpoints;
- stable delivery;
- contribution persistence;
- absence of one-time anomaly;
- product relevance.

Thresholds:

```text
TBD_BUSINESS_DECISION
```

---

## 6. Temporary spike

Possible signals:

- strong H+1 but weak H+3/H+7;
- one-time promotion;
- concentrated revenue from few orders;
- unstable delivery;
- late attribution artifact;
- boost-dependent performance.

Exact classification rules:

```text
TBD_BUSINESS_DECISION
```

---

## 7. Fatigue

Do not classify fatigue from age alone.

Potential evidence:

- declining CTR;
- declining CVR;
- declining spend allocation;
- declining orders;
- repeated exposure when available;
- replacement creatives outperforming;
- delivery status deterioration.

---

## 8. Affiliate supply

Report:

- active affiliates;
- affiliates contributing creatives;
- affiliates with delivering creatives;
- affiliate concentration;
- new creative intake;
- product coverage;
- missing content angles;
- contribution by affiliate;
- sample and campaign status when integrated.

Do not contact affiliates automatically.

---

## 9. Recommendations

Allowed:

- request more creative supply;
- prioritize a product/content angle;
- continue observation;
- review Accelerate Testing;
- review Manual Boost;
- stop evaluating a weak experiment;
- protect a sustainable winner;
- reduce concentration risk.

Not allowed:

- automatic creative boost;
- automatic affiliate outreach;
- automatic commission change;
- automatic campaign mutation.

---

## 10. Output

```ts
type CreativeSupplyRecommendation = {
  scope_type: "CREATIVE" | "PRODUCT" | "AFFILIATE" | "CREATIVE_POOL";
  scope_id: string;
  classification: string;
  evidence_ids: string[];
  recommendation:
    | "OBSERVE"
    | "ADD_CREATIVE_SUPPLY"
    | "REVIEW_ACCELERATE_TESTING"
    | "REVIEW_MANUAL_BOOST"
    | "PROTECT_WINNER"
    | "STOP_EXPERIMENT"
    | "REDUCE_CONCENTRATION"
    | "DATA_INSUFFICIENT";
  confidence: string;
  approval_required: boolean;
  execution_allowed: false;
};
```

---

## 11. Open business decisions

1. Minimum spend
2. Minimum orders
3. ROI floor
4. H+1/H+3/H+7 thresholds
5. Winner persistence period
6. Fatigue thresholds
7. Temporary spike definition
8. Creative concentration limit
9. Minimum creative supply per product
10. Affiliate concentration limit
11. Manual Boost eligibility
12. Accelerate Testing eligibility
13. Experiment stop conditions
14. New creative intake target
15. Product-angle coverage rules

---

## 12. Tests

1. Healthy creative supply
2. Creative shortage
3. Sustainable winner
4. Temporary spike
5. Fatigue
6. Missing experiment data
7. Boost-dependent result
8. Affiliate concentration
9. Product coverage gap
10. Low sample
11. Late attribution
12. No automatic boost
13. Workspace isolation
14. H+1/H+3/H+7 progression
15. Idempotent experiment update

---

## 13. Acceptance criteria

The first implementation should prioritize the Creative Experiment Tracker and supply-health facts. Exact winner/fatigue thresholds remain disabled until approved.

<!-- END 07_CREATIVE_AFFILIATE_SUPPLY_ENGINE.md -->


---

<!-- BEGIN 08_LIVE_GMV_MAX_GROWTH_ENGINE.md -->

# Skill 8 — LIVE GMV Max Growth Engine

**Skill code:** `GMVMAX_SKILL_08`  
**Version:** `1.0.0-draft`  
**Readiness:** `DRAFT`  
**Role:** Analyze LIVE GMV Max sessions, hosts, product mix, traffic, conversion, and opportunities  

---

## 1. Objective

Skill 8 evaluates LIVE GMV Max performance at:

- campaign level;
- LIVE session level;
- host level;
- product level;
- time segment level.

It must not infer LIVE performance from non-LIVE campaign data.

---

## 2. Required inputs

- LIVE campaign inventory
- LIVE session IDs
- Host identity
- Session start/end
- Duration
- Traffic
- Viewers
- Clicks
- Orders
- Revenue
- Cost
- ROI
- Product mix
- Session-level attribution
- LIVE feature availability
- LIVE boost history
- Skill 2 attribution audit

Many of these inputs may currently be unavailable.

---

## 3. Readiness behavior

If required LIVE session data is missing:

```text
status = DATA_INSUFFICIENT
readiness = BLOCKED
```

Do not fabricate LIVE insights from store-wide metrics.

---

## 4. Core analyses

### Session performance

- revenue;
- cost;
- orders;
- ROI;
- revenue per minute;
- orders per minute;
- viewer-to-click;
- click-to-order;
- peak time segments.

### Host performance

- host-level session consistency;
- conversion;
- product fit;
- session duration;
- data sufficiency.

Do not permanently rank hosts from small samples.

### Product mix

- products shown;
- products clicked;
- products ordered;
- revenue concentration;
- product rotation;
- unavailable mappings.

### Traffic and conversion

Separate:

- traffic shortage;
- click shortage;
- conversion shortage;
- product-mix issue;
- session-duration issue;
- attribution limitation.

---

## 5. Recommendations

Allowed:

- review session schedule;
- review product mix;
- increase observation;
- investigate host/product fit;
- review LIVE boost;
- protect strong time segments;
- collect missing session data.

Not allowed:

- automatically start LIVE boost;
- automatically change campaign settings;
- automatically schedule hosts;
- automatically change product assortment.

---

## 6. Output

```ts
type LiveGrowthOutput = {
  session_id: string;
  host_id?: string | null;
  readiness: "READY" | "PARTIAL" | "BLOCKED";
  performance: unknown;
  traffic_condition: string;
  conversion_condition: string;
  product_mix_condition: string;
  diagnoses: unknown[];
  recommendations: unknown[];
  confidence: string;
  execution_allowed: false;
};
```

---

## 7. Open business decisions

1. Required LIVE metrics
2. Minimum session duration
3. Minimum viewers
4. Minimum clicks
5. Minimum orders
6. Host evaluation window
7. Revenue-per-minute target
8. Conversion benchmarks
9. LIVE boost eligibility
10. Product-mix concentration threshold
11. Session comparison method
12. Treatment of interrupted sessions
13. Attribution maturity
14. Multi-host sessions
15. Time-segment granularity

All remain `TBD_BUSINESS_DECISION`.

---

## 8. Tests

1. Complete healthy LIVE session
2. Missing session identity
3. Traffic shortage
4. Click shortage
5. Conversion shortage
6. Product-mix concentration
7. Short session
8. Multi-host ambiguity
9. Attribution incomplete
10. LIVE boost unavailable
11. Small sample
12. No automatic execution

---

## 9. Acceptance criteria

Skill 8 remains a specification skeleton until LIVE session data is proven available and reliable.

<!-- END 08_LIVE_GMV_MAX_GROWTH_ENGINE.md -->


---

<!-- BEGIN 09_DAILY_ACTION_PLAN_ORCHESTRATOR.md -->

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

<!-- END 09_DAILY_ACTION_PLAN_ORCHESTRATOR.md -->


---

<!-- BEGIN 90_RULE_REGISTRY.md -->

# Central Rule Registry

**Version:** `1.0.0-draft`  
**Purpose:** Prevent scattered magic numbers and undocumented decision logic  

---

## 1. Rule contract

```ts
type RuleStatus =
  | "DRAFT"
  | "REVIEW_REQUIRED"
  | "APPROVED"
  | "DEPRECATED";

type RuleDefinition = {
  rule_id: string;
  rule_version: string;
  skill_code: string;
  name: string;
  description: string;

  required_metrics: string[];
  optional_metrics: string[];

  comparison_window?: string | null;
  minimum_sample?: Record<string, number | string> | null;
  threshold?: unknown;

  confidence_logic: string;
  severity_logic: string;
  cooldown?: string | null;
  expiry?: string | null;

  enabled: boolean;
  business_owner: string;
  status: RuleStatus;
};
```

---

## 2. ID convention

```text
GMVMAX-S<skill>-<domain>-<number>
```

Examples:

```text
GMVMAX-S2-PAGINATION-001
GMVMAX-S3-EFF-001
GMVMAX-S4-CAUSE-001
GMVMAX-S5-COOLDOWN-001
GMVMAX-S7-WINNER-001
GMVMAX-S9-SAFETY-001
```

---

## 3. Approval behavior

- `DRAFT`: documentation only
- `REVIEW_REQUIRED`: may be implemented behind disabled configuration
- `APPROVED`: may run in production read-only intelligence
- `DEPRECATED`: retained for history, not used for new output

No rule containing `TBD_BUSINESS_DECISION` may become `APPROVED`.

---

## 4. Required initial registry

### Skill 1

- `GMVMAX-S1-STRUCTURE-001`
- `GMVMAX-S1-SOURCE-001`
- `GMVMAX-S1-PAGINATION-001`
- `GMVMAX-S1-FRESHNESS-001`
- `GMVMAX-S1-CURRENCY-001`
- `GMVMAX-S1-TIMEZONE-001`

### Skill 2

- `GMVMAX-S2-COMPLETE-001`
- `GMVMAX-S2-PAGINATION-001`
- `GMVMAX-S2-RECONCILE-001`
- `GMVMAX-S2-LATE-001`
- `GMVMAX-S2-MATURITY-001`
- `GMVMAX-S2-INCREMENTAL-001`
- `GMVMAX-S2-ORGANIC-001`
- `GMVMAX-S2-TRANSITION-001`
- `GMVMAX-S2-BLOCK-001`
- `GMVMAX-S2-OBSERVE-001`
- `GMVMAX-S2-DOWNSTREAM-001`

### Skill 3

- `GMVMAX-S3-PERF-001`
- `GMVMAX-S3-EFF-001`
- `GMVMAX-S3-DELIVERY-001`
- `GMVMAX-S3-CREATIVE-001`
- `GMVMAX-S3-PRODUCT-001`
- `GMVMAX-S3-CONCENTRATION-001`
- `GMVMAX-S3-DATA-001`

### Skill 4

- `GMVMAX-S4-CAUSE-001`
- `GMVMAX-S4-CAUSE-002`
- `GMVMAX-S4-CAUSE-003`
- `GMVMAX-S4-CAUSE-004`
- `GMVMAX-S4-CAUSE-005`

### Skill 5

- `GMVMAX-S5-GATE-001`
- `GMVMAX-S5-GATE-002`
- `GMVMAX-S5-COOLDOWN-001`
- `GMVMAX-S5-TROI-001`
- `GMVMAX-S5-MAXDELIVERY-001`
- `GMVMAX-S5-PROMO-001`
- `GMVMAX-S5-ABI-001`

### Skill 6

- `GMVMAX-S6-GATE-001`
- `GMVMAX-S6-GATE-002`
- `GMVMAX-S6-CONCENTRATION-001`
- `GMVMAX-S6-TESTING-001`
- `GMVMAX-S6-CAP-001`
- `GMVMAX-S6-COOLDOWN-001`

### Skill 7

- `GMVMAX-S7-SUPPLY-001`
- `GMVMAX-S7-WINNER-001`
- `GMVMAX-S7-SPIKE-001`
- `GMVMAX-S7-FATIGUE-001`
- `GMVMAX-S7-BOOST-001`
- `GMVMAX-S7-AFFILIATE-001`

### Skill 8

- `GMVMAX-S8-READINESS-001`
- `GMVMAX-S8-TRAFFIC-001`
- `GMVMAX-S8-CONVERSION-001`
- `GMVMAX-S8-PRODUCT-001`
- `GMVMAX-S8-HOST-001`
- `GMVMAX-S8-BOOST-001`

### Skill 9

- `GMVMAX-S9-SAFETY-001`
- `GMVMAX-S9-LIMIT-001`
- `GMVMAX-S9-CONFLICT-001`
- `GMVMAX-S9-DUPLICATE-001`
- `GMVMAX-S9-EXPIRY-001`
- `GMVMAX-S9-APPROVAL-001`
- `GMVMAX-S9-EXECUTION-001`

---

## 5. Implementation requirements

- Rules must be centralized.
- Rule version must be persisted with output.
- Thresholds must not be copied into UI components.
- Disabled rules produce no recommendation.
- Historical outputs keep their original rule version.
- Changing a rule must not silently rewrite old decisions.

<!-- END 90_RULE_REGISTRY.md -->


---

<!-- BEGIN 91_DATA_DEPENDENCY_MATRIX.md -->

# Data Dependency Matrix

Legend:

```text
REQUIRED
OPTIONAL
DERIVED
NOT_USED
NOT_AVAILABLE
```

| Data source | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|
| Canonical daily performance | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | DERIVED |
| Sync-run metadata | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | DERIVED |
| Campaign settings | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | DERIVED |
| Feature Registry | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | DERIVED |
| Creative performance | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED | OPTIONAL | DERIVED |
| Product performance | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | DERIVED |
| Affiliate data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | NOT_USED | OPTIONAL | REQUIRED | NOT_USED | DERIVED |
| LIVE data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | DERIVED |
| Attribution metadata | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | OPTIONAL | REQUIRED | DERIVED |
| Experiment tracker | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | OPTIONAL | DERIVED |
| Approval history | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED |
| Margin/break-even data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | DERIVED |
| Organic/total-store data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | NOT_USED | OPTIONAL | DERIVED |
| Historical settings | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | DERIVED |
| Source advertiser lineage | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | DERIVED |

---

## Required-data failure behavior

### Skill 1

Missing identity, timezone, currency, or canonical snapshot → `BLOCKED`.

### Skill 2

Missing canonical snapshot → `BLOCKED`.

Missing prior versions → late-attribution analysis `UNKNOWN`, not entire skill blocked.

### Skill 3

Missing comparison windows → current facts available, trend events partial.

### Skill 4

Missing evidence → `INSUFFICIENT_EVIDENCE`.

### Skill 5

Missing settings, attribution confidence, or minimum sample → `DO_NOT_CHANGE`.

### Skill 6

Missing break-even or capital limits → no aggressive allocation.

### Skill 7

Missing experiment tracker → supply facts available; winner/fatigue conclusions partial.

### Skill 8

Missing LIVE session data → `BLOCKED`.

### Skill 9

May operate with partial upstream skills, but must expose the missing capability and avoid unsupported actions.

<!-- END 91_DATA_DEPENDENCY_MATRIX.md -->


---

<!-- BEGIN 92_CONFIDENCE_AND_SEVERITY_MODEL.md -->

# Confidence and Severity Model

---

## 1. Confidence

```text
HIGH
MEDIUM
LOW
DATA_INSUFFICIENT
```

Confidence evaluates evidence quality, not whether performance is good.

### Factors

- source freshness;
- pagination completeness;
- source completion;
- required-field coverage;
- canonical reconciliation;
- sample size;
- attribution maturity;
- cross-source consistency;
- temporal alignment;
- scope alignment;
- rule evidence coverage;
- experiment quality.

### HIGH

All critical factors pass, no material contradiction, and required sample is satisfied.

### MEDIUM

Usable with known limitations or moderate uncertainty.

### LOW

Material uncertainty, conflicting signals, or weak sample.

### DATA_INSUFFICIENT

Required evidence is absent.

A high ROI does not imply high confidence.

---

## 2. Severity

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

Severity represents business or decision risk.

### CRITICAL

- cross-tenant contamination;
- wrong currency/date scope;
- silent missing source;
- unsafe automatic execution;
- complete output generated from incomplete pagination.

### HIGH

- material source failure;
- hard canonical mismatch;
- duplicate identity blocks aggregation;
- required evidence missing for a risky action.

### MEDIUM

- meaningful efficiency decline;
- moderate late-attribution risk;
- creative/product concentration;
- incomplete optional data affecting interpretation.

### LOW

- minor drift;
- low-materiality issue;
- informational warning.

### INFO

- healthy stable state;
- known limitation correctly disclosed.

---

## 3. Confidence-factor contract

```ts
type ConfidenceFactor = {
  factor_id: string;
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  impact: "LOW" | "MEDIUM" | "HIGH";
  evidence_ids: string[];
  explanation: string;
};
```

---

## 4. Conservative aggregation

Until numeric weights are approved:

1. Any critical factor `FAIL` → confidence cannot exceed `LOW`.
2. Missing required evidence → `DATA_INSUFFICIENT`.
3. Any high-impact `WARN` → confidence cannot exceed `MEDIUM`.
4. `HIGH` requires every high-impact factor to pass.
5. Skill 2 constraints may cap downstream confidence.

---

## 5. Open decisions

- Numeric weights
- Sample thresholds
- Freshness windows
- Reconciliation tolerance
- Late-attribution thresholds
- Materiality thresholds
- Confidence expiry

All remain `TBD_BUSINESS_DECISION`.

<!-- END 92_CONFIDENCE_AND_SEVERITY_MODEL.md -->


---

<!-- BEGIN 93_TEST_SCENARIO_MATRIX.md -->

# Cross-Skill Test Scenario Matrix

| Scenario | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|
| Healthy stable day | Ready | High confidence | No major alert | No material cause | Hold | Hold | Healthy supply | Healthy if data | Observe/maintain |
| GMV down from spend decline | Ready | Complete | Performance event | Likely spend driver | Hold/review | Review allocation | Observe | Optional | Prioritize investigation |
| ROI down from CVR decline | Ready | Complete | Efficiency event | Likely conversion driver | Do not lower TROI blindly | No increase | Review product/creative | Optional | Recommend conversion investigation |
| GMV up, efficiency down | Ready | Complete | Mixed event | Capital-led growth | Observe | Review increase | Check supply | Optional | Warn about efficiency |
| Creative shortage | Ready | Complete | Supply event | Likely bottleneck | Avoid Max Delivery | Avoid increase | Add supply | Optional | Recommend creative action |
| Product concentration | Ready | Complete | Concentration event | Contributing factor | Hold | Reduce concentration | Add product coverage | Optional | Recommend diversification |
| Spend without orders | Ready | Complete | Product event | Insufficient/likely conversion issue | Do not lower TROI automatically | No increase | Review creative/product | Optional | Investigate |
| Pagination incomplete | Partial | Blocked/low | Data-quality event | Insufficient evidence | Do not change | No allocation | Partial | Partial | Do not execute |
| Missing feature settings | Partial | Complete | Partial | Partial | Blocked | Partial | Partial | Partial | Observe |
| Late attribution | Ready | High risk | Provisional event | Downgraded | Observe | Delay | Observe | Observe | Wait |
| Low sample | Ready | Low | Low-confidence event | Insufficient evidence | Hold | Testing only | Continue test | Observe | Observe |
| Conflicting signals | Ready | Medium | Multiple events | Alternatives shown | Hold | Hold | Observe | Observe | Explicit conflict |
| Legacy advertiser | Ready | Transition-aware | No false alert | Historical/current split | No effect forward | No effect forward | No effect | No effect | Explain limitation |
| Workspace isolation failure | Blocked | Critical | Critical | Blocked | Blocked | Blocked | Blocked | Blocked | Do not execute |
| Missing LIVE data | Ready | Complete | Non-LIVE unaffected | Non-LIVE unaffected | Unaffected | Unaffected | Unaffected | Blocked | No LIVE action |
| Sustainable creative winner | Ready | Complete | Positive supply event | Supporting factor | Optional | Optional | Protect winner | Optional | Recommend protect |
| Temporary creative spike | Ready | Complete | Volatility event | Inferred | Hold | Hold | Continue observation | Optional | Observe |
| Canonical mismatch | Partial | Blocked | Data-quality event | Insufficient | Blocked | Blocked | Partial | Partial | Do not execute |
| Budget cap reached | Ready | Complete | Delivery event | Likely constraint | Review | Review capital | Check supply | Optional | Approval required |
| Automatic execution attempted | Critical | Critical | Critical | Critical | Blocked | Blocked | Blocked | Blocked | Do not execute |

---

## Global required tests

1. Workspace isolation
2. Idempotent rerun
3. Stable deterministic signature
4. No raw token
5. No raw MCP payload
6. No TikTok mutation reference
7. No canonical write
8. `execution_allowed=false`
9. Indonesian labels
10. English labels
11. Expiry present
12. Rule IDs present
13. Source snapshot IDs present
14. Missing values remain null/unknown
15. Historical outputs retain original rule version

<!-- END 93_TEST_SCENARIO_MATRIX.md -->


---

<!-- BEGIN 94_EXECUTION_AND_APPROVAL_BOUNDARIES.md -->

# Execution and Approval Boundaries

---

## 1. Current allowed behavior

- Read canonical data
- Read Feature Registry
- Read campaign settings
- Derive daily facts
- Detect events
- Audit attribution
- Diagnose likely drivers
- Produce recommendations
- Classify action status
- Persist internal outputs
- Mark reviewed
- Dismiss
- Snooze
- Export/copy summaries

---

## 2. Current prohibited behavior

- Change budget
- Change Target ROI
- Activate Max Delivery
- Activate Promotion Days
- Enable Auto Budget Increase
- Boost creatives
- Modify campaigns
- Modify products
- Contact affiliates automatically
- Change commission
- Start or alter LIVE sessions
- Call TikTok mutation endpoints
- Execute `SAFE_TO_EXECUTE`
- Write canonical snapshots from skill code
- Expose service-role credentials
- Modify timers or workers

---

## 3. Approval classes

```text
NO_APPROVAL_NEEDED
REVIEW_REQUIRED
EXPLICIT_APPROVAL_REQUIRED
PROHIBITED
```

Current mapping:

- View evidence → no approval
- Mark reviewed → no approval
- Dismiss/snooze → no approval
- Internal recommendation persistence → no approval
- Budget/ROI/mode/boost/campaign changes → explicit approval required in a future phase
- Automatic execution → prohibited

---

## 4. Future execution prerequisites

Before any production-changing action:

1. Runtime-verified write endpoint
2. Explicit user approval
3. Tenant isolation
4. Audit log
5. Before/after values
6. Bounds
7. Cooldown
8. Idempotency
9. Rollback
10. Kill switch
11. Execution-result verification
12. Failure isolation
13. Rate limiting
14. Secret protection
15. Production observation period

---

## 5. Required fields for future approval

```ts
type ApprovalRequest = {
  approval_id: string;
  workspace_id: string;
  action_id: string;
  action_type: string;
  current_value: unknown;
  proposed_value: unknown;
  evidence_ids: string[];
  risk: string;
  confidence: string;
  expires_at: string;
  requested_by: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
};
```

No approval contract authorizes execution in the current phase.

---

## 6. UI rules

Allowed buttons:

- View evidence
- Mark reviewed
- Dismiss
- Snooze
- Copy
- Export

Prohibited buttons:

- Apply
- Execute
- Change now
- Boost now
- Increase budget
- Lower Target ROI

---

## 7. Global invariant

```text
execution_allowed = false
```

This invariant must be tested in every skill.

<!-- END 94_EXECUTION_AND_APPROVAL_BOUNDARIES.md -->


---

<!-- BEGIN 95_IMPLEMENTATION_ROADMAP.md -->

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

<!-- END 95_IMPLEMENTATION_ROADMAP.md -->
