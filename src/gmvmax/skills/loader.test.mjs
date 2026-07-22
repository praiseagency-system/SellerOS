import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadDecisionInputs } from './loader.mjs'
import { fakeDb, creativeRow } from './_fakeDb.mjs'

const WS = '10280d7b-2994-4a40-b639-2d88e0e2018b'
const base = (seed) => ({ db: fakeDb(seed, WS), workspaceId: WS, storeId: 'store-A', date: '2026-07-20' })

test('16 workspace filter required', async () => {
  await assert.rejects(() => loadDecisionInputs({ ...base(), workspaceId: undefined }), /LOADER_BAD_ARGS/)
  await assert.rejects(() => loadDecisionInputs({ ...base(), workspaceId: 'not-a-uuid' }), /LOADER_BAD_ARGS/)
})

test('17 date filter required', async () => {
  await assert.rejects(() => loadDecisionInputs({ ...base(), date: undefined }), /LOADER_BAD_ARGS/)
  await assert.rejects(() => loadDecisionInputs({ ...base(), date: '20-7-2026' }), /LOADER_BAD_ARGS/)
})

test('18 missing canonical handled', async () => {
  const r = await loadDecisionInputs(base({ imports: {} }))
  assert.equal(r.canonicalData, null)
  assert.ok(r.missing_inputs.includes('canonical_snapshot'))
})

test('19 null preserved (missing metric stays null, not 0)', async () => {
  const r = await loadDecisionInputs(base({ imports: { '2026-07-20': { id: 'imp-1', currency: 'IDR', created_at: 'x' } }, creatives: { 'imp-1': [creativeRow({ cost: null, impressions: null })] } }))
  assert.equal(r.canonicalData.creatives[0].cost, null)
  assert.equal(r.canonicalData.creatives[0].impressions, null)
})

test('20 stable ordering (creative order preserved)', async () => {
  const rows = [creativeRow({ video_id: 'a' }), creativeRow({ video_id: 'b' }), creativeRow({ video_id: 'c' })]
  const r = await loadDecisionInputs(base({ imports: { '2026-07-20': { id: 'imp-1', currency: 'IDR', created_at: 'x' } }, creatives: { 'imp-1': rows } }))
  assert.deepEqual(r.canonicalData.creatives.map(c => c.videoId), ['a', 'b', 'c'])
})

test('21 inactive LEGACY lineage retained but not active', async () => {
  const r = await loadDecisionInputs(base({ tenantAdvertisers: [
    { advertiser_id: '7663', advertiser_role: 'PRIMARY', is_active: true, store_id: 'store-A', priority: 100 },
    { advertiser_id: '7214', advertiser_role: 'LEGACY', is_active: false, store_id: 'store-A', priority: 200, metadata: { effective_to: '2026-07-19' } },
  ] }))
  const legacy = r.businessStructure.activeAdvertisers.find(a => a.advertiser_id === '7214')
  assert.ok(legacy) // retained in lineage
  assert.equal(legacy.is_active, false) // but not active
})

test('22 cross-workspace isolation: every db call uses the requested workspace', async () => {
  const b = base()
  await loadDecisionInputs(b)
  assert.ok(b.db.calls.length > 0)
  for (const [, w] of b.db.calls) assert.equal(w, WS)
})
