// GMV Max — SKILL 2 V1: Attribution Reliability Audit (Phase 3A Increment 2A).
// Implements docs/gmvmax-skills/02_ATTRIBUTION_INCREMENTALITY_AUDIT.md
// slice V1_ATTRIBUTION_RELIABILITY_AUDIT (NOT true incrementality).
//
// Pure & deterministic. Assesses how trustworthy reported GMV Max performance is
// and constrains downstream skills. Reduces false certainty. execution_allowed=false.
//
// HARD DEFAULTS (never inferred from ROAS):
//   TRUE_INCREMENTALITY  → NOT_MEASURABLE without valid experiment evidence
//   ORGANIC_OVERLAP      → UNKNOWN/NOT_MEASURABLE without organic/store data
//   CANNIBALIZATION      → UNKNOWN/NOT_MEASURABLE without an approved method
//   LATE_ATTRIBUTION     → UNKNOWN without ≥2 comparable historical snapshots
import { makeSkillOutput, SkillCode, ActionStatus, Severity, Confidence, ScopeType, MeasurementLabel as ML } from './contract.mjs'

// Structural rules that run now (deterministic, no business threshold).
const S2_RULES = ['GMVMAX-S2-COMPLETE-001', 'GMVMAX-S2-PAGINATION-001', 'GMVMAX-S2-RECONCILE-001', 'GMVMAX-S2-LATE-001', 'GMVMAX-S2-INCREMENTAL-001', 'GMVMAX-S2-ORGANIC-001', 'GMVMAX-S2-TRANSITION-001', 'GMVMAX-S2-BLOCK-001', 'GMVMAX-S2-OBSERVE-001', 'GMVMAX-S2-DOWNSTREAM-001']
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)

export function runSkill2(input) {
  const {
    workspaceId, storeId, date, daily,
    priorSnapshots = null, sourceBreakdown = null,
    experimentEvidence = null, organicEvidence = null,
    transition = null, skillVersion = '1.0.0-draft', generatedAt = null,
  } = input || {}

  const st = daily?.structured || {}
  const dq = st.dataQuality || {}
  const b = st.business || {}
  const hasCanonical = st.hasCanonical === true
  const currency = daily?.currency ?? null
  const scopeOk = Boolean(workspaceId && storeId && date) && Boolean(currency) && currency !== 'MIXED'

  const missing = []
  const limitations = []
  const risks = []
  const factsOut = (daily?.facts || []).filter(f => ['gross_revenue', 'cost', 'orders', 'roi'].includes(f.metric))

  // ── 11.1 REPORTED_PERFORMANCE ──────────────────────────────────────────────
  const reported = {
    measurement_status: hasCanonical && isNum(b.grossRevenue) ? ML.MEASURED : ML.UNKNOWN,
    cost: b.cost ?? null, gross_revenue: b.grossRevenue ?? null, orders: b.orders ?? null,
    reported_roi: b.roi ?? null, roi_note: b.roiNote ?? null,
    source_date: date, snapshot_id: st.snapshotId ?? null,
  }

  // ── Completeness components (COMPLETE-001, PAGINATION-001, RECONCILE-001) ───
  const sExp = dq.sourcesExpected, sProc = dq.sourcesProcessed, sFail = dq.sourcesFailed
  const sourceCompletion = (isNum(sExp) && isNum(sProc)) ? (sProc === sExp && (sFail ?? 0) === 0) : null
  const paginationComplete = dq.paginationComplete
  const requiredFieldsComplete = hasCanonical && isNum(b.cost) && isNum(b.grossRevenue) && isNum(b.orders)

  const recon = reconcile(b.grossRevenue, sourceBreakdown)
  if (recon.duplicateIdentity) risks.push('DUPLICATE_IDENTITY_BLOCKS_AGGREGATION')

  let completeness = 'UNKNOWN'
  if (!hasCanonical) { completeness = 'INCOMPLETE'; missing.push('canonical_snapshot') }
  else if (paginationComplete === false || sourceCompletion === false || recon.hardMismatch) completeness = 'INCOMPLETE'
  else if (paginationComplete == null || sourceCompletion == null) completeness = 'UNKNOWN'
  else if (recon.status === 'PASS' && requiredFieldsComplete) completeness = 'COMPLETE'
  else completeness = 'MOSTLY_COMPLETE' // all knowns pass but reconciliation unavailable
  if (recon.status === 'UNKNOWN') missing.push('source_breakdown')

  const data_completeness = {
    classification: completeness,
    sources_expected: sExp ?? null, sources_processed: sProc ?? null, sources_failed: sFail ?? null,
    pagination_complete: paginationComplete ?? null,
    required_fields_complete: requiredFieldsComplete,
    canonical_reconciled: recon.status === 'PASS' ? true : recon.status === 'FAIL' ? false : null,
    reconciliation_delta: recon.delta,
  }

  // ── 11.4 LATE_ATTRIBUTION_RISK (LATE-001) ──────────────────────────────────
  const late = lateAttribution(priorSnapshots, b.grossRevenue, b.cost)
  if (late.risk === 'UNKNOWN' && !priorSnapshots) missing.push('prior_snapshots')

  // ── 11.6 INCREMENTALITY / 11.5 ORGANIC / 11.7 CANNIBALIZATION (defaults) ───
  const hasValidExperiment = validExperiment(experimentEvidence)
  const incrementality = hasValidExperiment ? ML.INFERRED : ML.NOT_MEASURABLE // V1 never claims measured lift
  if (!hasValidExperiment) { missing.push('experiment_evidence'); limitations.push('incrementality sejati TAK TERUKUR tanpa eksperimen') }
  const hasOrganic = organicEvidence && (isNum(organicEvidence.totalStoreRevenue) || isNum(organicEvidence.organicRevenue))
  const organic_overlap = hasOrganic ? ML.INFERRED : ML.UNKNOWN
  const cannibalization = hasOrganic ? 'UNKNOWN' : 'NOT_MEASURABLE'
  if (!hasOrganic) { missing.push('organic_store_data'); limitations.push('overlap organik & kanibalisasi tak terukur tanpa data organik/total-store') }

  // ── Transition awareness (TRANSITION-001) ──────────────────────────────────
  if (transition?.legacyInactive) limitations.push(`transisi advertiser LEGACY (effective_to=${transition.effectiveTo ?? 'n/a'}); mismatch store-list historis ≠ data tak pernah ada`)

  // ── Attribution confidence (13 + 92 §4 conservative aggregation) ───────────
  const factors = confidenceFactors({ hasCanonical, sourceCompletion, paginationComplete, requiredFieldsComplete, recon, late })
  const attribution_confidence = aggregateConfidence(factors, hasCanonical)

  // ── Decision readiness (BLOCK-001, OBSERVE-001) ────────────────────────────
  const blocked =
    !hasCanonical || !scopeOk || recon.hardMismatch || recon.duplicateIdentity ||
    paginationComplete === false || sourceCompletion === false || !requiredFieldsComplete
  if (!scopeOk) risks.push('SCOPE_OR_CURRENCY_UNKNOWN')
  let decision_readiness
  if (blocked) decision_readiness = 'BLOCKED'
  else if (attribution_confidence === Confidence.HIGH && late.risk === 'LOW') decision_readiness = 'READY_FOR_DESCRIPTIVE_ANALYSIS'
  else decision_readiness = 'OBSERVE_ONLY'
  // READY_FOR_AGGRESSIVE_OPTIMIZATION intentionally unreachable (business rules TBD).

  // ── Severity / status ──────────────────────────────────────────────────────
  let severity = Severity.INFO
  if (recon.hardMismatch || (paginationComplete === false)) severity = Severity.CRITICAL
  else if (!hasCanonical || recon.duplicateIdentity) severity = Severity.HIGH
  else if (late.risk === 'MEDIUM' || completeness === 'MOSTLY_COMPLETE') severity = Severity.MEDIUM
  const status = blocked ? ActionStatus.DO_NOT_EXECUTE : ActionStatus.OBSERVE
  const confidence = !hasCanonical ? Confidence.DATA_INSUFFICIENT : attribution_confidence

  // ── Downstream constraints (DOWNSTREAM-001) ────────────────────────────────
  const downstream_constraints = buildConstraints(blocked, decision_readiness, late)

  const out = makeSkillOutput({
    skill_code: SkillCode.S2, skill_version: skillVersion,
    workspace_id: workspaceId, store_id: storeId, date,
    scope_type: ScopeType.STORE, scope_id: storeId,
    currency: currency ?? undefined,
    status, severity, confidence,
    title: 'Attribution Reliability Audit (V1)',
    summary: blocked
      ? `Data belum layak untuk optimasi (${completeness}); keputusan agresif diblokir.`
      : `Keandalan atribusi: ${attribution_confidence}, kesiapan=${decision_readiness}. Incrementality NOT_MEASURABLE (tanpa eksperimen).`,
    facts: factsOut,
    source_snapshot_ids: daily?.source_snapshot_ids || [],
    rule_ids: S2_RULES,
    missing_data: [...new Set(missing)], limitations, risks,
    expires_at: null, generated_at: generatedAt ?? undefined,
  })

  out.attribution_audit = {
    reported_performance: reported,
    data_completeness,
    attribution_confidence,
    late_attribution_risk: late,
    organic_overlap,
    incrementality_confidence: incrementality,
    cannibalization_risk: cannibalization,
    decision_readiness,
  }
  out.downstream_constraints = downstream_constraints
  out.confidence_factors = factors
  return out
}

// IDR has no minor currency unit. `normalizeIdr` rounds a monetary value to
// whole rupiah — a DECIMAL NORMALIZATION for float artifacts, NOT a business
// tolerance. After normalizing BOTH sides, reconciliation compares EXACTLY.
export function normalizeIdr(v) { return Math.round(v) }

// ── Reconciliation with duplicate-identity guard (never blind-sum) ───────────
function reconcile(canonicalRevenue, sourceBreakdown) {
  if (!Array.isArray(sourceBreakdown) || sourceBreakdown.length === 0)
    return { status: 'UNKNOWN', delta: null, hardMismatch: false, duplicateIdentity: false }
  const seen = new Set(); let dup = false
  for (const s of sourceBreakdown) { const k = `${s.sourceType}:${s.sourceId}`; if (seen.has(k)) dup = true; seen.add(k) }
  if (dup) return { status: 'FAIL', delta: null, hardMismatch: false, duplicateIdentity: true }
  const valid = sourceBreakdown.filter(s => s.status !== 'FAILED' && isNum(s.grossRevenue))
  if (valid.length === 0 || !isNum(canonicalRevenue)) return { status: 'UNKNOWN', delta: null, hardMismatch: false, duplicateIdentity: false }
  const sum = valid.reduce((a, s) => a + normalizeIdr(s.grossRevenue), 0)
  const delta = normalizeIdr(canonicalRevenue) - sum
  const pass = delta === 0 // EXACT integer equality — no tolerance until a business rule is approved
  return { status: pass ? 'PASS' : 'FAIL', delta, hardMismatch: !pass, duplicateIdentity: false }
}

// ── Late attribution: needs ≥2 comparable same-date snapshots ────────────────
function lateAttribution(priorSnapshots, currentRevenue, currentCost) {
  if (!Array.isArray(priorSnapshots) || priorSnapshots.length < 1 || !isNum(currentRevenue))
    return { risk: 'UNKNOWN', measurement_label: ML.UNKNOWN, drift_absolute: null, drift_percent: null, comparable_snapshots: Array.isArray(priorSnapshots) ? priorSnapshots.length : 0, note: 'butuh ≥2 snapshot sebanding; jangan simpulkan stabil dari satu snapshot' }
  const sorted = [...priorSnapshots].filter(s => isNum(s.grossRevenue)).sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)))
  if (sorted.length === 0) return { risk: 'UNKNOWN', measurement_label: ML.UNKNOWN, drift_absolute: null, drift_percent: null, comparable_snapshots: 0 }
  const earliest = sorted[0].grossRevenue
  const driftAbs = currentRevenue - earliest
  const driftPct = earliest !== 0 ? driftAbs / earliest : null
  // Directional signal from the rule (revenue rising w/o new spend) — NOT a numeric threshold.
  const costStable = !isNum(currentCost) || sorted.every(s => !isNum(s.cost) || Math.abs((s.cost ?? currentCost) - currentCost) <= Math.max(1, currentCost * 0)) // cost unchanged
  const risk = driftAbs > 0 && costStable ? 'MEDIUM' : driftAbs !== 0 ? 'LOW' : 'LOW'
  return { risk, measurement_label: ML.MEASURED, drift_absolute: driftAbs, drift_percent: driftPct, comparable_snapshots: sorted.length + 1, note: 'ambang magnitudo risiko TBD_BUSINESS_DECISION' }
}

function validExperiment(e) {
  return Boolean(e && e.experimentId && e.design && e.treatmentScope && e.controlScope)
}

// Confidence factors → {factor,status,impact}
function confidenceFactors({ hasCanonical, sourceCompletion, paginationComplete, requiredFieldsComplete, recon, late }) {
  const F = (factor, status, impact) => ({ factor, status, impact })
  return [
    F('canonical_present', hasCanonical ? 'PASS' : 'FAIL', 'HIGH'),
    F('pagination_completeness', paginationComplete === true ? 'PASS' : paginationComplete === false ? 'FAIL' : 'UNKNOWN', 'HIGH'),
    F('expected_source_completion', sourceCompletion === true ? 'PASS' : sourceCompletion === false ? 'FAIL' : 'UNKNOWN', 'HIGH'),
    F('required_field_coverage', requiredFieldsComplete ? 'PASS' : 'FAIL', 'HIGH'),
    F('canonical_reconciliation', recon.status === 'PASS' ? 'PASS' : recon.status === 'FAIL' ? 'FAIL' : 'UNKNOWN', 'HIGH'),
    F('late_attribution_stability', late.risk === 'LOW' ? 'PASS' : late.risk === 'UNKNOWN' ? 'UNKNOWN' : 'WARN', 'MEDIUM'),
  ]
}

// Conservative aggregation (92 §4): FAIL critical → LOW; missing required → DATA_INSUFFICIENT;
// high-impact WARN → cap MEDIUM; HIGH needs all high-impact PASS.
function aggregateConfidence(factors, hasCanonical) {
  if (!hasCanonical) return Confidence.DATA_INSUFFICIENT
  const high = factors.filter(f => f.impact === 'HIGH')
  if (high.some(f => f.status === 'FAIL')) return Confidence.LOW
  if (high.some(f => f.status === 'UNKNOWN')) return Confidence.MEDIUM
  if (factors.some(f => f.status === 'WARN')) return Confidence.MEDIUM
  if (high.every(f => f.status === 'PASS')) return Confidence.HIGH
  return Confidence.MEDIUM
}

function buildConstraints(blocked, readiness, late) {
  const reason = blocked ? 'DATA_INCOMPLETE_OR_UNRECONCILED' : late.risk === 'MEDIUM' ? 'LATE_ATTRIBUTION_RISK_MEDIUM' : 'AGGRESSIVE_STANDARDS_NOT_APPROVED'
  const s5 = blocked ? 'NO_AGGRESSIVE_CHANGE' : 'NO_TARGET_ROI_CHANGE'
  const s6 = blocked ? 'NO_AGGRESSIVE_CHANGE' : 'NO_BUDGET_INCREASE'
  const s9 = blocked ? 'BLOCK_ACTION_PLAN' : 'OBSERVE_ONLY'
  void readiness
  return [
    { target_skill: SkillCode.S5, constraint: s5, reason, expires_at: null },
    { target_skill: SkillCode.S6, constraint: s6, reason, expires_at: null },
    { target_skill: SkillCode.S9, constraint: s9, reason, expires_at: null },
  ]
}
