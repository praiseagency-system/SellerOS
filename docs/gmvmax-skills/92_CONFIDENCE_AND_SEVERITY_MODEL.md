# Confidence and Severity Model

---

## 1. Confidence

```text
HIGH
MEDIUM
LOW
DATA_INSUFFICIENT
```

Confidence evaluates evidence quality, not whether performance is good.

### Factors

- source freshness;
- pagination completeness;
- source completion;
- required-field coverage;
- canonical reconciliation;
- sample size;
- attribution maturity;
- cross-source consistency;
- temporal alignment;
- scope alignment;
- rule evidence coverage;
- experiment quality.

### HIGH

All critical factors pass, no material contradiction, and required sample is satisfied.

### MEDIUM

Usable with known limitations or moderate uncertainty.

### LOW

Material uncertainty, conflicting signals, or weak sample.

### DATA_INSUFFICIENT

Required evidence is absent.

A high ROI does not imply high confidence.

---

## 2. Severity

```text
INFO
LOW
MEDIUM
HIGH
CRITICAL
```

Severity represents business or decision risk.

### CRITICAL

- cross-tenant contamination;
- wrong currency/date scope;
- silent missing source;
- unsafe automatic execution;
- complete output generated from incomplete pagination.

### HIGH

- material source failure;
- hard canonical mismatch;
- duplicate identity blocks aggregation;
- required evidence missing for a risky action.

### MEDIUM

- meaningful efficiency decline;
- moderate late-attribution risk;
- creative/product concentration;
- incomplete optional data affecting interpretation.

### LOW

- minor drift;
- low-materiality issue;
- informational warning.

### INFO

- healthy stable state;
- known limitation correctly disclosed.

---

## 3. Confidence-factor contract

```ts
type ConfidenceFactor = {
  factor_id: string;
  status: "PASS" | "WARN" | "FAIL" | "UNKNOWN";
  impact: "LOW" | "MEDIUM" | "HIGH";
  evidence_ids: string[];
  explanation: string;
};
```

---

## 4. Conservative aggregation

Until numeric weights are approved:

1. Any critical factor `FAIL` → confidence cannot exceed `LOW`.
2. Missing required evidence → `DATA_INSUFFICIENT`.
3. Any high-impact `WARN` → confidence cannot exceed `MEDIUM`.
4. `HIGH` requires every high-impact factor to pass.
5. Skill 2 constraints may cap downstream confidence.

---

## 5. Open decisions

- Numeric weights
- Sample thresholds
- Freshness windows
- Reconciliation tolerance
- Late-attribution thresholds
- Materiality thresholds
- Confidence expiry

All remain `TBD_BUSINESS_DECISION`.
