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
