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
