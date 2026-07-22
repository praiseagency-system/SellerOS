# Execution and Approval Boundaries

---

## 1. Current allowed behavior

- Read canonical data
- Read Feature Registry
- Read campaign settings
- Derive daily facts
- Detect events
- Audit attribution
- Diagnose likely drivers
- Produce recommendations
- Classify action status
- Persist internal outputs
- Mark reviewed
- Dismiss
- Snooze
- Export/copy summaries

---

## 2. Current prohibited behavior

- Change budget
- Change Target ROI
- Activate Max Delivery
- Activate Promotion Days
- Enable Auto Budget Increase
- Boost creatives
- Modify campaigns
- Modify products
- Contact affiliates automatically
- Change commission
- Start or alter LIVE sessions
- Call TikTok mutation endpoints
- Execute `SAFE_TO_EXECUTE`
- Write canonical snapshots from skill code
- Expose service-role credentials
- Modify timers or workers

---

## 3. Approval classes

```text
NO_APPROVAL_NEEDED
REVIEW_REQUIRED
EXPLICIT_APPROVAL_REQUIRED
PROHIBITED
```

Current mapping:

- View evidence → no approval
- Mark reviewed → no approval
- Dismiss/snooze → no approval
- Internal recommendation persistence → no approval
- Budget/ROI/mode/boost/campaign changes → explicit approval required in a future phase
- Automatic execution → prohibited

---

## 4. Future execution prerequisites

Before any production-changing action:

1. Runtime-verified write endpoint
2. Explicit user approval
3. Tenant isolation
4. Audit log
5. Before/after values
6. Bounds
7. Cooldown
8. Idempotency
9. Rollback
10. Kill switch
11. Execution-result verification
12. Failure isolation
13. Rate limiting
14. Secret protection
15. Production observation period

---

## 5. Required fields for future approval

```ts
type ApprovalRequest = {
  approval_id: string;
  workspace_id: string;
  action_id: string;
  action_type: string;
  current_value: unknown;
  proposed_value: unknown;
  evidence_ids: string[];
  risk: string;
  confidence: string;
  expires_at: string;
  requested_by: string;
  approved_by?: string | null;
  approved_at?: string | null;
  rejected_reason?: string | null;
};
```

No approval contract authorizes execution in the current phase.

---

## 6. UI rules

Allowed buttons:

- View evidence
- Mark reviewed
- Dismiss
- Snooze
- Copy
- Export

Prohibited buttons:

- Apply
- Execute
- Change now
- Boost now
- Increase budget
- Lower Target ROI

---

## 7. Global invariant

```text
execution_allowed = false
```

This invariant must be tested in every skill.
