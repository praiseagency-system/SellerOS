import { test } from 'node:test'
import assert from 'node:assert/strict'
import { creativeRowToDb } from './rowMap.mjs'

test('rowMap: camelCase row → kolom snake_case gmvmax_creatives (kontrak DB)', () => {
  const r = { videoId: 'v1', campaignName: 'C', campaignId: 'C1', productId: 'S1', creativeType: 'Video', videoTitle: 't', tiktokAccount: 'A', timePosted: null, status: 'OK', authType: 'AFFILIATE', cost: 10, skuOrders: 1, costPerOrder: 10, grossRevenue: 100, roas: 10, impressions: 5, clicks: 2, ctr: 40, cvr: 20, vr2s: 50, vr6s: 30, vr25: 25, vr50: 20, vr75: 15, vr100: 10, hookTag: 'review' }
  const db = creativeRowToDb('imp1', r)
  assert.equal(db.import_id, 'imp1')
  assert.equal(db.video_id, 'v1')
  assert.equal(db.campaign_id, 'C1')
  assert.equal(db.product_id, 'S1')
  assert.equal(db.gross_revenue, 100)
  assert.equal(db.sku_orders, 1)
  assert.equal(db.vr_2s, 50)
  assert.equal(db.vr_100, 10)
  assert.equal(db.hook_tag, 'review')
  assert.equal(db.raw_data, null)
  // tak boleh membocorkan field camelCase
  assert.equal('videoId' in db, false)
})
