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
