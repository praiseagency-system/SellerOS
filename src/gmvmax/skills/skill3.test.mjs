import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyFacts } from './dailyFacts.mjs'
import { runSkill1 } from './skill1.mjs'
import { runSkill2 } from './skill2.mjs'
import { runSkill3, EventMode, EVENT_TAXONOMY } from './skill3.mjs'
import { creative, canonical, syncMeta, baseInput } from './_fixtures.mjs'

const GEN = '2026-07-21T02:00:00Z'
const bs = { activeAdvertisers: [{ advertiser_id: '7313', role: 'PRIMARY', is_active: true, connection_group_id: 'g1' }] }

function pipeline(inputExtra = {}, s2extra = {}, s3extra = {}) {
  const daily = buildDailyFacts(baseInput([creative()], inputExtra))
  const s1 = runSkill1({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, businessStructure: bs })
  const s2 = runSkill2({ workspaceId: 'ws-A', storeId: 'store-A', date: '2026-07-20', daily, ...s2extra })
  return runSkill3({ dailyFacts: daily, skill1Output: s1, skill2Output: s2, generatedAt: GEN, ...s3extra })
}
const types = (o) => o.events.map(e => e.event_type)

test('01 stable day: no root-cause fields, execution_allowed=false', () => {
  const o = pipeline()
  assert.equal(o.execution_allowed, false)
  for (const e of o.events) { assert.equal(e.candidate_driver, undefined); assert.equal(e.level, undefined) }
})

test('02 structural pagination event', () => {
  const o = pipeline({ canonicalData: canonical([creative()], { paginationComplete: false }) })
  const e = o.events.find(x => x.event_type === 'PAGINATION_INCOMPLETE')
  assert.ok(e); assert.equal(e.mode, EventMode.ACTIVE_STRUCTURAL)
})

test('03 failed-source event', () => {
  const o = pipeline({ syncMetadata: syncMeta({ sourcesFailed: 1, sourcesProcessed: 0 }) })
  assert.ok(types(o).includes('SOURCE_FAILED'))
})

test('04 canonical reconciliation mismatch event', () => {
  const o = pipeline({}, { sourceBreakdown: [{ sourceType: 'ADVERTISER', sourceId: '7313', status: 'OK', grossRevenue: 400000 }] })
  assert.ok(types(o).includes('RECONCILIATION_MISMATCH'))
})

test('05 missing comparison → no trend event, COMPARISON_UNAVAILABLE present', () => {
  const o = pipeline()
  assert.ok(!types(o).includes('GMV_COMPARISON'))
  assert.ok(types(o).includes('COMPARISON_UNAVAILABLE'))
})

test('06 descriptive GMV comparison (INFO, DESCRIPTIVE_ONLY)', () => {
  const o = pipeline({ comparisonData: { previousDay: { grossRevenue: 500000 } } })
  const e = o.events.find(x => x.event_type === 'GMV_COMPARISON')
  assert.ok(e); assert.equal(e.severity, 'INFO'); assert.equal(e.mode, EventMode.DESCRIPTIVE_ONLY)
  assert.equal(e.absolute_change, 100000)
})

test('07 descriptive ROI comparison', () => {
  const o = pipeline({ comparisonData: { previousDay: { roi: 5 } } })
  assert.ok(types(o).includes('ROI_COMPARISON'))
})

test('08 creative-supply comparison', () => {
  const o = pipeline()
  assert.ok(types(o).includes('CREATIVE_SUPPLY_COMPARISON'))
})

test('09 product-health comparison', () => {
  const o = pipeline()
  assert.ok(types(o).includes('PRODUCT_CONTRIBUTION_COMPARISON'))
})

test('10 data-quality events outrank descriptive', () => {
  const o = pipeline({ canonicalData: canonical([creative()], { paginationComplete: false }), comparisonData: { previousDay: { grossRevenue: 500000 } } })
  assert.equal(o.events[0].category, 'DATA_QUALITY')
  assert.ok(['CRITICAL', 'HIGH'].includes(o.events[0].severity))
})

test('11 event deduplication → unique event_ids', () => {
  const o = pipeline({ comparisonData: { previousDay: { grossRevenue: 500000 }, trailing7: { grossRevenue: 400000 } } })
  assert.equal(new Set(o.events.map(e => e.event_id)).size, o.events.length)
})

test('12 maximum event cap enforced', () => {
  const o = pipeline({ comparisonData: { previousDay: { grossRevenue: 500000 } } }, {}, { ruleConfig: { maxEvents: 1 } })
  assert.equal(o.events.length, 1)
  assert.equal(o.truncated, true)
})

test('13 deterministic ordering', () => {
  const a = pipeline({ comparisonData: { previousDay: { grossRevenue: 500000 } } })
  const b = pipeline({ comparisonData: { previousDay: { grossRevenue: 500000 } } })
  assert.deepEqual(a.events.map(e => e.event_id), b.events.map(e => e.event_id))
})

test('14 no root-cause claim (taxonomy has no CONFIRMED/LIKELY driver types)', () => {
  const o = pipeline()
  for (const e of o.events) assert.ok(EVENT_TAXONOMY[e.event_type] !== undefined || e.mode, e.event_type)
  for (const e of o.events) assert.ok(!/penyebab|caused by|driver/i.test(e.description || ''))
})

test('15 execution_allowed=false', () => {
  assert.equal(pipeline().execution_allowed, false)
})
