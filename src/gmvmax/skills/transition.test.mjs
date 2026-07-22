import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateDecisionIntelligence } from './pipeline.mjs'
import { fakeDb, creativeRow } from './_fakeDb.mjs'

const WS = 'c420074f-d4a6-4e6d-bf8e-2d0234b575d7'
const STORE = '7494949073431268328'
const GEN = '2026-07-21T02:00:00Z'
const A7663 = '7663429402298089480', A7214 = '7214793879483170817'

// Build a Dasfelix scenario. `phase` sets the date-effective membership + sync.
function scenario(phase) {
  const primary = { advertiser_id: A7663, advertiser_role: 'PRIMARY', is_active: true, store_id: STORE, priority: 100 }
  const legacyActive = { advertiser_id: A7214, advertiser_role: 'LEGACY', is_active: true, store_id: STORE, priority: 200 }
  const legacyInactive = { advertiser_id: A7214, advertiser_role: 'LEGACY', is_active: false, store_id: STORE, priority: 200, metadata: { effective_to: '2026-07-19', reason: 'ACCOUNT_MIGRATION_COMPLETED' } }
  const map = {
    pre: { date: '2026-07-18', prev: '2026-07-17', adv: [primary, legacyActive], sync: { advertiser_sources_expected: 2, advertiser_sources_succeeded: 2, advertiser_sources_failed: 0, status: 'SUCCESS', parity: 'MATCH', advertiser_lineage: [{ advertiser_id: A7663, status: 'SUCCESS' }, { advertiser_id: A7214, status: 'SUCCESS' }] } },
    transition: { date: '2026-07-19', prev: '2026-07-18', adv: [primary, legacyInactive], sync: { advertiser_sources_expected: 2, advertiser_sources_succeeded: 1, advertiser_sources_failed: 1, status: 'PARTIAL_SUCCESS', parity: 'MISMATCH', advertiser_lineage: [{ advertiser_id: A7663, status: 'SUCCESS' }, { advertiser_id: A7214, status: 'AUTHORIZATION_MISMATCH' }] } },
    post: { date: '2026-07-20', prev: '2026-07-19', adv: [primary, legacyInactive], sync: { advertiser_sources_expected: 1, advertiser_sources_succeeded: 1, advertiser_sources_failed: 0, status: 'SUCCESS', parity: 'MATCH', advertiser_lineage: [{ advertiser_id: A7663, status: 'SUCCESS' }] } },
  }
  const s = map[phase]
  const db = fakeDb({
    imports: { [s.date]: { id: `imp-${s.date}`, currency: 'IDR', created_at: `${s.date}T10:00:00Z` }, [s.prev]: { id: `imp-${s.prev}`, currency: 'IDR', created_at: `${s.prev}T10:00:00Z` } },
    creatives: { [`imp-${s.date}`]: [creativeRow({ cost: 1000000, gross_revenue: 11000000, sku_orders: 70 })], [`imp-${s.prev}`]: [creativeRow({ cost: 1180000, gross_revenue: 12000000, sku_orders: 79 })] },
    syncRun: { run_id: 'r', ...s.sync },
    tenantAdvertisers: s.adv,
  }, WS)
  return { db, date: s.date }
}
async function runPhase(phase) {
  const { db, date } = scenario(phase)
  return generateDecisionIntelligence({ db, workspaceId: WS, storeId: STORE, date, generatedAt: GEN })
}
const active = (r) => r.skill1.blueprint.BUSINESS_STRUCTURE.active_advertisers.map(a => a.advertiser_id)
const historical = (r) => r.skill1.blueprint.BUSINESS_STRUCTURE.historical_advertisers.map(a => a.advertiser_id)

test('01 clean post-migration source model (1/1/0, 7663 only active)', async () => {
  const r = await runPhase('post')
  assert.deepEqual(active(r), [A7663])
  assert.equal(r.skill1.blueprint.DATA_QUALITY.sources_failed, 0)
  assert.ok(!r.skill3.events.some(e => e.event_type === 'SOURCE_FAILED'))
  assert.notEqual(r.skill2.attribution_audit.decision_readiness, 'BLOCKED')
  assert.equal(r.execution_allowed, false)
})

test('02 7214 historical but not current (post-migration)', async () => {
  const r = await runPhase('post')
  assert.ok(!active(r).includes(A7214))
  assert.ok(historical(r).includes(A7214))
})

test('03 transition-date source model (7214 historical; block from real failure)', async () => {
  const r = await runPhase('transition')
  assert.ok(historical(r).includes(A7214)) // lineage retained
  assert.ok(!active(r).includes(A7214))
  assert.equal(r.skill1.blueprint.DATA_QUALITY.sources_failed, 1)
  assert.equal(r.skill2.attribution_audit.decision_readiness, 'BLOCKED') // genuine partial source
})

test('04 pre-migration source model (both active, no block)', async () => {
  const r = await runPhase('pre')
  assert.deepEqual(active(r).sort(), [A7214, A7663].sort())
  assert.equal(r.skill1.blueprint.DATA_QUALITY.sources_failed, 0)
  assert.notEqual(r.skill2.attribution_audit.decision_readiness, 'BLOCKED')
})

test('05 post-migration expected/processed/failed = 1/1/0', async () => {
  const dq = (await runPhase('post')).skill1.blueprint.DATA_QUALITY
  assert.equal(dq.sources_expected, 1)
  assert.equal(dq.sources_processed, 1)
  assert.equal(dq.sources_failed, 0)
})

test('06 AsterixSty control unaffected (single advertiser, clean)', async () => {
  const AWS = '10280d7b-2994-4a40-b639-2d88e0e2018b', ASTORE = '7495201716088572081'
  const db = fakeDb({
    imports: { '2026-07-20': { id: 'a-720', currency: 'IDR', created_at: '2026-07-20T10:00:00Z' } },
    creatives: { 'a-720': [creativeRow()] },
    syncRun: { run_id: 'ar', advertiser_sources_expected: 1, advertiser_sources_succeeded: 1, advertiser_sources_failed: 0, status: 'SUCCESS', parity: 'MATCH', advertiser_lineage: [{ advertiser_id: '7313535999831769090', status: 'SUCCESS' }] },
    tenantAdvertisers: [{ advertiser_id: '7313535999831769090', advertiser_role: 'PRIMARY', is_active: true, store_id: ASTORE, priority: 100 }],
  }, AWS)
  const r = await generateDecisionIntelligence({ db, workspaceId: AWS, storeId: ASTORE, date: '2026-07-20', generatedAt: GEN })
  assert.deepEqual(active(r), ['7313535999831769090'])
  assert.ok(!JSON.stringify(r).includes(A7214) && !JSON.stringify(r).includes(A7663)) // no cross-tenant Dasfelix ids
  assert.equal(r.skill1.blueprint.DATA_QUALITY.sources_failed, 0)
  assert.equal(r.execution_allowed, false)
})
