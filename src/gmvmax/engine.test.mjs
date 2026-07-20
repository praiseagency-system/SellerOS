// Engine test dengan FakeProvider deterministik (tanpa jaringan). Menguji:
// paginasi-merge, reconcile, guard duplikat (fail-explicit). Butuh bundle (xlsx).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runSync } from './engine.mjs'

// FakeProvider: mengembalikan respons kaleng berdasar (tool, dims, filter, page).
function makeProvider(spec) {
  return {
    auth: () => ({ state: 'AUTH_VALID' }), assertAuth: () => {},
    async callTool(tool, p) {
      if (tool === 'gmv_max_campaign_get') {
        const type = p.filtering.gmv_max_promotion_types[0]
        return type === 'PRODUCT_GMV_MAX'
          ? { list: [{ campaign_id: 'C1', campaign_name: 'Camp One' }], page_info: { total_page: 1 } }
          : { list: [], page_info: { total_page: 1 } }
      }
      const dims = p.dimensions
      if (dims.includes('campaign_id')) return { list: [{ dimensions: { campaign_id: 'C1' }, metrics: { cost: '300', gross_revenue: '2060', orders: '5' } }], page_info: { total_page: 1 } }
      if (dims.includes('item_group_id')) return { list: [{ dimensions: { item_group_id: 'S1' }, metrics: { cost: '300' } }], page_info: { total_page: 1 } }
      if (dims.includes('item_id')) return spec.creative(p.page)
      throw new Error('unexpected ' + tool)
    },
  }
}

test('engine: paginasi-merge + reconcile → total = campaignTotal', async () => {
  const provider = makeProvider({
    creative: (page) => page === 1
      ? { list: [
          { dimensions: { item_id: '-1' }, metrics: { cost: '100', gross_revenue: '60', shop_content_type: 'PRODUCT_CARD', title: '0', tt_account_name: '0' } },
          { dimensions: { item_id: 'v1' }, metrics: { cost: '120', gross_revenue: '1200', orders: '3', shop_content_type: 'VIDEO', tt_account_name: 'A', title: 'x' } },
        ], page_info: { total_page: 2, page: 1 } }
      : { list: [
          { dimensions: { item_id: 'v2' }, metrics: { cost: '80', gross_revenue: '800', orders: '2', shop_content_type: 'VIDEO', tt_account_name: 'B', title: 'y' } },
        ], page_info: { total_page: 2, page: 2 } },
  })
  const res = await runSync(provider, { advertiserId: 'ADV', storeId: 'S', date: '2026-07-08' })
  // attributed v1,v2 (2) + 1 reconciliation = 3
  assert.equal(res.rows.length, 3)
  // total = campaignTotal (cost 300, rev 2060)
  assert.equal(res.totals.cost, 300)
  assert.equal(res.totals.revenue, 2060)
  const recon = res.rows.find(r => r.isSystem)
  assert.equal(recon.cost, 100) // residual = 300 − (120+80)
  assert.equal(recon.grossRevenue, 60) // 2060 − (1200+800)
  assert.equal(res.meta.campaignCount, 1)
  assert.equal(res.meta.rawRowCount, 3) // -1 + v1 + v2
  assert.equal(res.meta.completeness, 'COMPLETE_WITH_ROWS')
})

test('engine: DUPLICATE_ROWS → fail-explicit (identity kanonik dobel)', async () => {
  const provider = makeProvider({
    creative: () => ({ list: [
      { dimensions: { item_id: 'v1' }, metrics: { cost: '120', gross_revenue: '1200', orders: '3', shop_content_type: 'VIDEO', tt_account_name: 'A', title: 'x' } },
      { dimensions: { item_id: 'v1' }, metrics: { cost: '120', gross_revenue: '1200', orders: '3', shop_content_type: 'VIDEO', tt_account_name: 'A', title: 'x' } },
    ], page_info: { total_page: 1 } }),
  })
  await assert.rejects(() => runSync(provider, { advertiserId: 'ADV', storeId: 'S', date: '2026-07-08' }), /DUPLICATE_ROWS/)
})

test('P2.1 incomplete pagination (page 2 gagal fetch) → run FAILS, tak ada snapshot', async () => {
  const provider = makeProvider({
    creative: (page) => {
      if (page === 2) throw new Error('network drop pada halaman 2')
      return { list: [{ dimensions: { item_id: 'v1' }, metrics: { cost: '10', gross_revenue: '0', orders: '0', shop_content_type: 'VIDEO', tt_account_name: 'A', title: 'x' } }], page_info: { total_page: 2, page: 1 } }
    },
  })
  let result = null
  await assert.rejects(async () => { result = await runSync(provider, { advertiserId: 'ADV', storeId: 'S', date: '2026-07-08' }) })
  assert.equal(result, null) // tak ada hasil → tak ada snapshot ditulis
})

test('engine: campaign tanpa spend (discovery kosong) → snapshot kosong, bukan error', async () => {
  const provider = {
    auth: () => ({ state: 'AUTH_VALID' }), assertAuth: () => {},
    async callTool(tool, p) {
      if (tool === 'gmv_max_campaign_get') return { list: [], page_info: { total_page: 1 } }
      if (p.dimensions.includes('campaign_id')) return { list: [{ dimensions: { campaign_id: 'C9' }, metrics: { cost: '0' } }], page_info: { total_page: 1 } }
      return { list: [], page_info: { total_page: 1 } }
    },
  }
  const res = await runSync(provider, { advertiserId: 'ADV', storeId: 'S', date: '2026-07-08' })
  assert.equal(res.rows.length, 0)
  assert.equal(res.meta.campaignCount, 0)
  assert.equal(res.meta.completeness, 'COMPLETE_ZERO_DATA') // sukses penuh & kosong = zero-data sah
})
