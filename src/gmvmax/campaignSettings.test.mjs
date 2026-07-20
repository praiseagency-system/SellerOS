import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSettings, diffSettings, fetchCampaignSettings } from './campaignSettings.mjs'

const LIST = { campaign_id: '185', campaign_name: 'GMV MAX | Update ', modify_time: '2026-07-15 08:17:33', create_time: '2026-01-27 07:02:26', operation_status: 'ENABLE', secondary_status: 'CAMPAIGN_STATUS_ENABLE' }
const INFO = { campaign_name: 'GMV MAX | Update ', budget: 100000, roas_bid: 8, deep_bid_type: 'VO_MIN_ROAS', optimization_goal: 'VALUE', billing_event: 'OCPM', operation_status: 'ENABLE', roi_protection_enabled: true, store_id: '749', item_group_ids: ['a', 'b'], shopping_ads_type: 'PRODUCT', schedule_start_time: '2026-01-27 07:02:22', schedule_end_time: '2036-01-25 07:02:22', auto_budget: { current_budget: 100000, maximum_budget: 200000, auto_budget_enabled: true } }

test('normalizeSettings: ambil budget/bid/auto_budget + parse waktu UTC + trim nama', () => {
  const r = normalizeSettings(LIST, INFO, 'PRODUCT_GMV_MAX')
  assert.equal(r.campaign_id, '185')
  assert.equal(r.campaign_name, 'GMV MAX | Update')      // ter-trim
  assert.equal(r.promotion_type, 'PRODUCT_GMV_MAX')
  assert.equal(r.budget, 100000)
  assert.equal(r.roas_bid, 8)
  assert.equal(r.auto_budget.maximum_budget, 200000)
  assert.equal(r.modify_time, '2026-07-15T08:17:33.000Z')
  assert.equal(r.operation_status, 'ENABLE')
  assert.deepEqual(r.item_group_ids, ['a', 'b'])
  assert.ok(r.raw.info && r.raw.list)                     // raw disimpan utuh
})

test('normalizeSettings: field hilang → null, bukan undefined/NaN', () => {
  const r = normalizeSettings({ campaign_id: 'x' }, {}, null)
  assert.equal(r.budget, null)
  assert.equal(r.roas_bid, null)
  assert.equal(r.modify_time, null)
  assert.equal(r.campaign_name, null)
})

test('diffSettings: budget naik → 1 perubahan', () => {
  const prev = [{ campaign_id: '1', campaign_name: 'A', budget: 100000, roas_bid: 8, operation_status: 'ENABLE' }]
  const cur = [{ campaign_id: '1', campaign_name: 'A', budget: 150000, roas_bid: 8, operation_status: 'ENABLE', modify_time: 'T' }]
  const d = diffSettings(prev, cur)
  assert.equal(d.length, 1)
  assert.equal(d[0].field, 'budget'); assert.equal(d[0].from, 100000); assert.equal(d[0].to, 150000)
})

test('diffSettings: tak ada perubahan → kosong', () => {
  const rows = [{ campaign_id: '1', budget: 100000, roas_bid: 8, operation_status: 'ENABLE' }]
  assert.equal(diffSettings(rows, rows).length, 0)
})

test('diffSettings: bid + status berubah bersamaan → 2 entri', () => {
  const prev = [{ campaign_id: '1', budget: 1, roas_bid: 8, operation_status: 'ENABLE' }]
  const cur = [{ campaign_id: '1', budget: 1, roas_bid: 7, operation_status: 'DISABLE' }]
  const d = diffSettings(prev, cur).map(x => x.field).sort()
  assert.deepEqual(d, ['operation_status', 'roas_bid'])
})

test('diffSettings: campaign baru → ditandai _new', () => {
  const d = diffSettings([], [{ campaign_id: '9', campaign_name: 'Baru' }])
  assert.equal(d.length, 1); assert.equal(d[0].field, '_new')
})

test('diffSettings: auto-budget dimatikan → tercatat', () => {
  const prev = [{ campaign_id: '1', auto_budget: { auto_budget_enabled: true } }]
  const cur = [{ campaign_id: '1', auto_budget: { auto_budget_enabled: false } }]
  const d = diffSettings(prev, cur)
  assert.equal(d.length, 1); assert.equal(d[0].field, 'auto_budget_enabled')
})

test('fetchCampaignSettings: 1 call list per tipe + 1 info per campaign', async () => {
  const calls = []
  const provider = { async callTool(name, p) {
    calls.push(name)
    if (name === 'gmv_max_campaign_get') {
      return p.filtering.gmv_max_promotion_types[0] === 'PRODUCT_GMV_MAX'
        ? { list: [LIST], page_info: { total_page: 1 } } : { list: [], page_info: { total_page: 1 } }
    }
    return INFO
  } }
  const rows = await fetchCampaignSettings(provider, { advertiserId: 'a', storeId: 's' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].budget, 100000)
  assert.equal(calls.filter(c => c === 'campaign_gmv_max_info_get').length, 1) // hemat: 1 info/campaign
})
