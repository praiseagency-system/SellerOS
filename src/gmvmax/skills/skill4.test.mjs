import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyFacts } from './dailyFacts.mjs'
import { runSkill2 } from './skill2.mjs'
import { runSkill3 } from './skill3.mjs'
import { runSkill4 } from './skill4.mjs'
import { creative, canonical, baseInput } from './_fixtures.mjs'

const GEN = '2026-07-21T02:00:00Z'
const LEVEL_RANK = { CONFIRMED_DRIVER: 5, LIKELY_DRIVER: 4, CONTRIBUTING_FACTOR: 3, CORRELATED_SIGNAL: 2, INSUFFICIENT_EVIDENCE: 1 }

function pipe(rows, inputExtra = {}, s2extra = {}) {
  const daily = buildDailyFacts(baseInput(rows, inputExtra))
  const s2 = runSkill2({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, ...s2extra })
  const s3 = runSkill3({ dailyFacts: daily, skill2Output: s2, generatedAt: GEN })
  return runSkill4({ dailyFacts: daily, skill2Output: s2, skill3Output: s3, generatedAt: GEN })
}
const drivers = (o) => o.diagnoses.map(d => d.candidate_driver)

test('16 GMV down + spend down → LIKELY delivery/spend', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  const d = o.diagnoses.find(x => x.candidate_driver.includes('delivery/spend'))
  assert.ok(d); assert.equal(d.level, 'LIKELY_DRIVER')
})

test('17 ROI down + CVR down → conversion deterioration', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { roi: 8, cvr: 0.15 } } })
  const d = o.diagnoses.find(x => x.candidate_driver.includes('konversi'))
  assert.ok(d); assert.equal(d.level, 'LIKELY_DRIVER')
})

test('18 GMV up + efficiency down (capital-led, measured)', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 500000, roi: 8, cost: 80000 } } })
  const d = o.diagnoses.find(x => x.candidate_driver.includes('modal'))
  assert.ok(d); assert.equal(d.level, 'CONTRIBUTING_FACTOR')
  assert.match(d.note, /MEASURED/)
})

test('19 creative supply contributing factor', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, deliveringCreatives: 3 } } })
  const d = o.diagnoses.find(x => x.candidate_driver.includes('pasokan kreatif'))
  assert.ok(d); assert.equal(d.level, 'CONTRIBUTING_FACTOR')
})

test('20 spend without orders remains non-causal (CORRELATED)', () => {
  const o = pipe([creative({ skuOrders: 0 })])
  const d = o.diagnoses.find(x => x.observed_outcome.includes('spend tanpa order'))
  assert.ok(d); assert.equal(d.level, 'CORRELATED_SIGNAL')
})

test('21 Skill 2 blocked → nothing above INSUFFICIENT_EVIDENCE', () => {
  const o = pipe([creative()], { canonicalData: canonical([creative()], { paginationComplete: false }), comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  for (const d of o.diagnoses) assert.equal(d.level, 'INSUFFICIENT_EVIDENCE')
})

test('22 incomplete pagination → no confident financial diagnosis', () => {
  const o = pipe([creative()], { canonicalData: canonical([creative()], { paginationComplete: false }), comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  for (const d of o.diagnoses) assert.ok(LEVEL_RANK[d.level] <= LEVEL_RANK.CORRELATED_SIGNAL)
})

test('23 missing CVR → no direct CVR diagnosis', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { roi: 8 } } })
  assert.ok(!drivers(o).some(d => /konversi \(CVR\)/.test(d)))
})

test('24 missing settings history → no Target ROI claim', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  assert.ok(!drivers(o).some(d => /target roi/i.test(d)))
  const d = o.diagnoses.find(x => x.candidate_driver.includes('delivery/spend'))
  assert.ok(d.missing_data.includes('settings_history'))
})

test('25 conflicting evidence surfaces evidence_against', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000, cvr: 0.05 } } })
  const d = o.diagnoses.find(x => x.candidate_driver.includes('delivery/spend'))
  assert.ok(d.evidence_against.length >= 1)
})

test('26 alternatives always present', () => {
  const o = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  for (const d of o.diagnoses) assert.ok(d.alternative_explanations.length >= 1)
})

test('27 unsupported causality never CONFIRMED_DRIVER', () => {
  const o = pipe([creative({ skuOrders: 0 })])
  for (const d of o.diagnoses) assert.notEqual(d.level, 'CONFIRMED_DRIVER')
})

test('28 deterministic ordering', () => {
  const a = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  const b = pipe([creative()], { comparisonData: { previousDay: { grossRevenue: 800000, cost: 150000 } } })
  assert.deepEqual(a.diagnoses.map(d => d.diagnosis_id), b.diagnoses.map(d => d.diagnosis_id))
})

test('29 execution_allowed=false', () => {
  assert.equal(pipe([creative()]).execution_allowed, false)
})
