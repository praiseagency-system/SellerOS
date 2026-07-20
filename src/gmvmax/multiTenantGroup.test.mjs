// Phase 2B — multi-advertiser connection groups (merge + lineage + status).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mergeAdvertiserSnapshots, runTenantGroupShadow, buildMeta,
  TENANT_RESULT, REFERENCES_MUTATION_TOOLS,
} from './multiTenant.mjs'

const row = (campaignId, productId, videoId, cost, rev, orders, isSystem = false) =>
  ({ campaignId, productId, videoId, cost, grossRevenue: rev, skuOrders: orders, isSystem })
const snap = (rows) => ({ rows, totals: rows.reduce((t, r) => ({ cost: t.cost + r.cost, revenue: t.revenue + r.grossRevenue, orders: t.orders + r.skuOrders }), { cost: 0, revenue: 0, orders: 0 }), meta: { completeness: 'COMPLETE_WITH_ROWS', pageCount: 1, attributedCount: rows.filter(r => !r.isSystem).length, normalizedRowCount: rows.length, campaignCount: 1 } })

// deps stub: runSync returns a snapshot keyed by advertiserId; registry no-op.
function makeDeps(snapByAdv, { runSyncThrows = {} } = {}) {
  return {
    fetchRegistryInputs: async () => ({ tenant: { status: 'ELIGIBLE' }, records: [], campaignTypeCounts: { product: 1, live: 0 } }),
    persistRegistry: async () => ({ inserted: 0, updated: 0, changes: 0 }),
    resolveOwner: async () => 'user-1',
    runSync: async (_p, { advertiserId }) => { if (runSyncThrows[advertiserId]) { const e = new Error('boom'); e.code = runSyncThrows[advertiserId]; throw e } return snapByAdv[advertiserId] },
    loadOldSnapshot: async () => ({ rows: [] }),
    compareParity: () => ({ status: 'MATCH' }),
    makeRunId: () => 'run-x', now: () => Date.now(), log: () => {},
  }
}
const group = (advertisers) => ({ workspaceId: 'ws-1', storeId: 'store-1', connectionGroupId: 'ws-1', connectionRow: {}, advertisers })
const provFor = (calls = []) => async (connectionId) => { calls.push(connectionId); return { id: connectionId } }

// 1+4+10+11 — distinct creatives from 2 advertisers → combined, summed, lineage
test('merge: distinct creatives combined, totals summed, lineage retained, no dup', () => {
  const m = mergeAdvertiserSnapshots([
    { advertiserId: 'A', role: 'primary', snapshot: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]) },
    { advertiserId: 'B', role: 'legacy', snapshot: snap([row('c2', 'p2', 'v2', 50, 400, 1)]) },
  ])
  assert.equal(m.rows.length, 2)
  assert.deepEqual(m.totals, { cost: 150, revenue: 1400, orders: 3, roas: 1400 / 150 })
  assert.equal(m.duplicates.length, 0)
  assert.equal(m.rows.find(r => r.videoId === 'v1').sourceAdvertiserId, 'A')
  assert.equal(m.rows.find(r => r.videoId === 'v2').sourceRole, 'legacy')
})

// 3+5 — same identity in both advertisers → duplicates detected (no blind sum)
test('merge: identical (campaign,SPU,item) in two advertisers → duplicate flagged', () => {
  const m = mergeAdvertiserSnapshots([
    { advertiserId: 'A', role: 'primary', snapshot: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]) },
    { advertiserId: 'B', role: 'legacy', snapshot: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]) },
  ])
  assert.ok(m.duplicates.length >= 1, 'duplicate identity must be detected')
})

// 2 — two-advertiser tenant succeeds, sources 2/2, merged totals
test('group: two advertisers both OK → SUCCESS, sources 2/2, merged totals', async () => {
  const deps = makeDeps({ A: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]), B: snap([row('c2', 'p2', 'v2', 50, 400, 1)]) })
  const r = await runTenantGroupShadow(group([{ advertiserId: 'A', role: 'primary', connectionId: 'k1' }, { advertiserId: 'B', role: 'legacy', connectionId: 'k1' }]),
    { sb: {}, date: '2026-07-19', deps, withCanonical: true, providerForConnection: provFor() })
  assert.equal(r.status, TENANT_RESULT.SUCCESS)
  assert.equal(r.advertiserSourcesExpected, 2)
  assert.equal(r.advertiserSourcesSucceeded, 2)
  assert.equal(r.advertiserSourcesFailed, 0)
  assert.deepEqual(r.canonicalTotals, { cost: 150, revenue: 1400, orders: 3, roas: 1400 / 150 })
  assert.equal(r.advertiserLineage.length, 2)
})

// 1+15 — single-advertiser tenant unchanged → SUCCESS, sources 1/1
test('group: single advertiser → SUCCESS, sources 1/1 (AsterixSty unchanged path)', async () => {
  const deps = makeDeps({ A: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]) })
  const r = await runTenantGroupShadow(group([{ advertiserId: 'A', role: 'primary', connectionId: 'k1' }]),
    { sb: {}, date: '2026-07-19', deps, withCanonical: true, providerForConnection: provFor() })
  assert.equal(r.status, TENANT_RESULT.SUCCESS)
  assert.equal(r.advertiserSourcesExpected, 1)
  assert.equal(r.advertiserSourcesSucceeded, 1)
})

// 6 — one advertiser token failure → PARTIAL_SUCCESS (not SUCCESS)
test('group: one advertiser provider/token failure → PARTIAL_SUCCESS, failed 1', async () => {
  const deps = makeDeps({ A: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]) })
  const providerForConnection = async (connectionId) => { if (connectionId === 'kBad') throw new Error('token dead'); return { id: connectionId } }
  const r = await runTenantGroupShadow(group([{ advertiserId: 'A', role: 'primary', connectionId: 'k1' }, { advertiserId: 'B', role: 'legacy', connectionId: 'kBad' }]),
    { sb: {}, date: '2026-07-19', deps, withCanonical: true, providerForConnection })
  assert.equal(r.status, TENANT_RESULT.PARTIAL_SUCCESS)
  assert.equal(r.advertiserSourcesFailed, 1)
  assert.equal(r.advertiserLineage.find(l => l.role === 'legacy').status, TENANT_RESULT.TOKEN_FAILED)
})

// 7 — one advertiser pagination failure does not silently pass
test('group: one advertiser DATA_INCOMPLETE (MAX_PAGES) → group not SUCCESS', async () => {
  const deps = makeDeps({ A: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]) }, { runSyncThrows: { B: 'MAX_PAGES_EXCEEDED' } })
  const r = await runTenantGroupShadow(group([{ advertiserId: 'A', role: 'primary', connectionId: 'k1' }, { advertiserId: 'B', role: 'legacy', connectionId: 'k1' }]),
    { sb: {}, date: '2026-07-19', deps, withCanonical: true, providerForConnection: provFor() })
  assert.notEqual(r.status, TENANT_RESULT.SUCCESS)
  assert.equal(r.status, TENANT_RESULT.DATA_INCOMPLETE)
})

// 8 — provider/token isolated per connection (same connectionId → cached once at orchestrator;
//     here: two advertisers on distinct connectionIds → provider requested per connection)
test('group: provider requested per connectionId', async () => {
  const deps = makeDeps({ A: snap([row('c1', 'p1', 'v1', 100, 1000, 2)]), B: snap([row('c2', 'p2', 'v2', 50, 400, 1)]) })
  const calls = []
  await runTenantGroupShadow(group([{ advertiserId: 'A', role: 'primary', connectionId: 'k1' }, { advertiserId: 'B', role: 'legacy', connectionId: 'k2' }]),
    { sb: {}, date: '2026-07-19', deps, withCanonical: true, providerForConnection: provFor(calls) })
  assert.deepEqual(calls.sort(), ['k1', 'k2'])
})

// 12 — mutation tools remain unused
test('group: module never references mutation tools', () => {
  assert.equal(REFERENCES_MUTATION_TOOLS, false)
})

// 14 — git SHA / release metadata recorded
test('buildMeta: records git_sha/release/checksum from env', () => {
  const m = buildMeta({ GMVMAX_GIT_SHA: 'abc1234', GMVMAX_RELEASE_ID: 'rel-1', GMVMAX_BUNDLE_CHECKSUM: 'deadbeef' })
  assert.equal(m.gitSha, 'abc1234'); assert.equal(m.releaseId, 'rel-1'); assert.equal(m.bundleChecksum, 'deadbeef')
  assert.equal(buildMeta({}).gitSha, null)
})
