# Data Dependency Matrix

Legend:

```text
REQUIRED
OPTIONAL
DERIVED
NOT_USED
NOT_AVAILABLE
```

| Data source | S1 | S2 | S3 | S4 | S5 | S6 | S7 | S8 | S9 |
|---|---|---|---|---|---|---|---|---|---|
| Canonical daily performance | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | DERIVED |
| Sync-run metadata | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | DERIVED |
| Campaign settings | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | DERIVED |
| Feature Registry | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | DERIVED |
| Creative performance | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED | OPTIONAL | DERIVED |
| Product performance | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | DERIVED |
| Affiliate data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | NOT_USED | OPTIONAL | REQUIRED | NOT_USED | DERIVED |
| LIVE data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | DERIVED |
| Attribution metadata | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | REQUIRED | REQUIRED | OPTIONAL | REQUIRED | DERIVED |
| Experiment tracker | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | OPTIONAL | DERIVED |
| Approval history | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | REQUIRED |
| Margin/break-even data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | DERIVED |
| Organic/total-store data | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | NOT_USED | OPTIONAL | DERIVED |
| Historical settings | OPTIONAL | OPTIONAL | OPTIONAL | REQUIRED | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | DERIVED |
| Source advertiser lineage | REQUIRED | REQUIRED | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | OPTIONAL | DERIVED |

---

## Required-data failure behavior

### Skill 1

Missing identity, timezone, currency, or canonical snapshot → `BLOCKED`.

### Skill 2

Missing canonical snapshot → `BLOCKED`.

Missing prior versions → late-attribution analysis `UNKNOWN`, not entire skill blocked.

### Skill 3

Missing comparison windows → current facts available, trend events partial.

### Skill 4

Missing evidence → `INSUFFICIENT_EVIDENCE`.

### Skill 5

Missing settings, attribution confidence, or minimum sample → `DO_NOT_CHANGE`.

### Skill 6

Missing break-even or capital limits → no aggressive allocation.

### Skill 7

Missing experiment tracker → supply facts available; winner/fatigue conclusions partial.

### Skill 8

Missing LIVE session data → `BLOCKED`.

### Skill 9

May operate with partial upstream skills, but must expose the missing capability and avoid unsupported actions.
