import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyFacts } from './dailyFacts.mjs'
import { runSkill2, normalizeIdr } from './skill2.mjs'
import { validateSkillOutput, SkillCode, MeasurementLabel as ML } from './contract.mjs'
import { creative, canonical, syncMeta, baseInput } from './_fixtures.mjs'

function run(canonExtra = {}, s2extra = {}, inputExtra = {}) {
  const daily = buildDailyFacts(baseInput([creative()], { canonicalData: canonical([creative()], canonExtra), ...inputExtra }))
  return runSkill2({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, ...s2extra })
}
const audit = (o) => o.attribution_audit

test('22 complete stable snapshot → HIGH confidence, descriptive-ready', () => {
  const o = run({}, {
    sourceBreakdown: [{ sourceType: 'ADVERTISER', sourceId: '7313', status: 'OK', grossRevenue: 600000 }],
    priorSnapshots: [{ observedAt: '2026-07-20T06:00:00Z', grossRevenue: 600000, cost: 100000 }],
  })
  assert.equal(audit(o).attribution_confidence, 'HIGH')
  assert.equal(audit(o).decision_readiness, 'READY_FOR_DESCRIPTIVE_ANALYSIS')
})

test('23 missing canonical → DATA_INSUFFICIENT + BLOCKED + HIGH severity', () => {
  const daily = buildDailyFacts({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', canonicalData: null })
  const o = runSkill2({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily })
  assert.equal(o.confidence, 'DATA_INSUFFICIENT')
  assert.equal(audit(o).decision_readiness, 'BLOCKED')
  assert.equal(o.severity, 'HIGH')
})

test('24 pagination incomplete → INCOMPLETE + blocked + CRITICAL', () => {
  const o = run({ paginationComplete: false })
  assert.equal(audit(o).data_completeness.classification, 'INCOMPLETE')
  assert.equal(audit(o).decision_readiness, 'BLOCKED')
  assert.equal(o.severity, 'CRITICAL')
})

test('25 failed expected source → INCOMPLETE + blocked', () => {
  const o = run({}, {}, { syncMetadata: syncMeta({ sourcesFailed: 1, sourcesProcessed: 0 }) })
  assert.equal(audit(o).data_completeness.classification, 'INCOMPLETE')
  assert.equal(audit(o).decision_readiness, 'BLOCKED')
})

test('26 reconciliation match → reconciled true, delta 0', () => {
  const o = run({}, { sourceBreakdown: [{ sourceType: 'ADVERTISER', sourceId: '7313', status: 'OK', grossRevenue: 600000 }] })
  assert.equal(audit(o).data_completeness.canonical_reconciled, true)
  assert.equal(audit(o).data_completeness.reconciliation_delta, 0)
})

test('26b normalizeIdr rounds to whole rupiah (decimal normalization, not tolerance)', () => {
  assert.equal(normalizeIdr(600000.4), 600000)
  assert.equal(normalizeIdr(600000.5), 600001)
})

test('26c reconciliation is EXACT: 1-rupiah difference fails', () => {
  const o = run({}, { sourceBreakdown: [{ sourceType: 'ADVERTISER', sourceId: '7313', status: 'OK', grossRevenue: 600001 }] })
  assert.equal(audit(o).data_completeness.canonical_reconciled, false)
  assert.equal(audit(o).data_completeness.reconciliation_delta, -1)
})

test('27 reconciliation mismatch → blocked + CRITICAL', () => {
  const o = run({}, { sourceBreakdown: [{ sourceType: 'ADVERTISER', sourceId: '7313', status: 'OK', grossRevenue: 400000 }] })
  assert.equal(audit(o).data_completeness.canonical_reconciled, false)
  assert.equal(audit(o).decision_readiness, 'BLOCKED')
  assert.equal(o.severity, 'CRITICAL')
})

test('28 historical drift available → measured', () => {
  const o = run({}, { priorSnapshots: [{ observedAt: '2026-07-20T06:00:00Z', grossRevenue: 500000, cost: 100000 }] })
  assert.equal(audit(o).late_attribution_risk.measurement_label, ML.MEASURED)
  assert.equal(audit(o).late_attribution_risk.drift_absolute, 100000)
})

test('29 historical drift unavailable → UNKNOWN', () => {
  const o = run()
  assert.equal(audit(o).late_attribution_risk.risk, 'UNKNOWN')
  assert.ok(o.missing_data.includes('prior_snapshots'))
})

test('30 no experiment → incrementality NOT_MEASURABLE', () => {
  const o = run()
  assert.equal(audit(o).incrementality_confidence, ML.NOT_MEASURABLE)
})

test('31 organic data missing → overlap UNKNOWN, cannibalization NOT_MEASURABLE', () => {
  const o = run()
  assert.equal(audit(o).organic_overlap, ML.UNKNOWN)
  assert.equal(audit(o).cannibalization_risk, 'NOT_MEASURABLE')
})

test('32 zero cost with revenue → reported ROI undefined note', () => {
  const daily = buildDailyFacts(baseInput([creative({ cost: 0, grossRevenue: 600000 })]))
  const o = runSkill2({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily })
  assert.equal(audit(o).reported_performance.reported_roi, null)
  assert.match(audit(o).reported_performance.roi_note, /ZERO_COST/)
})

test('33 constraint to Skill 5 present', () => {
  const o = run()
  assert.ok(o.downstream_constraints.find(c => c.target_skill === SkillCode.S5))
})

test('34 constraint to Skill 6 present', () => {
  const o = run()
  assert.ok(o.downstream_constraints.find(c => c.target_skill === SkillCode.S6))
})

test('35 constraint to Skill 9 present', () => {
  const o = run()
  assert.ok(o.downstream_constraints.find(c => c.target_skill === SkillCode.S9))
})

test('36 execution_allowed=false + valid output', () => {
  const o = run()
  assert.equal(o.execution_allowed, false)
  assert.equal(validateSkillOutput(o).ok, true, validateSkillOutput(o).errors.join(','))
})
