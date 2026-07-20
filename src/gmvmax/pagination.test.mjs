// Tes CAP PAGINASI (Part 4). node:test. Fixtures sintetis.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAllPages, resolveMaxPages, DEFAULT_MAX_PAGES } from './engine.mjs'
import { runTenantShadow, TENANT_RESULT } from './multiTenant.mjs'

// Provider yang menyajikan `totalPage` halaman (page_info.total_page konstan).
function pageProvider(totalPage, { onPage } = {}) {
  return { async callTool(_tool, { page }) { onPage?.(page); return { list: [{ p: page }], page_info: { total_page: totalPage } } } }
}

test('1. data DI BAWAH cap → paginasi penuh, sukses', async () => {
  const r = await fetchAllPages(pageProvider(3), {}, 'ctx', { maxPages: 200 })
  assert.equal(r.pagesFetched, 3); assert.equal(r.list.length, 3)
})

test('2. TEPAT di cap → sukses (tanpa throw)', async () => {
  const r = await fetchAllPages(pageProvider(5), {}, 'ctx', { maxPages: 5 })
  assert.equal(r.pagesFetched, 5)
})

test('3. DI ATAS cap → MAX_PAGES_EXCEEDED (tanpa truncate diam-diam)', async () => {
  await assert.rejects(() => fetchAllPages(pageProvider(6), {}, 'ctx', { maxPages: 5 }), (e) => e.code === 'MAX_PAGES_EXCEEDED')
})

test('4. env tak valid → INVALID_MAX_PAGES (fail-fast)', () => {
  assert.equal(resolveMaxPages({}), DEFAULT_MAX_PAGES)
  assert.equal(resolveMaxPages({ GMVMAX_MAX_PAGES_PER_REQUEST: '50' }), 50)
  for (const bad of ['abc', '0', '-1', '2.5', '  ']) {
    assert.throws(() => resolveMaxPages({ GMVMAX_MAX_PAGES_PER_REQUEST: bad }), (e) => e.code === 'INVALID_MAX_PAGES', `harus tolak "${bad}"`)
  }
})

test('5. loop inconsistency / total_page patologis (runaway) → dibatasi cap, tak loop selamanya', async () => {
  let calls = 0
  const r = pageProvider(999, { onPage: () => calls++ })
  await assert.rejects(() => fetchAllPages(r, {}, 'ctx', { maxPages: 10 }), (e) => e.code === 'MAX_PAGES_EXCEEDED')
  assert.equal(calls, 10) // berhenti tepat di cap, tak menembak halaman 11+
})

test('6. MAX_PAGES_EXCEEDED merambat → DATA_INCOMPLETE (bukan SUCCESS, tak tulis kanonik)', async () => {
  const deps = {
    fetchRegistryInputs: async () => ({ tenant: { status: 'ELIGIBLE' }, records: [], campaignTypeCounts: { product: 1, live: 0 } }),
    persistRegistry: async () => ({ inserted: 0, updated: 0, changes: 0 }),
    resolveOwner: async () => 'U1',
    runSync: async () => { const e = new Error('MAX_PAGES_EXCEEDED: creative — total_page=300 > cap 200'); e.code = 'MAX_PAGES_EXCEEDED'; throw e },
    now: () => Date.now(), log: () => {},
  }
  const res = await runTenantShadow({ workspaceId: 'WS-A', advertiserId: 'ADV1', storeId: 'STORE1' }, {
    provider: {}, sb: {}, date: '2026-07-20', authorizedAdvertiserIds: ['ADV1'], withCanonical: true, deps,
  })
  assert.equal(res.status, TENANT_RESULT.DATA_INCOMPLETE)
})
