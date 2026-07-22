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
