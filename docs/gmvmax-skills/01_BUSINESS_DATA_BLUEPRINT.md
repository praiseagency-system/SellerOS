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
