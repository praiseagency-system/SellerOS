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
