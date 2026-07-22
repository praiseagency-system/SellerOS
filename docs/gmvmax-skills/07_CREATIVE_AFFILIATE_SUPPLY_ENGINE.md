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
