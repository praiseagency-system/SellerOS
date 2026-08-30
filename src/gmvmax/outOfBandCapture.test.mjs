import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSession, fetchSessionItemIds, fetchBoostSessions } from './outOfBandCapture.mjs'

// Bentuk respons TERVERIFIKASI runtime 2026-08-31 (advertiser 7313535999831769090):
// _list_get TIDAK membawa item_id; _get (session_ids jamak) membawanya.
const LIST_ROW = {
  session_id: '1874789051430481', bid_type: 'CREATIVE_NO_BID', budget: 50000,
  campaign_id: '1836106675381377', product_list: [{ spu_id: '1731519207014237361' }],
  schedule_start_time: '2026-08-28 18:30:08', schedule_end_time: '2036-08-25 18:30:08',
}

function fakeProvider({ detail = true, detailThrows = false } = {}) {
  const calls = []
  return {
    calls,
    async callTool(tool, params) {
      calls.push({ tool, params })
      if (tool === 'gmv_max_campaign_get') {
        return params.filtering.gmv_max_promotion_types[0] === 'PRODUCT_GMV_MAX'
          ? { list: [{ campaign_id: '1836106675381377', campaign_name: 'Exotic Blue GMV Max' }], page_info: { total_page: 1 } }
          : { list: [], page_info: { total_page: 1 } }
      }
      if (tool === 'campaign_gmv_max_session_list_get') return { session_list: [LIST_ROW] }
      if (tool === 'campaign_gmv_max_session_get') {
        if (detailThrows) throw new Error('rate limit exceeded')
        return detail
          ? { session_list: [{ ...LIST_ROW, item_id: '7678526103316712725' }] }
          : { session_list: [] }
      }
      throw new Error(`tool tak terduga: ${tool}`)
    },
  }
}

test('potret: daftar sesi saja tidak punya item_id (itulah lubangnya)', () => {
  const n = normalizeSession(LIST_ROW, { advertiserId: '1', campaignId: '2', campaignName: 'X' })
  assert.equal(n.item_id, null)
  assert.equal(n.spu_id, '1731519207014237361')
  assert.equal(n.schedule_start_time, '2026-08-28T18:30:08.000Z')
})

test('potret: endpoint detail mengisi item_id per sesi', async () => {
  const p = fakeProvider()
  const map = await fetchSessionItemIds(p, { advertiserId: '1', campaignId: '2', sessionIds: ['1874789051430481'] })
  assert.equal(map.get('1874789051430481'), '7678526103316712725')
  assert.equal(p.calls[0].params.session_ids.length, 1, 'session_ids JAMAK — satu panggilan per campaign')
})

test('potret: campaign tanpa sesi aktif tidak memanggil endpoint detail', async () => {
  const p = fakeProvider()
  const map = await fetchSessionItemIds(p, { advertiserId: '1', campaignId: '2', sessionIds: [] })
  assert.equal(map.size, 0)
  assert.equal(p.calls.length, 0, 'kuota API tak dibuang untuk campaign yang sepi')
})

test('potret: sesi tergabung dgn item_id-nya', async () => {
  const rows = await fetchBoostSessions(fakeProvider(), { advertiserId: '1', storeId: 'S' })
  assert.equal(rows.length, 1)
  assert.equal(rows[0].item_id, '7678526103316712725')
  assert.equal(rows[0].campaign_name, 'Exotic Blue GMV Max')
})

test('potret: detail gagal → sesi TETAP terpotret, cuma tanpa item_id', async () => {
  const rows = await fetchBoostSessions(fakeProvider({ detailThrows: true }), { advertiserId: '1', storeId: 'S' })
  assert.equal(rows.length, 1, 'kehilangan item_id tak boleh menghilangkan sesinya')
  assert.equal(rows[0].item_id, null)
})
