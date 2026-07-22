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
