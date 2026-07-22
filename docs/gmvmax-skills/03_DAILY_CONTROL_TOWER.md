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
