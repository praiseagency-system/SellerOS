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
