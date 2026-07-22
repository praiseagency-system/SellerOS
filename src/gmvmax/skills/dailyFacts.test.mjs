import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildDailyFacts } from './dailyFacts.mjs'
import { MeasurementLabel as ML } from './contract.mjs'
import { creative, canonical, syncMeta, baseInput } from './_fixtures.mjs'

const factOf = (d, metric) => d.facts.find(f => f.metric === metric)

test('01 complete healthy facts', () => {
  const d = buildDailyFacts(baseInput([creative()]))
  assert.equal(factOf(d, 'gross_revenue').value, 600000)
  assert.equal(factOf(d, 'gross_revenue').measurement_label, ML.MEASURED)
  assert.equal(factOf(d, 'cost').value, 100000)
  assert.equal(factOf(d, 'orders').value, 10)
})

test('02 missing metric remains null (not 0)', () => {
  const d = buildDailyFacts(baseInput([creative({ impressions: null })]))
  assert.equal(factOf(d, 'impressions').value, null)
  assert.equal(factOf(d, 'impressions').measurement_label, ML.UNKNOWN)
  assert.equal(factOf(d, 'ctr').value, null) // clicks/null impressions
})

test('03 legitimate zero remains zero', () => {
  const d = buildDailyFacts(baseInput([creative({ skuOrders: 0 })]))
  assert.equal(factOf(d, 'orders').value, 0)
  assert.equal(factOf(d, 'orders').measurement_label, ML.MEASURED)
})

test('04 ROI calculation', () => {
  const d = buildDailyFacts(baseInput([creative({ cost: 100000, grossRevenue: 600000 })]))
  assert.equal(factOf(d, 'roi').value, 6)
  assert.equal(factOf(d, 'roi').measurement_label, ML.DERIVED)
})

test('05 zero cost with revenue → ROI undefined, not infinity', () => {
  const d = buildDailyFacts(baseInput([creative({ cost: 0, grossRevenue: 600000 })]))
  assert.equal(factOf(d, 'roi').value, null)
  assert.equal(factOf(d, 'roi').measurement_label, ML.NOT_MEASURABLE)
  assert.match(factOf(d, 'roi').notes, /ZERO_COST/)
})

test('06 comparison unavailable → delta null/unknown', () => {
  const d = buildDailyFacts(baseInput([creative()]))
  assert.equal(factOf(d, 'cmp.previous_day.gross_revenue.delta').value, null)
  assert.equal(factOf(d, 'cmp.previous_day.gross_revenue.delta').measurement_label, ML.UNKNOWN)
})

test('07 previous-day comparison', () => {
  const d = buildDailyFacts(baseInput([creative()], { comparisonData: { previousDay: { grossRevenue: 500000 } } }))
  assert.equal(factOf(d, 'cmp.previous_day.gross_revenue.delta').value, 100000)
  assert.equal(factOf(d, 'cmp.previous_day.gross_revenue.pct').value, 0.2)
})

test('08 trailing average comparison', () => {
  const d = buildDailyFacts(baseInput([creative()], { comparisonData: { trailing7: { grossRevenue: 400000 } } }))
  assert.equal(factOf(d, 'cmp.trailing7_avg.gross_revenue.delta').value, 200000)
})

test('09 incomplete pagination surfaced', () => {
  const d = buildDailyFacts(baseInput([creative()], { canonicalData: canonical([creative()], { paginationComplete: false }) }))
  assert.equal(factOf(d, 'pagination_complete').value, false)
})

test('10 failed source surfaced', () => {
  const d = buildDailyFacts(baseInput([creative()], { syncMetadata: syncMeta({ sourcesFailed: 1, sourcesProcessed: 0 }) }))
  assert.equal(factOf(d, 'sources_failed').value, 1)
})

test('11 source lineage count reflects advertiser lineage', () => {
  const d = buildDailyFacts(baseInput([creative()], { syncMetadata: syncMeta({ advertiserLineage: [{ advertiser_id: '7663', role: 'PRIMARY' }, { advertiser_id: '7214', role: 'LEGACY', is_active: false }] }) }))
  assert.equal(factOf(d, 'source_lineage_count').value, 2)
})

test('12 workspace isolation: workspace_id carried, scope in fact_id', () => {
  const a = buildDailyFacts(baseInput([creative()], { workspaceId: 'ws-A', storeId: 'store-A' }))
  const b = buildDailyFacts(baseInput([creative()], { workspaceId: 'ws-B', storeId: 'store-B' }))
  assert.equal(a.workspace_id, 'ws-A')
  assert.equal(b.workspace_id, 'ws-B')
  assert.ok(a.facts[0].fact_id.includes('store-A'))
  assert.ok(b.facts[0].fact_id.includes('store-B'))
})

test('13 deterministic: identical facts across runs', () => {
  const i = baseInput([creative()])
  assert.deepEqual(buildDailyFacts(i).facts, buildDailyFacts(i).facts)
})

test('14 idempotent rerun (full output stable)', () => {
  const i = baseInput([creative()])
  assert.equal(JSON.stringify(buildDailyFacts(i)), JSON.stringify(buildDailyFacts(i)))
})
